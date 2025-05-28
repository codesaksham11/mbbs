// app.js

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    // Login Modal
    const loginHeaderBtn = document.getElementById('login-header-btn');
    const loginModalOverlay = document.getElementById('login-modal-overlay');
    const loginModalCloseBtn = document.getElementById('login-modal-close-btn');
    const loginForm = document.getElementById('login-form');
    const nameInput = document.getElementById('name-input');
    const emailInput = document.getElementById('email-input');
    const mbbsIdInput = document.getElementById('mbbs-id-input');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const loginErrorMessage = document.getElementById('login-error-message');

    // Confirmation Modal
    const confirmationModalOverlay = document.getElementById('confirmation-modal-overlay');
    const confirmationModalMessage = document.getElementById('confirmation-modal-message');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmProceedBtn = document.getElementById('confirm-proceed-btn');

    // User Status in Header
    const userInfoDiv = document.getElementById('user-info');
    const userNameSpan = document.getElementById('user-name');
    const logoutBtn = document.getElementById('logout-btn');

    // --- State Variables ---
    let pendingLoginData = null; // To store form data during confirmation

    // --- Utility Functions ---
    function showModal(modalOverlay) {
        if (modalOverlay) {
            modalOverlay.style.display = 'flex';
            setTimeout(() => modalOverlay.classList.add('visible'), 10); // For transition
            // Trap focus (basic example, can be made more robust)
            const firstFocusableElement = modalOverlay.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
            if (firstFocusableElement) firstFocusableElement.focus();
        }
    }

    function hideModal(modalOverlay) {
        if (modalOverlay) {
            modalOverlay.classList.remove('visible');
            setTimeout(() => modalOverlay.style.display = 'none', 300); // Match CSS transition
        }
    }

    function updateLoginButtonState(isSubmitting, message = 'Login') {
        if (loginSubmitBtn) {
            loginSubmitBtn.disabled = isSubmitting;
            loginSubmitBtn.innerHTML = isSubmitting
                ? '<span class="icon">⏳</span> Verifying...'
                : `<span class="icon">🚀</span> ${message}`;
        }
    }

    function displayLoginError(message) {
        if (loginErrorMessage) {
            loginErrorMessage.textContent = message;
            loginErrorMessage.style.color = '#d9534f'; // Error color
        }
    }

    function displayLoginVerifying(message) {
        if (loginErrorMessage) {
            loginErrorMessage.textContent = message;
            loginErrorMessage.style.color = '#f39c12'; // Warning/verifying color
        }
    }

    function clearLoginMessages() {
        if (loginErrorMessage) loginErrorMessage.textContent = '';
    }

    // --- UI Update Functions ---
    function showLoggedInState(name) {
        if (userNameSpan) userNameSpan.textContent = name;
        if (userInfoDiv) userInfoDiv.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'flex';
        if (loginHeaderBtn) loginHeaderBtn.style.display = 'none';
        hideModal(loginModalOverlay);
    }

    function showLoggedOutState() {
        if (userInfoDiv) userInfoDiv.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (loginHeaderBtn) loginHeaderBtn.style.display = 'flex';
        if (userNameSpan) userNameSpan.textContent = 'User'; // Reset
    }

    // --- API Call Functions ---
    async function handleLogin(formData, forceLogin = false) {
        clearLoginMessages();
        updateLoginButtonState(true);
        displayLoginVerifying('Verifying credentials...');

        const payload = {
            name: formData.get('name'),
            email: formData.get('email'),
            mbbsId: formData.get('mbbsId'), // Ensure your backend expects 'mbbsId'
            forceLogin: forceLogin
        };

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.status === 'success') {
                displayLoginVerifying('Login successful! Redirecting...');
                // Call verifySession to get user details and update UI
                await verifySession(); // This will update the UI
                hideModal(loginModalOverlay);
            } else if (response.status === 409 && data.conflict) {
                // Session conflict
                pendingLoginData = formData; // Store current form data
                if (confirmationModalMessage) confirmationModalMessage.textContent = data.message || 'This email is already logged in elsewhere. Proceed to log out the other session?';
                hideModal(loginModalOverlay); // Hide login modal first
                showModal(confirmationModalOverlay); // Then show confirmation modal
                updateLoginButtonState(false); // Re-enable login button on login modal
            } else {
                displayLoginError(data.error || 'Login failed. Please check your details.');
                updateLoginButtonState(false);
            }
        } catch (error) {
            console.error('Login error:', error);
            displayLoginError('An unexpected error occurred. Please try again.');
            updateLoginButtonState(false);
        }
    }

    async function verifySession() {
        try {
            const response = await fetch('/api/verify-session');
            if (!response.ok) {
                // Handle non-2xx responses if necessary, e.g., server error
                console.error('Verify session failed with status:', response.status);
                showLoggedOutState();
                return;
            }
            const data = await response.json();

            if (data.loggedIn && data.name) {
                showLoggedInState(data.name);
            } else {
                showLoggedOutState();
            }
        } catch (error) {
            console.error('Error verifying session:', error);
            showLoggedOutState(); // Assume logged out on error
        }
    }

    async function handleLogout() {
        if (logoutBtn) logoutBtn.disabled = true;
        try {
            const response = await fetch('/api/logout', { method: 'POST' });
            // We don't strictly need to parse JSON if backend just sends 200 OK
            if (response.ok) {
                showLoggedOutState();
            } else {
                console.error('Logout failed');
                // Optionally show an error to the user
            }
        } catch (error) {
            console.error('Error during logout:', error);
        } finally {
            if (logoutBtn) logoutBtn.disabled = false;
        }
    }

    // --- Event Listeners ---
    if (loginHeaderBtn) {
        loginHeaderBtn.addEventListener('click', () => {
            clearLoginMessages();
            if(loginForm) loginForm.reset(); // Clear form fields
            showModal(loginModalOverlay);
            if(nameInput) nameInput.focus();
        });
    }

    if (loginModalCloseBtn) {
        loginModalCloseBtn.addEventListener('click', () => hideModal(loginModalOverlay));
    }
    if (loginModalOverlay) {
        loginModalOverlay.addEventListener('click', (event) => {
            if (event.target === loginModalOverlay) {
                hideModal(loginModalOverlay);
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(loginForm);
            await handleLogin(formData, false); // Initial login attempt, not forced
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Confirmation Modal Logic
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', () => {
            hideModal(confirmationModalOverlay);
            pendingLoginData = null; // Clear pending data
            // Optionally re-open login modal or just do nothing
        });
    }
    if (confirmationModalOverlay) {
        confirmationModalOverlay.addEventListener('click', (event) => {
            if (event.target === confirmationModalOverlay) {
                hideModal(confirmationModalOverlay);
                pendingLoginData = null;
            }
        });
    }

    if (confirmProceedBtn) {
        confirmProceedBtn.addEventListener('click', async () => {
            hideModal(confirmationModalOverlay);
            if (pendingLoginData) {
                await handleLogin(pendingLoginData, true); // Retry login, this time forced
                pendingLoginData = null; // Clear pending data
            }
        });
    }

    // Close modals with Escape key
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (loginModalOverlay && loginModalOverlay.classList.contains('visible')) {
                hideModal(loginModalOverlay);
            }
            if (confirmationModalOverlay && confirmationModalOverlay.classList.contains('visible')) {
                hideModal(confirmationModalOverlay);
                pendingLoginData = null; // Clear pending data if escape is pressed on confirm modal
            }
            // Kharidar modal escape is handled in index.html's inline script
        }
    });


    // --- Initial Setup ---
    verifySession(); // Check login status on page load

});
