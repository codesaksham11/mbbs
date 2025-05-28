document.addEventListener('DOMContentLoaded', () => {
    const quizResults = JSON.parse(localStorage.getItem('quizResults'));

    // Corrected constants for CEE Nepal Format
    const MARKS_CORRECT = 1;      // 1 mark for correct
    const MARKS_INCORRECT = -0.25; // -0.25 for incorrect
    const MARKS_SKIPPED = 0;      // 0 for skipped

    // Expected subject order for display (mirroring k_quiz.js CATEGORY_CONFIG)
    const SUBJECT_DISPLAY_ORDER = [
        "physics", "chemistry", "botany", "zoology", "mat"
    ];

    if (!quizResults || !quizResults.answeredQuestionsDetail) {
        alert('No valid quiz results found or results are corrupted. Redirecting to quiz setup.');
        console.error("k_result.js: quizResults or quizResults.answeredQuestionsDetail is missing.");
        window.location.href = 'k.html';
        return;
    }

    // --- 1. Calculate Core Metrics ---
    let correctCount = 0;
    let incorrectCount = 0;
    let skippedCount = 0;
    let marksObtained = 0;

    quizResults.answeredQuestionsDetail.forEach(q => {
        const userAnswerStr = String(q.userAnswer);

        if (userAnswerStr === 'Not answered' || userAnswerStr === 'DOM Error') {
            skippedCount++;
            marksObtained += MARKS_SKIPPED;
        } else if (q.isCorrect) {
            correctCount++;
            marksObtained += MARKS_CORRECT;
        } else {
            incorrectCount++;
            marksObtained += MARKS_INCORRECT;
        }
    });

    const totalQuestionsInQuiz = quizResults.totalQuestionsAskedInConfig || quizResults.totalQuestionsDisplayed || 0;
    const totalPossibleMarks = totalQuestionsInQuiz * MARKS_CORRECT; // 1 mark per question
    let percentageFromMarks = totalPossibleMarks > 0 ? Math.round((marksObtained / totalPossibleMarks) * 1000) / 10 : 0;

    // --- 2. DOM Elements for Summary ---
    const correctRatioEl = document.getElementById('correct-ratio-value');
    const marksObtainedEl = document.getElementById('marks-obtained-value');
    const scorePercentageEl = document.getElementById('score-percentage');
    const timeTakenEl = document.getElementById('time-taken-value');
    const encouragementMessageEl = document.getElementById('encouragementMessage');

    // --- 3. Display Summary ---
    if (correctRatioEl) correctRatioEl.textContent = `${correctCount} / ${totalQuestionsInQuiz}`;
    if (marksObtainedEl) {
        const formattedMarks = Number.isInteger(marksObtained) ? marksObtained : marksObtained.toFixed(2);
        const formattedTotalPossible = Number.isInteger(totalPossibleMarks) ? totalPossibleMarks : totalPossibleMarks.toFixed(2);
        marksObtainedEl.textContent = `${formattedMarks} / ${formattedTotalPossible}`;
    }
    if (scorePercentageEl) scorePercentageEl.textContent = `${percentageFromMarks}%`;
    if (timeTakenEl) {
        timeTakenEl.textContent = `${quizResults.timeTaken}s`;
        if (quizResults.status === "Time Out" && quizResults.maxTime > 0) {
            timeTakenEl.textContent += ' (Time Ran Out)';
            timeTakenEl.classList.add('timeout');
        }
    }

    // Encouragement message
    if (encouragementMessageEl) {
        if (percentageFromMarks >= 80) {
            encouragementMessageEl.innerHTML = `<i class="fas fa-star"></i> Excellent work! You aced it! <i class="fas fa-star"></i>`;
        } else if (percentageFromMarks >= 60) {
            encouragementMessageEl.innerHTML = `<i class="fas fa-thumbs-up"></i> Good job! You have a solid understanding.`;
        } else if (percentageFromMarks >= 40) {
            encouragementMessageEl.innerHTML = `Keep practicing! You're getting there.`;
        } else {
            encouragementMessageEl.innerHTML = `Don't give up! Review the material and try again.`;
        }
    }

    // --- 4. Detailed Results Section Elements ---
    const toggleDetailsButton = document.getElementById('toggleDetailsButton');
    const detailedResultsSectionEl = document.getElementById('detailedResultsSection');
    const answersBreakdownEl = document.getElementById('answers-breakdown');
    const backButton = document.getElementById('backButton');

    if (toggleDetailsButton && detailedResultsSectionEl) {
        toggleDetailsButton.addEventListener('click', () => {
            const isHidden = detailedResultsSectionEl.classList.toggle('hidden');
            toggleDetailsButton.innerHTML = isHidden ? '<i class="fas fa-eye"></i> Show Details' : '<i class="fas fa-eye-slash"></i> Hide Details';
        });
    }

    if (backButton) {
        backButton.addEventListener('click', () => {
            localStorage.removeItem('quizResults');
            window.location.href = 'k.html';
        });
    }

    // --- Generate Detailed View ---
    if (answersBreakdownEl) {
        answersBreakdownEl.innerHTML = '';

        const questionsBySubject = {};
        quizResults.answeredQuestionsDetail.forEach(q => {
            const subjectKey = (q.subject || 'uncategorized').toLowerCase().trim();
            if (!questionsBySubject[subjectKey]) questionsBySubject[subjectKey] = [];
            questionsBySubject[subjectKey].push(q);
        });

        const subjectsInResults = Object.keys(questionsBySubject);
        const orderedSubjectsToDisplay = SUBJECT_DISPLAY_ORDER.filter(s => subjectsInResults.includes(s))
            .concat(subjectsInResults.filter(s => !SUBJECT_DISPLAY_ORDER.includes(s)));

        let overallQuestionIndex = 0;

        orderedSubjectsToDisplay.forEach(subjectKey => {
            const questionsInThisSubject = questionsBySubject[subjectKey];
            if (questionsInThisSubject && questionsInThisSubject.length > 0) {
                const subjectHeader = document.createElement('h2');
                subjectHeader.textContent = subjectKey.charAt(0).toUpperCase() + subjectKey.slice(1);
                subjectHeader.classList.add('detailed-subject-header');
                answersBreakdownEl.appendChild(subjectHeader);

                questionsInThisSubject.forEach((questionData) => {
                    overallQuestionIndex++;
                    const questionCard = document.createElement('div');
                    questionCard.classList.add('detailed-question-card');

                    const userAnswerStr = String(questionData.userAnswer);
                    if (userAnswerStr === 'Not answered' || userAnswerStr === 'DOM Error') {
                        questionCard.classList.add('result-skipped');
                    } else if (questionData.isCorrect) {
                        questionCard.classList.add('result-correct');
                    } else {
                        questionCard.classList.add('result-incorrect');
                    }

                    const questionTextEl = document.createElement('p');
                    questionTextEl.classList.add('detailed-question-text');
                    questionTextEl.innerHTML = `<strong>Q${overallQuestionIndex}:</strong> ${escapeHtml(questionData.questionText)}`;
                    questionCard.appendChild(questionTextEl);

                    const optionsUl = document.createElement('ul');
                    optionsUl.classList.add('detailed-options-list');

                    const optionsToShow = Array.isArray(questionData.options) ? questionData.options : [];
                    if (optionsToShow.length === 0) {
                        console.warn(`Options array empty for QID ${questionData.questionId}. Displaying limited info.`);
                        if (questionData.correctAnswer) optionsToShow.push(String(questionData.correctAnswer));
                        if (userAnswerStr && userAnswerStr !== 'Not answered' && userAnswerStr !== 'DOM Error' && userAnswerStr !== String(questionData.correctAnswer)) {
                            if (!optionsToShow.includes(userAnswerStr)) optionsToShow.push(userAnswerStr);
                        }
                    }

                    optionsToShow.forEach(optionText => {
                        const optionLi = document.createElement('li');
                        let displayOptionText = escapeHtml(optionText);
                        let iconsHTML = '';

                        const isCorrectOption = (String(optionText) === String(questionData.correctAnswer));
                        const isUserChoice = (userAnswerStr !== 'Not answered' && userAnswerStr !== 'DOM Error' && String(optionText) === userAnswerStr);

                        if (isCorrectOption) {
                            optionLi.classList.add('correct-option');
                            iconsHTML += ' <span class="icon-wrapper"><i class="fas fa-check icon"></i></span>';
                        }

                        if (isUserChoice) {
                            if (!questionData.isCorrect) {
                                iconsHTML += ' <span class="icon-wrapper"><i class="fas fa-times icon"></i></span>';
                            }
                            displayOptionText = `<strong>${escapeHtml(optionText)} (Your answer)</strong>`;
                        }

                        optionLi.innerHTML = displayOptionText + iconsHTML;
                        optionsUl.appendChild(optionLi);
                    });

                    if (optionsToShow.length === 0) {
                        const p = document.createElement('p');
                        p.textContent = "Options data not available for this question.";
                        p.style.color = "#e74c3c";
                        optionsUl.appendChild(p);
                    }

                    questionCard.appendChild(optionsUl);
                    answersBreakdownEl.appendChild(questionCard);
                });
            }
        });
    }

    // Updated escapeHtml function
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            if (unsafe === null || typeof unsafe === 'undefined') return '';
            return String(unsafe);
        }
        return unsafe
            .replace(/&/g, "&amp;")  // Must be first to avoid double-encoding
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
});
