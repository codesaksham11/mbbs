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
        { name: "zoology", proportion: 0.20, order: 4 },
        { name: "mat", proportion: 0.10, order: 5 }
    ].sort((a, b) => a.order - b.order);

    const PRIMARY_REMAINDER_CATEGORY = "zoology";

    let allQuestions = [];
    let selectedQuestions = [];
    let userAnswers = [];
    let timeLeft = 0;
    let timerInterval;
    let startTime = 0;
    let quizTimeMinutes = 0;
    let numQuestionsToAsk = 0;

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
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // --- Data Normalization Function ---
    function normalizeQuestionData(rawQuestions) {
        console.log("k_quiz.js: Normalizing question data...");
        console.log("k_quiz.js: Sample raw question:", rawQuestions[0]);
        
        return rawQuestions.map((q, index) => {
            // Handle different possible property names
            const questionText = q.Question || q.questionText || q.question || `Question ${index + 1}`;
            const subject = q.Subject || q.subject || 'uncategorized';
            const answer = q.Answer || q.answer || q.correctAnswer;
            const id = q.id || q.ID || q['S.N.'] || q['S.N'] || index + 1;
            
            // Handle distractors with different possible names
            const distraction1 = q.Distraction_1 || q['Distraction 1'] || q.distraction1 || q.option1;
            const distraction2 = q.Distraction_2 || q['Distraction 2'] || q.distraction2 || q.option2;
            const distraction3 = q.Distraction_3 || q['Distraction 3'] || q.distraction3 || q.option3;

            const normalized = {
                id: id,
                questionText: questionText,
                Subject: subject,
                Answer: answer,
                Distraction_1: distraction1,
                Distraction_2: distraction2,
                Distraction_3: distraction3
            };

            // Log first few questions for debugging
            if (index < 3) {
                console.log(`k_quiz.js: Normalized question ${index + 1}:`, normalized);
            }

            return normalized;
        });
    }

    // --- Question Selection Logic ---
    function selectCategorizedQuestions(allQs, totalToSelect, categorySpecs, primaryRemainderCatName) {
        console.log(`k_quiz.js: selectCategorizedQuestions called with ${allQs.length} total questions, selecting ${totalToSelect}`);
        
        if (totalToSelect === 0) {
            console.log("k_quiz.js: No questions requested (totalToSelect = 0)");
            return [];
        }
        
        if (!allQs || allQs.length === 0) {
            console.log("k_quiz.js: No questions available");
            return [];
        }

        // Group questions by subject
        const questionsBySubject = {};
        allQs.forEach(q => {
            const subject = (q.Subject || 'uncategorized').toLowerCase().trim();
            if (!questionsBySubject[subject]) {
                questionsBySubject[subject] = [];
            }
            questionsBySubject[subject].push(q);
        });

        console.log("k_quiz.js: Questions grouped by subject:", 
            Object.keys(questionsBySubject).map(key => `${key}: ${questionsBySubject[key].length}`));

        // Shuffle questions within each subject
        for (const subject in questionsBySubject) {
            shuffleArray(questionsBySubject[subject]);
        }

        // Calculate initial allocation based on proportions
        let numWantedPerSubject = {};
        let totalAllocatedProportionally = 0;

        categorySpecs.forEach(spec => {
            const subjectKey = spec.name.toLowerCase();
            const allocated = Math.floor(totalToSelect * spec.proportion);
            numWantedPerSubject[subjectKey] = allocated;
            totalAllocatedProportionally += allocated;
            console.log(`k_quiz.js: ${spec.name}: ${allocated} questions (${(spec.proportion * 100).toFixed(1)}%)`);
        });

        // Handle remainder
        let remainderToDistribute = totalToSelect - totalAllocatedProportionally;
        console.log(`k_quiz.js: Remainder to distribute: ${remainderToDistribute}`);
        
        // Distribute remainder to primary category first
        const primaryCatKey = primaryRemainderCatName.toLowerCase();
        if (remainderToDistribute > 0 && questionsBySubject[primaryCatKey]) {
            const currentWantedInPrimary = numWantedPerSubject[primaryCatKey] || 0;
            const availableInPrimary = questionsBySubject[primaryCatKey].length;
            const canAddPrimary = Math.max(0, availableInPrimary - currentWantedInPrimary);
            
            if (canAddPrimary > 0) {
                const addNow = Math.min(remainderToDistribute, canAddPrimary);
                numWantedPerSubject[primaryCatKey] = currentWantedInPrimary + addNow;
                remainderToDistribute -= addNow;
                console.log(`k_quiz.js: Added ${addNow} to primary category ${primaryRemainderCatName}`);
            }
        }

        // Distribute remaining remainder across other categories
        if (remainderToDistribute > 0) {
            for (const spec of categorySpecs) {
                if (remainderToDistribute <= 0) break;
                const subjectKey = spec.name.toLowerCase();
                if (subjectKey === primaryCatKey) continue;

                const currentWanted = numWantedPerSubject[subjectKey] || 0;
                const availableCount = questionsBySubject[subjectKey] ? questionsBySubject[subjectKey].length : 0;
                
                if (currentWanted < availableCount) {
                    numWantedPerSubject[subjectKey]++;
                    remainderToDistribute--;
                    console.log(`k_quiz.js: Added 1 to ${spec.name} (remainder distribution)`);
                }
            }
        }

        // Select questions from each subject
        let finalSelectedQuestions = [];
        let actualSelectedCounts = {};

        categorySpecs.forEach(spec => {
            const subjectKey = spec.name.toLowerCase();
            const wanted = numWantedPerSubject[subjectKey] || 0;
            const availableInSubject = questionsBySubject[subjectKey] || [];
            const numToTake = Math.min(wanted, availableInSubject.length);

            if (numToTake > 0) {
                const selectedFromSubject = availableInSubject.slice(0, numToTake);
                finalSelectedQuestions.push(...selectedFromSubject);
                actualSelectedCounts[subjectKey] = numToTake;
                console.log(`k_quiz.js: Selected ${numToTake} questions from ${spec.name}`);
            } else {
                actualSelectedCounts[subjectKey] = 0;
            }
        });
        
        console.log(`k_quiz.js: Final selection - Target: ${totalToSelect}, Actual: ${finalSelectedQuestions.length}`);
        console.log("k_quiz.js: Actual counts per subject:", actualSelectedCounts);
        
        return finalSelectedQuestions;
    }

    // --- Options Generation ---
    function generateOptions(currentQ) {
        console.log(`k_quiz.js: Generating options for question ID: ${currentQ.id}`);
        
        let options = [];
        const correctAnswer = currentQ.Answer;

        // Add correct answer
        if (correctAnswer && String(correctAnswer).trim() !== '') {
            options.push(String(correctAnswer).trim());
        } else {
            console.warn(`k_quiz.js: Question ID ${currentQ.id} has no valid answer`);
            options.push("Error: Answer missing");
        }

        // Add distractors
        [currentQ.Distraction_1, currentQ.Distraction_2, currentQ.Distraction_3].forEach(distraction => {
            if (distraction && String(distraction).trim() !== '') {
                const distractionText = String(distraction).trim();
                if (!options.includes(distractionText)) {
                    options.push(distractionText);
                }
            }
        });

        // Remove duplicates
        options = [...new Set(options)];

        // If we need more options, try to get from same subject
        const TARGET_OPTIONS_COUNT = 4;
        if (options.length < TARGET_OPTIONS_COUNT && currentQ.Subject) {
            const currentQuestionSubject = String(currentQ.Subject).trim().toLowerCase();
            const sameSubjectDistractors = allQuestions
                .filter(q =>
                    q.id !== currentQ.id &&
                    String(q.Subject).trim().toLowerCase() === currentQuestionSubject &&
                    q.Answer &&
                    String(q.Answer).trim() !== "" &&
                    !options.includes(String(q.Answer).trim())
                )
                .map(q => String(q.Answer).trim());
            
            shuffleArray(sameSubjectDistractors);
            
            for (let i = 0; i < sameSubjectDistractors.length && options.length < TARGET_OPTIONS_COUNT; i++) {
                options.push(sameSubjectDistractors[i]);
            }
        }
        
        // Shuffle options
        shuffleArray(options);
        
        // Limit to target count
        let finalOptions = options.slice(0, TARGET_OPTIONS_COUNT);

        // Ensure minimum options
        const MIN_OPTIONS_COUNT = 2;
        if (finalOptions.length < MIN_OPTIONS_COUNT) {
            const genericPlaceholders = ["Option A", "Option B", "Option C", "Option D"];
            let placeholderIdx = 0;
            
            while (finalOptions.length < MIN_OPTIONS_COUNT && placeholderIdx < genericPlaceholders.length) {
                const placeholder = genericPlaceholders[placeholderIdx++];
                if (!finalOptions.includes(placeholder)) {
                    finalOptions.push(placeholder);
                }
            }
        }

        console.log(`k_quiz.js: Generated ${finalOptions.length} options for question ${currentQ.id}`);
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

        let overallQuestionIndex = 0;

        // Display questions grouped by category
        CATEGORY_CONFIG.forEach(categorySpec => {
            const subjectName = categorySpec.name;
            const subjectKey = subjectName.toLowerCase();
            
            const questionsInThisSubject = selectedQuestions.filter(
                q => (q.Subject || 'uncategorized').toLowerCase() === subjectKey
            );

            if (questionsInThisSubject.length > 0) {
                // Subject header
                const subjectHeader = document.createElement('h2');
                subjectHeader.textContent = subjectName.charAt(0).toUpperCase() + subjectName.slice(1);
                subjectHeader.classList.add('subject-header');
                subjectHeader.style.cssText = `
                    color: #f1c40f;
                    margin-top: 30px;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #f1c40f;
                    padding-bottom: 8px;
                `;
                questionsContainerEl.appendChild(subjectHeader);

                questionsInThisSubject.forEach((question) => {
                    const currentQuestionOriginalIndex = selectedQuestions.indexOf(question);

                    const questionBlock = document.createElement('div');
                    questionBlock.classList.add('question-block');
                    questionBlock.setAttribute('data-question-index', currentQuestionOriginalIndex);

                    // Question text
                    const questionTextEl = document.createElement('h3');
                    const questionText = question.questionText || `Question ${overallQuestionIndex + 1}`;
                    questionTextEl.innerHTML = `<strong>${overallQuestionIndex + 1}.</strong> ${escapeHtml(questionText)}`;
                    questionBlock.appendChild(questionTextEl);

                    // Options container
                    const optionsContainer = document.createElement('div');
                    optionsContainer.classList.add('options-container');

                    const options = generateOptions(question);
                    
                    if (!options || options.length === 0) {
                        const p = document.createElement('p');
                        p.textContent = "Error: Could not load options for this question.";
                        p.style.color = "#e74c3c";
                        optionsContainer.appendChild(p);
                    } else {
                        options.forEach((optionText, optIndex) => {
                            const optionId = `option-${currentQuestionOriginalIndex}-${optIndex}`;
                            const div = document.createElement('div');
                            div.classList.add('option');

                            const displayOptionText = escapeHtml(optionText);
                            const valueOptionText = escapeHtml(optionText);

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
        
        if (submitButton) {
            submitButton.style.display = selectedQuestions.length > 0 ? 'block' : 'none';
        }
        
        console.log("k_quiz.js: All questions displayed successfully");
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
        timerEl.classList.remove('warning');

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = formatTime(timeLeft);
            
            if (timeLeft <= 60 && timeLeft > 0 && !timerEl.classList.contains('warning')) {
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
        
        if (status !== "Time Out" && timerInterval) {
            clearInterval(timerInterval);
            timerEl.classList.remove('warning');
        }
        
        userAnswers = [];
        
        selectedQuestions.forEach((question, index) => {
            const questionBlock = document.querySelector(`.question-block[data-question-index="${index}"]`);
            let userAnswer = "Not answered";
            let optionsList = [];

            if (questionBlock) {
                const selectedOptionInput = questionBlock.querySelector(`input[name="quizOption-${index}"]:checked`);
                userAnswer = selectedOptionInput ? selectedOptionInput.value : "Not answered";
                optionsList = Array.from(questionBlock.querySelectorAll('.option label')).map(l => l.textContent);
            } else {
                console.warn(`Question block for index ${index} (ID: ${question.id}) not found during submission.`);
                userAnswer = "DOM Error";
            }
            
            const correctAnswer = String(question.Answer || '');

            userAnswers.push({
                questionId: question.id,
                questionText: question.questionText || `Question ${index + 1}`,
                subject: question.Subject || "N/A",
                options: optionsList,
                correctAnswer: correctAnswer,
                userAnswer: String(userAnswer),
                isCorrect: userAnswer !== "Not answered" && 
                          userAnswer !== "DOM Error" && 
                          String(userAnswer) === correctAnswer
            });
        });
        
        finalizeQuiz(status);
    }

    // PASTE THIS ENTIRE BLOCK TO REPLACE THE OLD finalizeQuiz FUNCTION IN k_quiz.js

function finalizeQuiz(status) {
    console.log(`k_quiz.js: finalizeQuiz called with status: ${status}`);

    const endTime = Date.now();
    const timeTakenSec = startTime === 0 ?
        (status === "Time Out" ? quizTimeMinutes * 60 : 0) :
        Math.round((endTime - startTime) / 1000);

    // Calculate marks and percentage for this specific quiz
    // These constants should ideally be defined globally or passed if they can change
    // For simplicity, defining them here based on k_result.js
    const MARKS_CORRECT = 1;
    const MARKS_INCORRECT = -0.25;
    const MARKS_SKIPPED = 0;
    let marksObtainedForThisQuiz = 0;

    userAnswers.forEach(ans => {
        const userAnswerStr = String(ans.userAnswer); // Ensure it's a string
        if (userAnswerStr === 'Not answered' || userAnswerStr === 'DOM Error') {
            marksObtainedForThisQuiz += MARKS_SKIPPED;
        } else if (ans.isCorrect) {
            marksObtainedForThisQuiz += MARKS_CORRECT;
        } else {
            marksObtainedForThisQuiz += MARKS_INCORRECT;
        }
    });

    // Ensure totalQuestionsDisplayed is accurate for calculation
    const questionsCountForCalc = selectedQuestions.length > 0 ? selectedQuestions.length : numQuestionsToAsk;
    const totalPossibleMarksForThisQuiz = questionsCountForCalc * MARKS_CORRECT;

    let percentageForThisQuiz = 0;
    if (totalPossibleMarksForThisQuiz > 0) {
        percentageForThisQuiz = Math.round((marksObtainedForThisQuiz / totalPossibleMarksForThisQuiz) * 1000) / 10;
    } else if (questionsCountForCalc === 0) { // If no questions, percentage is arguably 0 or N/A
        percentageForThisQuiz = 0;
    }


    const currentQuizResult = {
        timestamp: new Date().toISOString(), // Add a timestamp
        totalQuestionsAskedInConfig: numQuestionsToAsk,
        totalQuestionsDisplayed: selectedQuestions.length,
        answeredQuestionsDetail: userAnswers,
        status: status,
        timeTaken: status === "Time Out" ? quizTimeMinutes * 60 : timeTakenSec,
        maxTime: quizTimeMinutes * 60,
        score: userAnswers.filter(ans => ans.isCorrect).length,
        marksObtained: marksObtainedForThisQuiz,
        totalPossibleMarks: totalPossibleMarksForThisQuiz,
        percentage: percentageForThisQuiz
    };

    console.log("k_quiz.js: Current quiz result (for immediate display & history):", currentQuizResult);

    // --- Save for immediate k_result.html page ---
    try {
        localStorage.setItem('quizResults', JSON.stringify(currentQuizResult));
        console.log("k_quiz.js: Current result saved to localStorage (key: 'quizResults') for k_result.html.");
    } catch (e) {
        console.error("k_quiz.js: Error saving current result for k_result.html:", e);
        // Continue to try saving to history
    }

    // --- Save to historical stats ---
    let allHistoricalResults = [];
    const historicalResultsKey = 'allQuizHistoricalResults_v1';
    try {
        const storedHistoricalResults = localStorage.getItem(historicalResultsKey);
        if (storedHistoricalResults) {
            allHistoricalResults = JSON.parse(storedHistoricalResults);
            if (!Array.isArray(allHistoricalResults)) {
                console.warn("k_quiz.js: Historical results (key: '" + historicalResultsKey + "') was not an array, resetting.");
                allHistoricalResults = [];
            }
        }
    } catch (e) {
        console.error("k_quiz.js: Error reading historical quiz results (key: '" + historicalResultsKey + "'):", e);
        allHistoricalResults = []; // Reset on error
    }

    allHistoricalResults.push(currentQuizResult); // Add the new result

    try {
        localStorage.setItem(historicalResultsKey, JSON.stringify(allHistoricalResults));
        console.log("k_quiz.js: Current result appended to historical results (key: '" + historicalResultsKey + "'). Total entries: " + allHistoricalResults.length);
    } catch (e) {
        console.error("k_quiz.js: Error saving historical results (key: '" + historicalResultsKey + "'):", e);
        showError("Error saving quiz statistics. Check console. Current result might still be available.");
        // Don't return here, still try to redirect
    }

    console.log("k_quiz.js: Redirecting to k_result.html");
    window.location.href = 'k_result.html';
}

// END OF PASTE BLOCK

    // --- Main Initialization ---
    function initializeQuiz() {
        console.log("k_quiz.js: initializeQuiz called.");
        console.log(`k_quiz.js: Configuration - Time: ${quizTimeMinutes} minutes, Questions: ${numQuestionsToAsk}`);
        console.log(`k_quiz.js: Available questions: ${allQuestions.length}`);
        
        startTime = 0;

        // Select questions
        selectedQuestions = selectCategorizedQuestions(
            allQuestions, 
            numQuestionsToAsk, 
            CATEGORY_CONFIG, 
            PRIMARY_REMAINDER_CATEGORY
        );

        if (numQuestionsToAsk > 0 && selectedQuestions.length < numQuestionsToAsk) {
            console.warn(`k_quiz.js: Requested ${numQuestionsToAsk} questions, but only ${selectedQuestions.length} available.`);
        }
        
        if (selectedQuestions.length === 0 && numQuestionsToAsk > 0) {
            showError(`No questions could be selected. Available: ${allQuestions.length} total questions.`);
            return;
        }
        
        if (numQuestionsToAsk === 0) {
            showError(`Number of questions to ask is zero. Please configure a valid number.`);
            return;
        }
        
        console.log(`k_quiz.js: ${selectedQuestions.length} questions selected for the quiz.`);

        userAnswers = [];

        // Hide loading, show content
        if (loadingMessageEl) loadingMessageEl.style.display = 'none';
        if (quizContentEl) quizContentEl.style.display = 'block';

        displayAllQuestions();
        
        if (selectedQuestions.length > 0) {
            startTimer();
            if (submitButton) submitButton.style.display = 'block';
        } else {
            if (submitButton) submitButton.style.display = 'none';
        }
        
        console.log("k_quiz.js: Quiz initialization completed successfully");
    }

    // --- Load Data and Start ---
    console.log("k_quiz.js: Loading data from localStorage...");
    
    let quizTimeStr, numQuestionsStr, allQuestionsDataString;

    try {
        quizTimeStr = localStorage.getItem('quizTime');
        numQuestionsStr = localStorage.getItem('quizQuestions');
        allQuestionsDataString = localStorage.getItem('structuredSpreadsheetJsData_v2');
        
        console.log("k_quiz.js: Raw localStorage values:");
        console.log("- quizTime:", quizTimeStr);
        console.log("- quizQuestions:", numQuestionsStr);
        console.log("- data length:", allQuestionsDataString ? allQuestionsDataString.length : 'null');
    } catch (e) {
        console.error("k_quiz.js: Error accessing localStorage:", e);
        showError("Error accessing browser storage. This can happen if cookies/site data are blocked.");
        return;
    }

    // Validate required data
    if (!quizTimeStr || !numQuestionsStr || !allQuestionsDataString) {
        let missing = [];
        if (!quizTimeStr) missing.push("Quiz Time configuration");
        if (!numQuestionsStr) missing.push("Number of Questions configuration");
        if (!allQuestionsDataString) missing.push("Question Data");
        showError(`Essential quiz setup data is missing: ${missing.join(', ')}. Please go back to setup page and ensure data is synced.`);
        return;
    }

    // Parse and validate configuration
    quizTimeMinutes = parseInt(quizTimeStr, 10);
    numQuestionsToAsk = parseInt(numQuestionsStr, 10);

    if (isNaN(quizTimeMinutes) || quizTimeMinutes <= 0) {
        showError(`Invalid quiz time configured: "${quizTimeStr}". Please set a valid time duration.`);
        return;
    }
    
    if (isNaN(numQuestionsToAsk) || numQuestionsToAsk < 0) {
        showError(`Invalid number of questions configured: "${numQuestionsStr}". Please set a valid number.`);
        return;
    }

    // Parse and validate question data
    try {
        const rawQuestions = JSON.parse(allQuestionsDataString);
        
        if (!Array.isArray(rawQuestions)) {
            throw new Error("Question data is not in array format");
        }
        
        console.log(`k_quiz.js: Loaded ${rawQuestions.length} raw questions`);
        
        if (rawQuestions.length === 0) {
            showError("No questions found in the synced data. Please re-sync from setup page.");
            return;
        }

        // Normalize the data structure
        allQuestions = normalizeQuestionData(rawQuestions);
        
        console.log(`k_quiz.js: ${allQuestions.length} questions normalized and ready`);
        
        // Log subject distribution
        const subjectCounts = {};
        allQuestions.forEach(q => {
            const subject = (q.Subject || 'uncategorized').toLowerCase();
            subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
        });
        console.log("k_quiz.js: Subject distribution:", subjectCounts);
        
    } catch (e) {
        console.error("k_quiz.js: Error parsing question data:", e);
        showError(`Error parsing question data: ${e.message}. Data might be corrupted. Please re-sync from setup page.`);
        return;
    }

    // Set up submit button event listener
    if (submitButton) {
        submitButton.addEventListener('click', () => {
            console.log("k_quiz.js: Submit button clicked");
            handleSubmitQuiz("Completed");
        });
    } else {
        console.error("k_quiz.js: Submit button not found!");
    }

    // Initialize the quiz
    try {
        initializeQuiz();
    } catch (e) {
        console.error("k_quiz.js: Error during quiz initialization:", e);
        showError(`Error initializing quiz: ${e.message}. Please refresh and try again.`);
    }
});
