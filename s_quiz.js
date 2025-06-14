document.addEventListener('DOMContentLoaded', () => {
    console.log("s_quiz.js: DOMContentLoaded fired.");

    // Get DOM elements
    const timerEl = document.getElementById('timer');
    const questionsContainerEl = document.getElementById('questionsContainer');
    const submitButton = document.getElementById('submitButton');
    const quizContentEl = document.getElementById('quizContent');
    const loadingMessageEl = document.getElementById('loadingMessage');
    const errorMessageEl = document.getElementById('errorMessage');

    // Enhanced DOM element checking
    console.log("s_quiz.js: DOM Elements Check:");
    console.log("- timerEl:", !!timerEl);
    console.log("- questionsContainerEl:", !!questionsContainerEl);
    console.log("- submitButton:", !!submitButton);
    console.log("- quizContentEl:", !!quizContentEl);
    console.log("- loadingMessageEl:", !!loadingMessageEl);
    console.log("- errorMessageEl:", !!errorMessageEl);

    // Ensure critical DOM elements are found
    if (!loadingMessageEl) console.error("s_quiz.js CRITICAL: loadingMessageEl not found!");
    if (!quizContentEl) console.error("s_quiz.js CRITICAL: quizContentEl not found!");
    if (!errorMessageEl) console.error("s_quiz.js CRITICAL: errorMessageEl not found!");
    if (!questionsContainerEl) console.error("s_quiz.js CRITICAL: questionsContainerEl not found!");
    if (!submitButton) console.error("s_quiz.js CRITICAL: submitButton not found!");

    let allQuestions = []; // All questions from spreadsheet
    let subjectSpecificQuestions = []; // Questions of the chosen subject
    let selectedQuestions = []; // Questions chosen for this practice session
    let userAnswers = [];
    let timeLeft = 0;
    let timerInterval;
    let startTime = 0;
    let practiceTimeMinutes = 0;
    let numQuestionsToAsk = 0;
    let practiceSubject = ''; // To store the subject chosen for practice

    // --- showError Function ---
    function showError(message) {
        console.error("s_quiz.js - SHOW_ERROR CALLED:", message);
        if (timerInterval) clearInterval(timerInterval);
        
        // Force hide loading message
        if (loadingMessageEl) {
            loadingMessageEl.style.display = 'none';
            console.log("s_quiz.js: Loading message hidden due to error");
        }
        
        // Force hide quiz content
        if (quizContentEl) {
            quizContentEl.style.display = 'none';
            console.log("s_quiz.js: Quiz content hidden due to error");
        }
        
        // Show error message
        if (errorMessageEl) {
            errorMessageEl.innerHTML = message + ' Please <a href="s.html">go back to setup</a>, check console, and try again.';
            errorMessageEl.style.display = 'block';
            console.log("s_quiz.js: Error message displayed");
        } else {
            alert("Practice Quiz Error: " + message + ". Check console.");
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
            .replace(/'/g, "&#039;");
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // --- Data Normalization Function ---
    function normalizeQuestionData(rawQuestions) {
        console.log("s_quiz.js: Normalizing question data...");
        if (!Array.isArray(rawQuestions)) {
            console.error("s_quiz.js: rawQuestions is not an array:", typeof rawQuestions);
            return [];
        }
        
        const normalized = rawQuestions.map((q, index) => {
            try {
                const questionText = q.Question || q.questionText || q.question || `Question ${index + 1}`;
                const subject = q.Subject || q.subject || 'uncategorized';
                const answer = q.Answer || q.answer || q.correctAnswer;
                const id = q.id || q.ID || q['S.N.'] || q['S.N'] || index + 1;
                const distraction1 = q.Distraction_1 || q['Distraction 1'] || q.distraction1 || q.option1;
                const distraction2 = q.Distraction_2 || q['Distraction 2'] || q.distraction2 || q.option2;
                const distraction3 = q.Distraction_3 || q['Distraction 3'] || q.distraction3 || q.option3;

                return {
                    id: id,
                    questionText: questionText,
                    Subject: subject,
                    Answer: answer,
                    Distraction_1: distraction1,
                    Distraction_2: distraction2,
                    Distraction_3: distraction3
                };
            } catch (e) {
                console.error(`s_quiz.js: Error normalizing question ${index}:`, e);
                return null;
            }
        }).filter(q => q !== null);
        
        console.log(`s_quiz.js: Normalized ${normalized.length} out of ${rawQuestions.length} questions`);
        return normalized;
    }

    // --- Question Selection Logic for Subject Practice ---
    function selectSubjectSpecificQuestions(allQs, totalToSelect, targetSubject) {
        console.log(`s_quiz.js: selectSubjectSpecificQuestions called. Target: ${totalToSelect} questions for subject: ${targetSubject}`);
        
        if (!totalToSelect || totalToSelect === 0) {
            console.log("s_quiz.js: No questions requested (totalToSelect = 0)");
            return [];
        }
        
        if (!allQs || allQs.length === 0) {
            console.log("s_quiz.js: No questions available in the general pool.");
            return [];
        }
        
        if (!targetSubject) {
            console.error("s_quiz.js: Target subject not specified for selection.");
            return [];
        }

        const targetSubjectLower = targetSubject.toLowerCase().trim();
        console.log(`s_quiz.js: Looking for subject: "${targetSubjectLower}"`);
        
        // Debug: Show all available subjects
        const availableSubjects = [...new Set(allQs.map(q => (q.Subject || 'uncategorized').toLowerCase().trim()))];
        console.log("s_quiz.js: Available subjects:", availableSubjects);
        
        const filteredBySubject = allQs.filter(q => {
            const qSubject = (q.Subject || 'uncategorized').toLowerCase().trim();
            return qSubject === targetSubjectLower;
        });

        console.log(`s_quiz.js: Found ${filteredBySubject.length} questions for subject '${targetSubject}'.`);

        if (filteredBySubject.length === 0) {
            console.warn(`s_quiz.js: No questions found for subject "${targetSubject}". Available subjects: ${availableSubjects.join(', ')}`);
            return [];
        }

        shuffleArray(filteredBySubject);
        const selected = filteredBySubject.slice(0, Math.min(totalToSelect, filteredBySubject.length));
        console.log(`s_quiz.js: Selected ${selected.length} questions for practice`);
        return selected;
    }

    // --- Options Generation ---
    function generateOptions(currentQ) {
        let options = [];
        const correctAnswer = currentQ.Answer;

        if (correctAnswer && String(correctAnswer).trim() !== '') {
            options.push(String(correctAnswer).trim());
        } else {
            console.warn(`s_quiz.js: Question ID ${currentQ.id} has no valid answer`);
            options.push("Error: Answer missing");
        }

        [currentQ.Distraction_1, currentQ.Distraction_2, currentQ.Distraction_3].forEach(distraction => {
            if (distraction && String(distraction).trim() !== '') {
                const distractionText = String(distraction).trim();
                if (!options.includes(distractionText)) { 
                    options.push(distractionText); 
                }
            }
        });
        
        options = [...new Set(options)];

        const TARGET_OPTIONS_COUNT = 4;
        if (options.length < TARGET_OPTIONS_COUNT && currentQ.Subject) {
            const currentQuestionSubjectLower = String(currentQ.Subject).trim().toLowerCase();
            const sameSubjectDistractors = allQuestions
                .filter(q =>
                    q.id !== currentQ.id &&
                    String(q.Subject).trim().toLowerCase() === currentQuestionSubjectLower &&
                    q.Answer && String(q.Answer).trim() !== "" &&
                    !options.includes(String(q.Answer).trim())
                )
                .map(q => String(q.Answer).trim());
            shuffleArray(sameSubjectDistractors);
            for (let i = 0; i < sameSubjectDistractors.length && options.length < TARGET_OPTIONS_COUNT; i++) {
                options.push(sameSubjectDistractors[i]);
            }
        }
        
        shuffleArray(options);
        let finalOptions = options.slice(0, TARGET_OPTIONS_COUNT);
        
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
        
        return finalOptions;
    }

    // --- Display Logic ---
    function displayAllQuestions() {
        console.log(`s_quiz.js: displayAllQuestions called with ${selectedQuestions.length} questions.`);
        
        if (!questionsContainerEl) {
            showError("Critical Error: questionsContainerEl not found during display.");
            return;
        }
        
        questionsContainerEl.innerHTML = '';

        if (selectedQuestions.length === 0) {
            console.warn("s_quiz.js: No questions to display");
            const p = document.createElement('p');
            p.textContent = `No questions are available for the subject: ${practiceSubject}.`;
            questionsContainerEl.appendChild(p);
            if (submitButton) submitButton.style.display = 'none';
            return;
        }

        console.log("s_quiz.js: Starting to render questions...");
        
        selectedQuestions.forEach((question, index) => {
            try {
                const questionBlock = document.createElement('div');
                questionBlock.classList.add('question-block');
                questionBlock.setAttribute('data-question-index', index);

                const questionTextEl = document.createElement('h3');
                const questionText = question.questionText || `Question ${index + 1}`;
                questionTextEl.innerHTML = `<strong>${index + 1}.</strong> ${escapeHtml(questionText)}`;
                questionBlock.appendChild(questionTextEl);

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
                        const optionId = `option-${index}-${optIndex}`;
                        const div = document.createElement('div');
                        div.classList.add('option');
                        
                        const escapedOptionText = escapeHtml(optionText);

                        div.innerHTML = `
                            <input type="radio" id="${optionId}" name="quizOption-${index}" value="${escapedOptionText}">
                            <label for="${optionId}">${escapedOptionText}</label>
                        `;
                        optionsContainer.appendChild(div);
                    });
                }
                
                questionBlock.appendChild(optionsContainer);
                questionsContainerEl.appendChild(questionBlock);
            } catch (e) {
                console.error(`s_quiz.js: Error rendering question ${index}:`, e);
            }
        });

        if (submitButton) {
            submitButton.style.display = selectedQuestions.length > 0 ? 'block' : 'none';
        }
        
        console.log("s_quiz.js: All questions displayed successfully");
    }

    // --- Timer Logic ---
    function startTimer() {
        console.log("s_quiz.js: startTimer called.");
        
        if (!timerEl) { 
            console.error("s_quiz.js: Timer element not found."); 
            return; 
        }
        
        startTime = Date.now();
        timeLeft = practiceTimeMinutes * 60;
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
                console.log("s_quiz.js: Time is up!");
                clearInterval(timerInterval);
                timerEl.classList.remove('warning');
                handleSubmitQuiz("Time Out");
            }
        }, 1000);
        
        console.log(`s_quiz.js: Timer started for ${practiceTimeMinutes} minutes`);
    }

    // --- Quiz Submission & Finalization ---
    function handleSubmitQuiz(status = "Completed") {
        console.log(`s_quiz.js: handleSubmitQuiz called with status: ${status}`);
        
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
                isCorrect: userAnswer !== "Not answered" && userAnswer !== "DOM Error" && String(userAnswer) === escapeHtml(correctAnswer)
            });
        });
        
        finalizeQuiz(status);
    }

    function finalizeQuiz(status) {
        console.log(`s_quiz.js: finalizeQuiz called with status: ${status}`);
        
        const endTime = Date.now();
        const timeTakenSec = startTime === 0 ?
            (status === "Time Out" ? practiceTimeMinutes * 60 : 0) :
            Math.round((endTime - startTime) / 1000);

        const MARKS_CORRECT = 1;
        const MARKS_INCORRECT = -0.25;
        const MARKS_SKIPPED = 0;
        let marksObtainedForThisQuiz = 0;
        
        userAnswers.forEach(ans => {
            const userAnswerStr = String(ans.userAnswer);
            if (userAnswerStr === 'Not answered' || userAnswerStr === 'DOM Error') {
                marksObtainedForThisQuiz += MARKS_SKIPPED;
            } else if (ans.isCorrect) {
                marksObtainedForThisQuiz += MARKS_CORRECT;
            } else {
                marksObtainedForThisQuiz += MARKS_INCORRECT;
            }
        });

        const questionsCountForCalc = selectedQuestions.length > 0 ? selectedQuestions.length : numQuestionsToAsk;
        const totalPossibleMarksForThisQuiz = questionsCountForCalc * MARKS_CORRECT;
        let percentageForThisQuiz = 0;
        
        if (totalPossibleMarksForThisQuiz > 0) {
            percentageForThisQuiz = Math.round((marksObtainedForThisQuiz / totalPossibleMarksForThisQuiz) * 1000) / 10;
        } else if (questionsCountForCalc === 0) {
            percentageForThisQuiz = 0;
        }

        const currentQuizResult = {
            timestamp: new Date().toISOString(),
            subject: practiceSubject,
            totalQuestionsAskedInConfig: numQuestionsToAsk,
            totalQuestionsDisplayed: selectedQuestions.length,
            answeredQuestionsDetail: userAnswers,
            status: status,
            timeTaken: status === "Time Out" ? practiceTimeMinutes * 60 : timeTakenSec,
            maxTime: practiceTimeMinutes * 60,
            score: userAnswers.filter(ans => ans.isCorrect).length,
            marksObtained: marksObtainedForThisQuiz,
            totalPossibleMarks: totalPossibleMarksForThisQuiz,
            percentage: percentageForThisQuiz
        };

        console.log("s_quiz.js: Current practice result:", currentQuizResult);

        // Save for immediate s_result.html page
        try {
            localStorage.setItem('subjectPracticeCurrentResult', JSON.stringify(currentQuizResult));
            console.log("s_quiz.js: Current result saved to localStorage");
        } catch (e) {
            console.error("s_quiz.js: Error saving current result:", e);
        }

        // Save to historical stats
        let allHistoricalSubjectResults = [];
        const historicalSubjectResultsKey = 'allSubjectPracticeHistoricalResults_v1';
        
        try {
            const storedHistoricalResults = localStorage.getItem(historicalSubjectResultsKey);
            if (storedHistoricalResults) {
                allHistoricalSubjectResults = JSON.parse(storedHistoricalResults);
                if (!Array.isArray(allHistoricalSubjectResults)) {
                    allHistoricalSubjectResults = [];
                }
            }
        } catch (e) {
            console.error(`s_quiz.js: Error reading historical results:`, e);
            allHistoricalSubjectResults = [];
        }
        
        allHistoricalSubjectResults.push(currentQuizResult);
        
        try {
            localStorage.setItem(historicalSubjectResultsKey, JSON.stringify(allHistoricalSubjectResults));
            console.log(`s_quiz.js: Historical results updated. Total: ${allHistoricalSubjectResults.length}`);
        } catch (e) {
            console.error(`s_quiz.js: Error saving historical results:`, e);
        }
        
        console.log("s_quiz.js: Redirecting to s_result.html");
        window.location.href = 's_result.html';
    }

    // --- Main Initialization ---
    function initializeQuiz() {
        console.log("s_quiz.js: initializeQuiz called.");
        console.log(`s_quiz.js: Config - Subject: '${practiceSubject}', Time: ${practiceTimeMinutes} mins, Questions: ${numQuestionsToAsk}`);
        console.log(`s_quiz.js: Available questions (all subjects): ${allQuestions.length}`);
        
        startTime = 0;

        // Select questions for the specific subject
        selectedQuestions = selectSubjectSpecificQuestions(
            allQuestions,
            numQuestionsToAsk,
            practiceSubject
        );

        console.log(`s_quiz.js: Selected questions: ${selectedQuestions.length}`);

        // Validation checks
        if (numQuestionsToAsk > 0 && selectedQuestions.length === 0) {
            showError(`No questions found for the selected subject: '${practiceSubject}'. Please check if the subject name matches the data or try another subject.`);
            return;
        }
        
        if (numQuestionsToAsk > 0 && selectedQuestions.length < numQuestionsToAsk) {
            console.warn(`s_quiz.js: Requested ${numQuestionsToAsk} questions for ${practiceSubject}, but only ${selectedQuestions.length} were available and selected.`);
        }
        
        if (numQuestionsToAsk === 0) {
            showError(`Number of questions to ask is zero. Please configure a valid number on the setup page.`);
            return;
        }

        // Initialize user answers array
        userAnswers = [];
        
        // Hide loading message and show quiz content
        console.log("s_quiz.js: Hiding loading message, showing quiz content");
        if (loadingMessageEl) {
            loadingMessageEl.style.display = 'none';
            console.log("s_quiz.js: Loading message hidden");
        }
        
        if (quizContentEl) {
            quizContentEl.style.display = 'block';
            console.log("s_quiz.js: Quiz content shown");
        }
        
        // Display questions
        displayAllQuestions();
        
        // Start timer and show submit button if we have questions
        if (selectedQuestions.length > 0) {
            startTimer();
            if (submitButton) {
                submitButton.style.display = 'block';
                console.log("s_quiz.js: Submit button shown");
            }
        } else {
            if (submitButton) {
                submitButton.style.display = 'none';
                console.log("s_quiz.js: Submit button hidden (no questions)");
            }
        }
        
        console.log("s_quiz.js: Practice initialization completed successfully");
    }

    // --- Load Data and Start ---
    console.log("s_quiz.js: Loading data from localStorage...");
    
    let practiceTimeStr, numQuestionsStr, practiceSubjectStr, allQuestionsDataString;
    
    try {
        practiceTimeStr = localStorage.getItem('subjectPracticeTime');
        numQuestionsStr = localStorage.getItem('subjectPracticeQuestions');
        practiceSubjectStr = localStorage.getItem('subjectPracticeSubject');
        allQuestionsDataString = localStorage.getItem('structuredSpreadsheetJsData_v2');

        console.log("s_quiz.js: Raw localStorage values:");
        console.log("- subjectPracticeTime:", practiceTimeStr);
        console.log("- subjectPracticeQuestions:", numQuestionsStr);
        console.log("- subjectPracticeSubject:", practiceSubjectStr);
        console.log("- allQuestionsData exists:", !!allQuestionsDataString);
        console.log("- allQuestionsData length:", allQuestionsDataString ? allQuestionsDataString.length : 'null');

    } catch (e) {
        console.error("s_quiz.js: Error accessing localStorage:", e);
        showError("Error accessing browser storage. Site data might be blocked or corrupted.");
        return;
    }

    // Check for missing data
    if (!practiceTimeStr || !numQuestionsStr || !practiceSubjectStr || !allQuestionsDataString) {
        let missing = [];
        if (!practiceTimeStr) missing.push("Practice Time configuration");
        if (!numQuestionsStr) missing.push("Number of Questions configuration");
        if (!practiceSubjectStr) missing.push("Practice Subject configuration");
        if (!allQuestionsDataString) missing.push("Question Data (main bank)");
        
        console.error("s_quiz.js: Missing data:", missing);
        showError(`Essential practice setup data is missing: ${missing.join(', ')}. Please go back to the subject practice setup page and reconfigure.`);
        return;
    }

    // Parse and validate configuration
    practiceTimeMinutes = parseInt(practiceTimeStr, 10);
    numQuestionsToAsk = parseInt(numQuestionsStr, 10);
    practiceSubject = practiceSubjectStr.trim();

    console.log("s_quiz.js: Parsed configuration:");
    console.log("- practiceTimeMinutes:", practiceTimeMinutes);
    console.log("- numQuestionsToAsk:", numQuestionsToAsk);
    console.log("- practiceSubject:", `'${practiceSubject}'`);

    if (isNaN(practiceTimeMinutes) || practiceTimeMinutes <= 0) {
        console.error("s_quiz.js: Invalid practice time:", practiceTimeStr);
        showError(`Invalid practice time: "${practiceTimeStr}". Please reconfigure.`);
        return;
    }
    
    if (isNaN(numQuestionsToAsk) || numQuestionsToAsk < 0) {
        console.error("s_quiz.js: Invalid number of questions:", numQuestionsStr);
        showError(`Invalid number of questions: "${numQuestionsStr}". Please reconfigure.`);
        return;
    }
    
    if (!practiceSubject) {
        console.error("s_quiz.js: Empty practice subject");
        showError("Practice subject not selected or missing. Please reconfigure.");
        return;
    }

    // Parse and validate question data
    try {
        const rawQuestions = JSON.parse(allQuestionsDataString);
        console.log("s_quiz.js: Raw questions type:", typeof rawQuestions);
        console.log("s_quiz.js: Raw questions is array:", Array.isArray(rawQuestions));
        
        if (!Array.isArray(rawQuestions)) {
            throw new Error("Question data is not an array");
        }
        
        console.log(`s_quiz.js: Loaded ${rawQuestions.length} raw questions from main bank.`);
        
        if (rawQuestions.length === 0 && numQuestionsToAsk > 0) {
            showError("Main question bank is empty. Please re-sync data from the main setup page.");
            return;
        }
        
        allQuestions = normalizeQuestionData(rawQuestions);
        console.log(`s_quiz.js: ${allQuestions.length} questions normalized and ready.`);
        
    } catch (e) {
        console.error("s_quiz.js: Error parsing question data:", e);
        showError(`Error parsing main question data: ${e.message}. Please re-sync from setup.`);
        return;
    }

    // Set up submit button event listener
    if (submitButton) {
        submitButton.addEventListener('click', () => {
            console.log("s_quiz.js: Submit button clicked");
            handleSubmitQuiz("Completed");
        });
        console.log("s_quiz.js: Submit button event listener attached");
    } else {
        console.error("s_quiz.js: Submit button not found for event listener!");
    }

    // Initialize the quiz
    console.log("s_quiz.js: Starting quiz initialization...");
    try {
        initializeQuiz();
    } catch (e) {
        console.error("s_quiz.js: Error during practice initialization:", e);
        showError(`Error initializing practice: ${e.message}. Please check console and try again.`);
    }
});
