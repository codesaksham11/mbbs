document.addEventListener('DOMContentLoaded', () => {
    console.log("k_quiz.js: DOMContentLoaded fired.");

    // Get DOM elements
    const timerEl = document.getElementById('timer');
    const questionsContainerEl = document.getElementById('questionsContainer');
    const submitButton = document.getElementById('submitButton');
    const quizContentEl = document.getElementById('quizContent');
    const loadingMessageEl = document.getElementById('loadingMessage');
    const errorMessageEl = document.getElementById('errorMessage');

    // Ensure critical DOM elements are found
    if (!loadingMessageEl) console.error("k_quiz.js CRITICAL: loadingMessageEl not found!");
    if (!quizContentEl) console.error("k_quiz.js CRITICAL: quizContentEl not found!");
    if (!errorMessageEl) console.error("k_quiz.js CRITICAL: errorMessageEl not found!");
    if (!questionsContainerEl) console.error("k_quiz.js CRITICAL: questionsContainerEl not found!");
    if (!submitButton) console.error("k_quiz.js CRITICAL: submitButton not found!");

    // --- Configuration for Subject Categories and Proportions ---
    const CATEGORY_CONFIG = [
        { name: "physics", proportion: 0.25, order: 1 },
        { name: "chemistry", proportion: 0.25, order: 2 },
        { name: "botany", proportion: 0.20, order: 3 },
        { name: "zoology", proportion: 0.20, order: 4 }, // Primary remainder target
        { name: "mat", proportion: 0.10, order: 5 }
    ].sort((a, b) => a.order - b.order); // Ensure sorted by display order

    const PRIMARY_REMAINDER_CATEGORY = "zoology"; // Subject name (lowercase)

    let allQuestions = [];
    let selectedQuestions = [];
    let userAnswers = [];
    let timeLeft = 0;
    let timerInterval;
    let startTime = 0;
    let quizTimeMinutes = 0; // Will be loaded from localStorage
    let numQuestionsToAsk = 0; // Will be loaded from localStorage

    // --- showError Function ---
    function showError(message) {
        console.error("k_quiz.js - SHOW_ERROR CALLED:", message);
        if (timerInterval) clearInterval(timerInterval);
        if (loadingMessageEl) loadingMessageEl.style.display = 'none';
        if (quizContentEl) quizContentEl.style.display = 'none';
        if (errorMessageEl) {
            errorMessageEl.innerHTML = message + ' Please <a href="k.html">go back</a>, check console, and try again.';
            errorMessageEl.style.display = 'block';
        } else {
            alert("Quiz Error: " + message + ". Check console.");
        }
    }

    // --- Helper Functions ---
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            if (unsafe === null || typeof unsafe === 'undefined') return '';
            return String(unsafe);
        }
        return unsafe
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, """)
            .replace(/'/g, "'");
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // --- Question Selection Logic ---
    function selectCategorizedQuestions(allQs, totalToSelect, categorySpecs, primaryRemainderCatName) {
        if (totalToSelect === 0 || !allQs || allQs.length === 0) {
            console.log("k_quiz.js: selectCategorizedQuestions - No questions to select or none available.");
            return [];
        }

        const questionsBySubject = {};
        allQs.forEach(q => {
            // IMPORTANT: Expects Subject names in data to be lowercase, e.g., "physics"
            const subject = (q.Subject || 'uncategorized').toLowerCase();
            if (!questionsBySubject[subject]) {
                questionsBySubject[subject] = [];
            }
            questionsBySubject[subject].push(q);
        });

        for (const subject in questionsBySubject) {
            shuffleArray(questionsBySubject[subject]); // Shuffle available questions within each subject
        }

        let numWantedPerSubject = {};
        let totalAllocatedProportionally = 0;

        categorySpecs.forEach(spec => {
            const subjectKey = spec.name.toLowerCase();
            numWantedPerSubject[subjectKey] = Math.floor(totalToSelect * spec.proportion);
            totalAllocatedProportionally += numWantedPerSubject[subjectKey];
        });

        let remainderToDistribute = totalToSelect - totalAllocatedProportionally;
        
        // Distribute remainder to the primary remainder category first
        const primaryCatKey = primaryRemainderCatName.toLowerCase();
        if (remainderToDistribute > 0 && questionsBySubject[primaryCatKey]) {
            const currentWantedInPrimary = numWantedPerSubject[primaryCatKey] || 0;
            const availableInPrimary = questionsBySubject[primaryCatKey].length;
            const canAddPrimary = availableInPrimary - currentWantedInPrimary;
            
            if (canAddPrimary > 0) {
                const addNow = Math.min(remainderToDistribute, canAddPrimary);
                numWantedPerSubject[primaryCatKey] = currentWantedInPrimary + addNow;
                remainderToDistribute -= addNow;
            }
        }

        // Distribute any further remainder across other categories (in config order)
        if (remainderToDistribute > 0) {
            for (const spec of categorySpecs) {
                if (remainderToDistribute <= 0) break;
                const subjectKey = spec.name.toLowerCase();
                if (subjectKey === primaryCatKey) continue; // Already handled

                const currentWanted = numWantedPerSubject[subjectKey] || 0;
                const availableCount = questionsBySubject[subjectKey] ? questionsBySubject[subjectKey].length : 0;
                
                if (currentWanted < availableCount) { // If this subject can take one more
                    numWantedPerSubject[subjectKey]++;
                    remainderToDistribute--;
                }
            }
        }
        // If remainder still > 0, it means we tried to add it one by one to other categories
        // but they might have hit their max. We can loop again for multiple remaining items.
        // For simplicity, this pass adds at most one to each non-primary category.
        // If a more aggressive fill is needed for larger remainders, this loop could be enhanced.

        let finalSelectedQuestions = [];
        let actualSelectedCounts = {}; // For logging

        categorySpecs.forEach(spec => { // Iterate in display order
            const subjectKey = spec.name.toLowerCase();
            const wanted = numWantedPerSubject[subjectKey] || 0;
            const availableInSubject = questionsBySubject[subjectKey] || [];
            const numToTake = Math.min(wanted, availableInSubject.length);

            if (numToTake > 0) {
                finalSelectedQuestions.push(...availableInSubject.slice(0, numToTake));
                actualSelectedCounts[subjectKey] = numToTake;
            } else {
                 actualSelectedCounts[subjectKey] = 0;
            }
        });
        
        console.log(`k_quiz.js: Target ${totalToSelect} questions.`);
        console.log("k_quiz.js: Initial wanted counts (proportional + remainder target):", numWantedPerSubject);
        console.log("k_quiz.js: Actual questions selected per subject:", actualSelectedCounts);
        console.log(`k_quiz.js: Total questions selected: ${finalSelectedQuestions.length}`);
        return finalSelectedQuestions;
    }


    // --- Options Generation ---
    function generateOptions(currentQ) {
        // console.log(`k_quiz.js: generateOptions for Q ID: ${currentQ.id}, Text: "${currentQ.questionText}", Subject: ${currentQ.Subject}, Answer: "${currentQ.Answer}"`);
        let options = [];
        const correctAnswer = currentQ.Answer;

        if (typeof correctAnswer === 'undefined' || correctAnswer === null || String(correctAnswer).trim() === '') {
            console.warn(`k_quiz.js: Question ID ${currentQ.id} has an invalid Answer.`);
            options.push("Error: Correct answer missing");
        } else {
            options.push(correctAnswer);
        }

        // Use provided distractions
        if (currentQ.Distraction_1 && String(currentQ.Distraction_1).trim() !== "") options.push(currentQ.Distraction_1);
        if (currentQ.Distraction_2 && String(currentQ.Distraction_2).trim() !== "") options.push(currentQ.Distraction_2);
        if (currentQ.Distraction_3 && String(currentQ.Distraction_3).trim() !== "") options.push(currentQ.Distraction_3);
        
        options = [...new Set(options.map(opt => String(opt)))]; // Remove duplicates

        const TARGET_OPTIONS_COUNT = 4;
        // Optional: Supplement from same subject if not enough options and subject exists
        if (options.length < TARGET_OPTIONS_COUNT && currentQ.Subject) {
            const currentQuestionSubject = String(currentQ.Subject).trim().toLowerCase();
            const sameSubjectDistractors = allQuestions
                .filter(q =>
                    q.id !== currentQ.id &&
                    (String(q.Subject).trim().toLowerCase() === currentQuestionSubject) &&
                    String(q.Answer).trim() !== "" &&
                    !options.includes(String(q.Answer))
                )
                .map(q => q.Answer);
            
            shuffleArray(sameSubjectDistractors);
            for (let i = 0; i < sameSubjectDistractors.length && options.length < TARGET_OPTIONS_COUNT; i++) {
                options.push(sameSubjectDistractors[i]);
            }
        }
        
        shuffleArray(options); // Shuffle all collected options
        let finalOptions = options.slice(0, TARGET_OPTIONS_COUNT);

        const MIN_OPTIONS_COUNT = 2;
        const genericPlaceholders = ["Option A", "Option B", "Option C", "Option D"];
        let placeholderIdx = 0;
        if (finalOptions.length < MIN_OPTIONS_COUNT && finalOptions.length > 0) { // Ensure at least MIN_OPTIONS_COUNT if we have at least one valid option
             while (finalOptions.length < MIN_OPTIONS_COUNT && finalOptions.length < TARGET_OPTIONS_COUNT) {
                const placeholder = genericPlaceholders[placeholderIdx++];
                if (placeholder && !finalOptions.includes(placeholder)) finalOptions.push(placeholder);
                else if (!placeholder) break;
            }
        } else if (finalOptions.length === 0) { // If no options at all (e.g., answer was missing and no distractions)
            finalOptions.push(genericPlaceholders[0], genericPlaceholders[1]); // Default to two placeholders
        }


        // console.log(`k_quiz.js: Q ID ${currentQ.id}: Final options:`, finalOptions);
        return finalOptions;
    }

    // --- Display Logic ---
    function displayAllQuestions() {
        console.log(`k_quiz.js: displayAllQuestions called with ${selectedQuestions.length} questions.`);
        if (!questionsContainerEl) {
            showError("Critical Error: questionsContainerEl not found.");
            return;
        }
        questionsContainerEl.innerHTML = '';

        if (selectedQuestions.length === 0) {
            const p = document.createElement('p');
            p.textContent = "No questions are available for this quiz configuration.";
            questionsContainerEl.appendChild(p);
            if (submitButton) submitButton.style.display = 'none';
            return;
        }

        let overallQuestionIndex = 0; // For global numbering if needed, and for data-question-index

        CATEGORY_CONFIG.forEach(categorySpec => {
            const subjectName = categorySpec.name;
            const subjectKey = subjectName.toLowerCase();
            
            const questionsInThisSubject = selectedQuestions.filter(
                q => (q.Subject || 'uncategorized').toLowerCase() === subjectKey
            );

            if (questionsInThisSubject.length > 0) {
                const subjectHeader = document.createElement('h2');
                // Capitalize first letter of subject for display
                subjectHeader.textContent = subjectName.charAt(0).toUpperCase() + subjectName.slice(1);
                subjectHeader.classList.add('subject-header'); // For potential specific styling
                questionsContainerEl.appendChild(subjectHeader);

                questionsInThisSubject.forEach((question) => {
                    // The 'overallQuestionIndex' must map to the question's actual index in the flat 'selectedQuestions' array
                    // This is implicitly handled as we iterate through selectedQuestions via filtering by category in display order
                    const currentQuestionOriginalIndex = selectedQuestions.indexOf(question);

                    const questionBlock = document.createElement('div');
                    questionBlock.classList.add('question-block');
                    questionBlock.setAttribute('data-question-index', currentQuestionOriginalIndex);

                    // Question Number (overall) and Text
                    const questionTextEl = document.createElement('h3'); // As per CSS, H3 is for question text
                    questionTextEl.innerHTML = `<strong>${overallQuestionIndex + 1}.</strong> ${escapeHtml(question.questionText || "(Error: Question text missing)")}`;
                    questionBlock.appendChild(questionTextEl);

                    // Optional: "Question X of Y" info - can be added if desired, e.g., in a <p>
                    // const questionInfo = document.createElement('p');
                    // questionInfo.classList.add('question-meta-info'); // Style this class
                    // questionInfo.textContent = `(Overall ${overallQuestionIndex + 1} of ${selectedQuestions.length})`;
                    // questionBlock.appendChild(questionInfo);

                    const optionsContainer = document.createElement('div');
                    optionsContainer.classList.add('options-container');

                    const options = generateOptions(question);
                    if (!options || options.length === 0) {
                        const p = document.createElement('p');
                        p.textContent = "Error: Could not load options for this question.";
                        p.style.color = "red";
                        optionsContainer.appendChild(p);
                    } else {
                        options.forEach((optionText, optIndex) => {
                            const optionId = `option-${currentQuestionOriginalIndex}-${optIndex}`;
                            const div = document.createElement('div');
                            div.classList.add('option');

                            const displayOptionText = escapeHtml(optionText);
                            const valueOptionText = escapeHtml(optionText); // Value is the option text

                            div.innerHTML = `
                                <input type="radio" id="${optionId}" name="quizOption-${currentQuestionOriginalIndex}" value="${valueOptionText}">
                                <label for="${optionId}">${displayOptionText}</label>
                            `;
                            optionsContainer.appendChild(div);
                        });
                    }
                    questionBlock.appendChild(optionsContainer);
                    questionsContainerEl.appendChild(questionBlock);
                    overallQuestionIndex++;
                });
            }
        });
        if (submitButton) submitButton.style.display = selectedQuestions.length > 0 ? 'block' : 'none';
    }

    // --- Timer Logic ---
    function startTimer() {
        console.log("k_quiz.js: startTimer called.");
        if (!timerEl) {
            console.error("k_quiz.js: Timer element not found.");
            return;
        }
        startTime = Date.now();
        timeLeft = quizTimeMinutes * 60;
        timerEl.textContent = formatTime(timeLeft);
        timerEl.classList.remove('warning'); // Reset warning class

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = formatTime(timeLeft);
            
            if (timeLeft <= 60 && timeLeft > 0 && !timerEl.classList.contains('warning')) { // Add warning class e.g., 1 minute left
                timerEl.classList.add('warning');
            }

            if (timeLeft <= 0) {
                console.log("k_quiz.js: Time is up!");
                clearInterval(timerInterval);
                timerEl.classList.remove('warning');
                handleSubmitQuiz("Time Out");
            }
        }, 1000);
    }

    // --- Quiz Submission & Finalization ---
    function handleSubmitQuiz(status = "Completed") {
        console.log(`k_quiz.js: handleSubmitQuiz called with status: ${status}`);
        if (status !== "Time Out" && timerInterval) { // If submitted manually, clear timer
             clearInterval(timerInterval);
             timerEl.classList.remove('warning');
        }
        userAnswers = [];
        selectedQuestions.forEach((question, index) => { // 'index' is the original index in selectedQuestions
            const questionBlock = document.querySelector(`.question-block[data-question-index="${index}"]`);
            let userAnswer = "Not answered";
            let optionsList = [];

            if (questionBlock) {
                const selectedOptionInput = questionBlock.querySelector(`input[name="quizOption-${index}"]:checked`);
                userAnswer = selectedOptionInput ? selectedOptionInput.value : "Not answered";
                optionsList = Array.from(questionBlock.querySelectorAll('.option label')).map(l => l.textContent);
            } else {
                 console.warn(`Question block for index ${index} (ID: ${question.id}) not found during submission.`);
                 userAnswer = "DOM Error"; // Indicate a problem finding the question
            }
            
            const correctAnswer = question.Answer;

            userAnswers.push({
                questionId: question.id, // S.N.
                questionText: question.questionText,
                subject: question.Subject || "N/A", // Include the subject
                options: optionsList,
                correctAnswer: String(correctAnswer),
                userAnswer: String(userAnswer),
                isCorrect: userAnswer !== "Not answered" && userAnswer !== "DOM Error" && String(userAnswer) === String(correctAnswer)
            });
        });
        finalizeQuiz(status);
    }

    function finalizeQuiz(status) {
        console.log(`k_quiz.js: finalizeQuiz called with status: ${status}`);
        // Note: timerInterval is already cleared in handleSubmitQuiz or startTimer's timeout
        const endTime = Date.now();
        const timeTakenSec = startTime === 0 ? (status === "Time Out" ? quizTimeMinutes * 60 : 0) : Math.round((endTime - startTime) / 1000);

        let quizResults = {
            totalQuestionsAskedInConfig: numQuestionsToAsk, // How many user requested
            totalQuestionsDisplayed: selectedQuestions.length, // How many actually shown
            answeredQuestionsDetail: userAnswers,
            status: status,
            timeTaken: status === "Time Out" ? quizTimeMinutes * 60 : timeTakenSec,
            maxTime: quizTimeMinutes * 60,
            score: userAnswers.filter(ans => ans.isCorrect).length
        };

        console.log("k_quiz.js: Quiz results:", quizResults);
        try {
            localStorage.setItem('quizResults', JSON.stringify(quizResults));
            console.log("k_quiz.js: Results saved to localStorage.");
        } catch (e) {
            console.error("k_quiz.js: Error saving results:", e);
            showError("Error saving quiz results. Check console.");
            return; // Prevent redirect if saving fails
        }

        console.log("k_quiz.js: Redirecting to k_result.html");
        window.location.href = 'k_result.html';
    }

    // --- Main Initialization ---
    function initializeQuiz() {
        console.log("k_quiz.js: initializeQuiz called.");
        startTime = 0; // Reset startTime for each quiz initialization

        // Select questions based on categories and proportions
        selectedQuestions = selectCategorizedQuestions(allQuestions, numQuestionsToAsk, CATEGORY_CONFIG, PRIMARY_REMAINDER_CATEGORY);

        if (numQuestionsToAsk > 0 && selectedQuestions.length < numQuestionsToAsk) {
            console.warn(`k_quiz.js: Requested ${numQuestionsToAsk} questions, but only ${selectedQuestions.length} could be selected due to availability across categories.`);
            // Optionally inform user, though showError might be too drastic if some questions are still available.
            // For now, the quiz proceeds with available questions.
        }
        
        if (selectedQuestions.length === 0 && numQuestionsToAsk > 0) {
            showError(`No questions could be selected based on the current configuration and available data. Source has ${allQuestions.length} questions total.`);
            return;
        }
        if (selectedQuestions.length === 0 && numQuestionsToAsk === 0) {
            showError(`Number of questions to ask is zero. Please configure a valid number of questions.`);
            return;
        }
        console.log(`k_quiz.js: ${selectedQuestions.length} questions selected for the quiz.`);

        userAnswers = []; // Clear previous answers

        if (loadingMessageEl) loadingMessageEl.style.display = 'none';
        if (quizContentEl) quizContentEl.style.display = 'block';

        displayAllQuestions();
        if (selectedQuestions.length > 0) {
            startTimer();
            if (submitButton) submitButton.style.display = 'block';
        } else {
            if (submitButton) submitButton.style.display = 'none';
            // Timer should not start if no questions
        }
    }

    // --- Load Data and Start ---
    console.log("k_quiz.js: Loading data from localStorage.");
    let quizTimeStr, numQuestionsStr, allQuestionsDataString;

    try {
        quizTimeStr = localStorage.getItem('quizTime');
        numQuestionsStr = localStorage.getItem('quizQuestions');
        allQuestionsDataString = localStorage.getItem('structuredSpreadsheetJsData_v2');
    } catch (e) {
        console.error("k_quiz.js: Error accessing localStorage:", e);
        showError("Error accessing browser storage. This can happen if cookies/site data are blocked.");
        return;
    }

    if (!quizTimeStr || !numQuestionsStr || !allQuestionsDataString) {
        let missing = [];
        if (!quizTimeStr) missing.push("Quiz Time configuration");
        if (!numQuestionsStr) missing.push("Number of Questions configuration");
        if (!allQuestionsDataString) missing.push("Question Data");
        showError(`Essential quiz setup data is missing from storage: ${missing.join(', ')}. Please go back to the setup page and ensure data is synced and settings are saved.`);
        return;
    }

    quizTimeMinutes = parseInt(quizTimeStr, 10);
    numQuestionsToAsk = parseInt(numQuestionsStr, 10);

    if (isNaN(quizTimeMinutes) || quizTimeMinutes <= 0) {
        showError(`Invalid quiz time configured (${quizTimeStr}). Please set a valid time duration.`);
        return;
    }
    if (isNaN(numQuestionsToAsk)) { // numQuestionsToAsk can be 0 if user wants to see all, but selectCategorizedQuestions handles 0
        showError(`Invalid number of questions configured (${numQuestionsStr}). Please set a valid number.`);
        return;
    }
     if (numQuestionsToAsk < 0) {
        showError(`Number of questions cannot be negative (${numQuestionsStr}).`);
        return;
    }


    try {
        allQuestions = JSON.parse(allQuestionsDataString);
        if (!Array.isArray(allQuestions)) throw new Error("Question data is not in the expected array format.");
        console.log(`k_quiz.js: ${allQuestions.length} questions loaded from storage.`);
        if (allQuestions.length === 0 && numQuestionsToAsk > 0) {
            showError("No questions are available in the synced data, but questions were requested for the quiz.");
            return;
        }
    } catch (e) {
        showError(`Error parsing question data from storage: ${e.message}. The data might be corrupted or in an old format. Please try re-syncing data from the setup page.`);
        return;
    }

    if (submitButton) {
        submitButton.addEventListener('click', () => handleSubmitQuiz("Completed"));
    } else {
        console.error("k_quiz.js: Submit button not found, quiz cannot be submitted manually.");
        // Not calling showError, as timer submission still works.
    }

    initializeQuiz();
});
