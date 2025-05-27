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

    let allQuestions = [];
    let selectedQuestions = [];
    let userAnswers = [];
    let timeLeft = 0;
    let timerInterval;
    let startTime = 0;

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
            .replace(/'/g, "&#039;");
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function selectRandomQuestions(questions, count) {
        console.log(`k_quiz.js: selectRandomQuestions called with ${questions.length} available questions, asking for ${count}`);
        if (!questions || questions.length === 0 || count === 0) {
            console.log("k_quiz.js: selectRandomQuestions returning empty array.");
            return [];
        }
        const actualCount = Math.min(count, questions.length);
        const shuffled = [...questions];
        shuffleArray(shuffled);
        const result = shuffled.slice(0, actualCount);
        console.log(`k_quiz.js: selectRandomQuestions selected ${result.length} questions.`);
        return result;
    }

    function generateOptions(currentQ) {
        console.log(`k_quiz.js: generateOptions for Q ID: ${currentQ.id}, Text: "${currentQ.questionText}", Type: ${currentQ.Type}, Class: ${currentQ.Class}, Answer: "${currentQ.Answer}"`);
        let options = [];
        const correctAnswer = currentQ.Answer;

        if (typeof correctAnswer === 'undefined' || correctAnswer === null || correctAnswer.toString().trim() === '') {
            console.warn(`k_quiz.js: Question ID ${currentQ.id} has an invalid Answer.`);
            options.push("Error: Correct answer missing");
        } else {
            options.push(correctAnswer);
        }

        if (currentQ.Type && currentQ.Type.toLowerCase() === 'fixed') {
            console.log(`k_quiz.js: Q ID ${currentQ.id} is "fixed" type. Adding distractions.`);
            if (currentQ.Distraction_1 && String(currentQ.Distraction_1).trim() !== "") options.push(currentQ.Distraction_1);
            if (currentQ.Distraction_2 && String(currentQ.Distraction_2).trim() !== "") options.push(currentQ.Distraction_2);
            if (currentQ.Distraction_3 && String(currentQ.Distraction_3).trim() !== "") options.push(currentQ.Distraction_3);
        } else if (currentQ.Type && currentQ.Type.toLowerCase() === 'class' && currentQ.Class) {
            const currentQuestionClass = String(currentQ.Class).trim();
            console.log(`k_quiz.js: Q ID ${currentQ.id} is "class" type (${currentQuestionClass}).`);
            const sameClassDistractors = allQuestions
                .filter(q => q.id !== currentQ.id && String(q.Class).trim() === currentQuestionClass && String(q.Answer).trim() !== "")
                .map(q => q.Answer);
            
            shuffleArray(sameClassDistractors);
            let addedDistractorsCount = 0;
            for (let i = 0; i < sameClassDistractors.length && options.length < 4; i++) {
                if (!options.map(String).includes(String(sameClassDistractors[i]))) {
                    options.push(sameClassDistractors[i]);
                    addedDistractorsCount++;
                }
            }
            console.log(`k_quiz.js: Q ID ${currentQ.id}: Added ${addedDistractorsCount} class distractors.`);
        }

        options = [...new Set(options.map(opt => String(opt)))];
        shuffleArray(options);
        const finalOptions = options.slice(0, 4);

        const genericPlaceholders = ["Option A", "Option B", "Option C", "Option D"];
        let placeholderIdx = 0;
        while (finalOptions.length < 2 && finalOptions.length < 4) {
            const placeholder = genericPlaceholders[placeholderIdx++];
            if (!finalOptions.includes(placeholder)) finalOptions.push(placeholder);
            if (placeholderIdx >= genericPlaceholders.length) break;
        }

        console.log(`k_quiz.js: Q ID ${currentQ.id}: Final options:`, finalOptions);
        return finalOptions;
    }

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
            submitButton.style.display = 'none';
            return;
        }

        selectedQuestions.forEach((question, index) => {
            const questionBlock = document.createElement('div');
            questionBlock.classList.add('question-block');
            questionBlock.setAttribute('data-question-index', index);

            const questionNumber = document.createElement('h3');
            questionNumber.textContent = `Question ${index + 1} of ${selectedQuestions.length}`;
            questionBlock.appendChild(questionNumber);

            const questionText = document.createElement('p');
            questionText.textContent = question.questionText || "(Error: Question text missing)";
            questionBlock.appendChild(questionText);

            const optionsContainer = document.createElement('div');
            optionsContainer.classList.add('options-container');

            const options = generateOptions(question);
            if (!options || options.length === 0) {
                const p = document.createElement('p');
                p.textContent = "Error: Could not load options.";
                p.style.color = "red";
                optionsContainer.appendChild(p);
            } else {
                options.forEach((optionText, optIndex) => {
                    const optionId = `option-${index}-${optIndex}`;
                    const div = document.createElement('div');
                    div.classList.add('option');

                    const displayOptionText = escapeHtml(optionText);
                    const valueOptionText = escapeHtml(optionText);

                    div.innerHTML = `
                        <input type="radio" id="${optionId}" name="quizOption-${index}" value="${valueOptionText}">
                        <label for="${optionId}">${displayOptionText}</label>
                    `;
                    optionsContainer.appendChild(div);
                });
            }
            questionBlock.appendChild(optionsContainer);
            questionsContainerEl.appendChild(questionBlock);
        });
    }

    function startTimer() {
        console.log("k_quiz.js: startTimer called.");
        if (!timerEl) {
            console.error("k_quiz.js: Timer element not found.");
            return;
        }
        startTime = Date.now();
        timeLeft = quizTimeMinutes * 60;
        timerEl.textContent = formatTime(timeLeft);

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = formatTime(timeLeft);
            if (timeLeft <= 0) {
                console.log("k_quiz.js: Time is up!");
                clearInterval(timerInterval);
                handleSubmitQuiz("Time Out");
            }
        }, 1000);
    }

    function handleSubmitQuiz(status = "Completed") {
        console.log(`k_quiz.js: handleSubmitQuiz called with status: ${status}`);
        userAnswers = [];
        selectedQuestions.forEach((question, index) => {
            const questionBlock = document.querySelector(`.question-block[data-question-index="${index}"]`);
            if (!questionBlock) {
                console.warn(`Question block for index ${index} not found.`);
                return;
            }
            const selectedOptionInput = questionBlock.querySelector(`input[name="quizOption-${index}"]:checked`);
            const userAnswer = selectedOptionInput ? selectedOptionInput.value : "Not answered";
            const correctAnswer = question.Answer;

            userAnswers.push({
                questionId: question.id,
                questionText: question.questionText,
                options: Array.from(questionBlock.querySelectorAll('.option label')).map(l => l.textContent),
                correctAnswer: String(correctAnswer),
                userAnswer: String(userAnswer),
                isCorrect: userAnswer !== "Not answered" && String(userAnswer) === String(correctAnswer)
            });
        });
        finalizeQuiz(status);
    }

    function finalizeQuiz(status) {
        console.log(`k_quiz.js: finalizeQuiz called with status: ${status}`);
        if (timerInterval) clearInterval(timerInterval);
        const endTime = Date.now();
        const timeTakenSec = startTime === 0 ? quizTimeMinutes * 60 : Math.round((endTime - startTime) / 1000);

        let quizResults = {
            totalQuestionsAsked: selectedQuestions.length,
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
            showError("Error saving quiz results.");
            return;
        }

        console.log("k_quiz.js: Redirecting to k_result.html");
        window.location.href = 'k_result.html';
    }

    function initializeQuiz() {
        console.log("k_quiz.js: initializeQuiz called.");
        startTime = 0;

        if (allQuestions.length < numQuestionsToAsk && numQuestionsToAsk > 0 && allQuestions.length > 0) {
            console.warn(`k_quiz.js: Requested ${numQuestionsToAsk}, but only ${allQuestions.length} available.`);
        }

        selectedQuestions = selectRandomQuestions(allQuestions, numQuestionsToAsk);

        if (selectedQuestions.length === 0 && numQuestionsToAsk > 0) {
            showError(`No questions selected. Source has ${allQuestions.length} questions.`);
            return;
        }
        console.log(`k_quiz.js: ${selectedQuestions.length} questions selected.`);

        userAnswers = [];

        if (loadingMessageEl) loadingMessageEl.style.display = 'none';
        if (quizContentEl) quizContentEl.style.display = 'block';

        displayAllQuestions();
        if (selectedQuestions.length > 0) startTimer();
    }

    // Main Initialization
    console.log("k_quiz.js: Loading data from localStorage.");
    let quizTimeStr, numQuestionsStr, allQuestionsDataString;

    try {
        quizTimeStr = localStorage.getItem('quizTime');
        numQuestionsStr = localStorage.getItem('quizQuestions');
        allQuestionsDataString = localStorage.getItem('structuredSpreadsheetJsData_v2');
    } catch (e) {
        console.error("k_quiz.js: Error accessing localStorage:", e);
        showError("Error accessing browser storage.");
        return;
    }

    if (!quizTimeStr || !numQuestionsStr || !allQuestionsDataString) {
        let missing = [];
        if (!quizTimeStr) missing.push("quizTime");
        if (!numQuestionsStr) missing.push("numQuestions");
        if (!allQuestionsDataString) missing.push("question data");
        showError(`Missing data: ${missing.join(', ')}.`);
        return;
    }

    const quizTimeMinutes = parseInt(quizTimeStr, 10);
    const numQuestionsToAsk = parseInt(numQuestionsStr, 10);

    if (isNaN(quizTimeMinutes) || quizTimeMinutes <= 0 || isNaN(numQuestionsToAsk) || numQuestionsToAsk <= 0) {
        showError(`Invalid time (${quizTimeStr}) or questions (${numQuestionsStr}).`);
        return;
    }

    try {
        allQuestions = JSON.parse(allQuestionsDataString);
        if (!Array.isArray(allQuestions)) throw new Error("Data is not an array.");
        console.log(`k_quiz.js: ${allQuestions.length} questions loaded.`);
        if (allQuestions.length === 0 && numQuestionsToAsk > 0) {
            showError("No questions in storage.");
            return;
        }
    } catch (e) {
        showError(`Error parsing question data: ${e.message}.`);
        return;
    }

    if (submitButton) {
        submitButton.addEventListener('click', () => handleSubmitQuiz("Completed"));
    }

    initializeQuiz();
});
