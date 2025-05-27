document.addEventListener('DOMContentLoaded', () => {
    const quizResults = JSON.parse(localStorage.getItem('quizResults'));

    if (!quizResults) {
        alert('No quiz results found. Redirecting to quiz setup.');
        window.location.href = 'k.html'; // Assuming k.html is your setup page
        return;
    }

    // DOM elements for summary
    const totalQuestionsEl = document.getElementById('total-questions-value');
    const correctAnswersEl = document.getElementById('correct-answers-value');
    const scorePercentageEl = document.getElementById('score-percentage');
    const timeTakenEl = document.getElementById('time-taken-value');
    const encouragementMessageEl = document.getElementById('encouragementMessage');

    // DOM elements for details
    const toggleDetailsButton = document.getElementById('toggleDetailsButton');
    const detailedResultsSectionEl = document.getElementById('detailedResultsSection');
    const answersBreakdownEl = document.getElementById('answers-breakdown');

    // DOM element for back button
    const backButton = document.getElementById('backButton');

    // Calculate results
    const correctCount = quizResults.answeredQuestionsDetail.filter(q => q.isCorrect).length;
    const totalQuestions = quizResults.totalQuestionsAsked;
    const timeTaken = quizResults.timeTaken;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    // Display summary
    totalQuestionsEl.textContent = totalQuestions;
    correctAnswersEl.textContent = correctCount;
    scorePercentageEl.textContent = `${score}%`;
    timeTakenEl.textContent = `${timeTaken}s`;

    // Encouragement message
    if (score >= 80) {
        encouragementMessageEl.innerHTML = `<i class="fas fa-star"></i> Excellent work! You aced it! <i class="fas fa-star"></i>`;
    } else if (score >= 60) {
        encouragementMessageEl.innerHTML = `<i class="fas fa-thumbs-up"></i> Good job! You have a solid understanding.`;
    } else if (score >= 40) {
        encouragementMessageEl.innerHTML = `Keep practicing! You're getting there.`;
    } else {
        encouragementMessageEl.innerHTML = `Don't give up! Review the material and try again.`;
    }
    if (timeTaken > quizResults.totalTimeAllowed && quizResults.totalTimeAllowed > 0) { // Assuming totalTimeAllowed is part of quizResults
         timeTakenEl.textContent += ' (Time ran out)';
         timeTakenEl.classList.add('timeout');
    }


    // Toggle details functionality
    toggleDetailsButton.addEventListener('click', () => {
        const isHidden = detailedResultsSectionEl.classList.toggle('hidden');
        if (isHidden) {
            toggleDetailsButton.innerHTML = '<i class="fas fa-eye"></i> Show Details';
        } else {
            toggleDetailsButton.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Details';
        }
    });

    // Back button functionality
    backButton.addEventListener('click', () => {
        localStorage.removeItem('quizResults'); // Optional: clear results when going back
        window.location.href = 'k.html'; // Assuming k.html is your setup page
    });

    // Generate detailed view
    quizResults.answeredQuestionsDetail.forEach((questionData, index) => {
        const questionCard = document.createElement('div');
        questionCard.classList.add('detailed-question-card');

        if (questionData.userAnswer === 'Not answered') {
            questionCard.classList.add('result-skipped');
        } else if (questionData.isCorrect) {
            questionCard.classList.add('result-correct');
        } else {
            questionCard.classList.add('result-incorrect');
        }

        const questionTextEl = document.createElement('p');
        questionTextEl.classList.add('detailed-question-text');
        questionTextEl.innerHTML = `<strong>Q${index + 1}:</strong> ${questionData.questionText}`;
        questionCard.appendChild(questionTextEl);

        const optionsUl = document.createElement('ul');
        optionsUl.classList.add('detailed-options-list');

        questionData.options.forEach(optionText => {
            const optionLi = document.createElement('li');
            
            let optionDisplay = optionText;
            let iconsHTML = '';

            if (optionText === questionData.correctAnswer) {
                optionLi.classList.add('correct-option'); // Styles the text (e.g., gold color)
                iconsHTML += ' <span class="icon-wrapper"><i class="fas fa-check icon"></i></span>';
            }

            if (optionText === questionData.userAnswer) {
                if (!questionData.isCorrect) {
                    // User selected this option and it was wrong
                    iconsHTML += ' <span class="icon-wrapper"><i class="fas fa-times icon" style="color: #e74c3c;"></i></span>';
                }
                // If user's answer is correct, the check mark is already handled above.
                 optionDisplay = `<strong>${optionText} (Your answer)</strong>`;
            } else if (optionText === questionData.correctAnswer) {
                 optionDisplay = `${optionText}`; // Correct answer is already styled by class
            }


            optionLi.innerHTML = optionDisplay + iconsHTML;
            optionsUl.appendChild(optionLi);
        });

        questionCard.appendChild(optionsUl);
        answersBreakdownEl.appendChild(questionCard);
    });
});
