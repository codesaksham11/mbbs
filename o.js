document.addEventListener('DOMContentLoaded', () => {
    const syncButton = document.getElementById('syncButton');
    const statusDiv = document.getElementById('status');
    const dataOutputDiv = document.getElementById('dataOutput');

    // --- START: CONFIGURATION YOU NEED TO UPDATE ---

    // 1. Paste the NEW Web App URL you got after deploying the Apps Script.
    //    It must be the one deployed with "Who has access: Anyone".
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbznVqse8NTGp_uy16q0uPjHDCWdzjNmkJ1N77v5e_6lOJsiT-pOXLgq4QSfOSLwFrsd/exec'; // <-- CHANGE THIS

    // 2. Paste the EXACT same secret key you created in your Apps Script.
    const secretApiKey = 'Saksham-is-great-guy'; // <-- CHANGE THIS

    // --- END: CONFIGURATION ---


    // This line constructs the final URL to be fetched. No need to change this.
    const spreadsheetUrl = `${webAppUrl}?apiKey=${secretApiKey}`;

    const rawCsvStorageKey = 'rawSpreadsheetCsvData_v2';
    const jsonDataStorageKey = 'structuredSpreadsheetJsData_v2';

    // --- START: Helper Functions for Cookie and Login Check ---
    /**
     * Gets a cookie by its name.
     * @param {string} name - The name of the cookie.
     * @returns {string|null} The cookie value or null if not found.
     */
    function getCookie(name) {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i].trim();
            // Does this cookie string begin with the name we want?
            if (cookie.startsWith(name + '=')) {
                return cookie.substring(name.length + 1, cookie.length);
            }
        }
        return null;
    }

    /**
     * Checks if the user appears to be logged in based on client-side cookie.
     * @returns {boolean} True if a session_token cookie exists, false otherwise.
     */
    function isClientSideLoggedIn() {
        const sessionToken = getCookie('session_token');
        // Check if token exists and is not an empty string
        return sessionToken !== null && sessionToken !== '';
    }
    // --- END: Helper Functions ---


    /**
     * Parses a single line of CSV text, handling quoted fields.
     * @param {string} line - The CSV line.
     * @returns {string[]} An array of string values.
     */
    function parseCsvLine(line) {
        const values = [];
        let currentValue = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i+1] === '"') { // Escaped quote ("")
                    currentValue += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(currentValue);
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue);
        return values.map(v => v.trim());
    }

    /**
     * Converts a CSV string to an array of JavaScript objects with specific key mappings.
     * @param {string} csv - The CSV string data.
     * @returns {Array<Object>} An array of objects.
     */
    function convertCsvToJs(csv) {
        const trimmedCsv = csv.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!trimmedCsv) return [];

        // Check if the response is an error JSON from the Apps Script
        try {
            const errorCheck = JSON.parse(trimmedCsv);
            if (errorCheck.error) {
                // If it is an error, we throw it to be caught by the .catch block
                throw new Error(`API Error: ${errorCheck.error}`);
            }
        } catch (e) {
            // This is expected for valid CSV data, which is not valid JSON.
            // If it was a real API error, it would have been thrown above.
        }

        const lines = trimmedCsv.split('\n');
        if (lines.length < 1) return [];

        const headers = parseCsvLine(lines[0]);
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            const lineContent = lines[i].trim();
            if (!lineContent) continue;

            const values = parseCsvLine(lineContent);
            const obj = {};
            let hasMeaningfulData = false;

            headers.forEach((header, index) => {
                const originalHeader = header;
                const upperHeader = header.toUpperCase();
                const value = values[index] !== undefined ? values[index] : '';

                if (value.trim() !== "") {
                    hasMeaningfulData = true;
                }

                if (upperHeader === "S.N") {
                    obj["id"] = value;
                } else if (upperHeader === "QUESTION") {
                    obj["questionText"] = value;
                } else {
                    obj[originalHeader] = value;
                }
            });

            if (hasMeaningfulData) {
                 result.push(obj);
            }
        }
        return result;
    }

    /**
     * Displays the JavaScript data (array of objects) as a pretty-printed JSON string.
     * @param {Array<Object>} data - The data to display.
     */
    function displayJsDataAsText(data) {
        if (!data) {
            dataOutputDiv.innerHTML = '<p>Data is not available.</p>';
            return;
        }
        if (data.length === 0) {
             dataOutputDiv.innerHTML = '<p>No data to display (dataset is empty).</p>';
             return;
        }

        const jsonString = JSON.stringify(data, null, 2);
        const preElement = document.createElement('pre');
        preElement.textContent = jsonString;

        dataOutputDiv.innerHTML = '';
        dataOutputDiv.appendChild(preElement);
    }

    /**
     * Loads data from local storage and displays it.
     */
    function loadAndDisplayFromLocalStorage() {
        statusDiv.textContent = 'Attempting to load data from local storage...';
        statusDiv.style.color = ''; // Reset color
        const storedJsDataString = localStorage.getItem(jsonDataStorageKey);

        if (storedJsDataString) {
            try {
                const storedJsData = JSON.parse(storedJsDataString);
                displayJsDataAsText(storedJsData);
                statusDiv.textContent = `Data successfully loaded from local storage. ${storedJsData.length || 0} records found.`;
            } catch (error) {
                statusDiv.textContent = 'Error parsing data from local storage. It might be corrupted.';
                statusDiv.style.color = 'red'; // Indicate error
                console.error('Error parsing local storage data:', error);
                dataOutputDiv.innerHTML = '<p>Could not parse data from local storage. Try syncing again.</p>';
            }
        } else {
            statusDiv.textContent = 'No data found in local storage. Click "Sync Data Now" to fetch it.';
            dataOutputDiv.innerHTML = '<p>No data has been synced yet, or no data was found in local storage on page load.</p>';
        }
    }

    // Event listener for the sync button
    syncButton.addEventListener('click', () => {
        // --- START: YOUR CUSTOM LOGIN CHECK ---
        if (!isClientSideLoggedIn()) {
            statusDiv.textContent = 'Error: You must be logged in to sync data. Please log in and try again.';
            statusDiv.style.color = 'red'; // Style the error message
            return; // Stop further execution of the sync process
        }
        // --- END: LOGIN CHECK ---

        // If login check passes, proceed with the fetch using the secure URL
        statusDiv.style.color = '';
        statusDiv.textContent = 'Fetching data from spreadsheet...';
        dataOutputDiv.innerHTML = '<p><em>Processing your request...</em></p>';
        syncButton.disabled = true;

        fetch(spreadsheetUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
                }
                return response.text();
            })
            .then(csvText => {
                statusDiv.textContent = 'CSV data fetched. Saving raw CSV to local storage...';
                localStorage.setItem(rawCsvStorageKey, csvText);
                console.log("Raw CSV data saved to local storage.");

                statusDiv.textContent = 'Converting CSV to JS format with custom mappings...';
                const jsonData = convertCsvToJs(csvText); // This now also handles API errors

                localStorage.setItem(jsonDataStorageKey, JSON.stringify(jsonData));
                console.log("Structured JS data saved to local storage:", jsonData);

                statusDiv.textContent = `Data synced and saved! Displaying ${jsonData.length} records in JSON format.`;
                displayJsDataAsText(jsonData);
            })
            .catch(error => {
                statusDiv.textContent = `Error during sync: ${error.message}`;
                statusDiv.style.color = 'red';
                dataOutputDiv.innerHTML = `<p>Failed to fetch or process data. Please check the console (F12) for more details. Error: ${error.message}</p>`;
                console.error('Sync process failed:', error);
            })
            .finally(() => {
                syncButton.disabled = false;
            });
    });

    // Initial load from local storage when the page loads
    loadAndDisplayFromLocalStorage();
});
