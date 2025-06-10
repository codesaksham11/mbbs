document.addEventListener('DOMContentLoaded', () => {
    const syncButton = document.getElementById('syncButton');
    const statusDiv = document.getElementById('status');
    const dataOutputDiv = document.getElementById('dataOutput');

    // --- START: CONFIGURATION YOU NEED TO UPDATE ---

    // 1. This now points to your Cloudflare Function endpoint.
    //    It should be a relative path to the function you created.
    const fetchDataApiEndpoint = '/api/fetch_api'; // <-- NO CHANGE NEEDED if using functions/api/fetch_api.js

    // The Web App URL and Secret API Key are NO LONGER NEEDED HERE.
    // They are now stored securely as environment variables in your Cloudflare Pages settings.

    // --- END: CONFIGURATION ---

    // This line is now simpler as the full URL construction with API key happens server-side.
    const spreadsheetUrl = fetchDataApiEndpoint; // This will be fetched relative to your site's domain

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
     * @throws {Error} if the CSV text is actually a JSON error object.
     */
    function convertCsvToJs(csv) {
        const trimmedCsv = csv.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!trimmedCsv) return [];

        // Check if the response is an error JSON from the Cloudflare function or Apps Script
        try {
            const errorCheck = JSON.parse(trimmedCsv);
            if (errorCheck.error) {
                // If it is an error, we throw it to be caught by the .catch block
                throw new Error(`API Error: ${errorCheck.error}`);
            }
            // If it parsed as JSON but wasn't our expected error structure,
            // it's unlikely to be valid CSV, so treat as an error or unexpected format.
            // However, for this specific function, we expect CSV or a specific error JSON.
            // If it's JSON but not an error, it means something unexpected happened.
            // For now, we'll let it pass and potentially fail at lines.split('\n') if it's not CSV.
            // A more robust check might be needed if other JSON formats are possible.
        } catch (e) {
            // This is expected for valid CSV data, which is not valid JSON.
            // If it was a real API error, it would have been thrown above and caught by the calling fetch's .catch.
            if (e.message.startsWith("API Error:")) { // Re-throw our specific errors
                throw e;
            }
            // Otherwise, assume it's CSV and proceed.
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
        statusDiv.style.color = '';
        const storedJsDataString = localStorage.getItem(jsonDataStorageKey);

        if (storedJsDataString) {
            try {
                const storedJsData = JSON.parse(storedJsDataString);
                displayJsDataAsText(storedJsData);
                statusDiv.textContent = `Data successfully loaded from local storage. ${storedJsData.length || 0} records found.`;
            } catch (error) {
                statusDiv.textContent = 'Error parsing data from local storage. It might be corrupted.';
                statusDiv.style.color = 'red';
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
        if (!isClientSideLoggedIn()) {
            statusDiv.textContent = 'Error: You must be logged in to sync data. Please log in and try again.';
            statusDiv.style.color = 'red';
            return;
        }

        statusDiv.style.color = '';
        statusDiv.textContent = 'Fetching data via proxy...'; // Updated message
        dataOutputDiv.innerHTML = '<p><em>Processing your request...</em></p>';
        syncButton.disabled = true;

        fetch(spreadsheetUrl) // This now calls '/api/fetch_api'
            .then(response => {
                // The Cloudflare function will return JSON for errors, CSV for success.
                // We need to check content-type or try parsing as JSON first for errors.
                const contentType = response.headers.get("content-type");
                if (!response.ok) {
                    // If not OK, try to parse as JSON, as our CF function returns JSON errors
                    if (contentType && contentType.includes("application/json")) {
                        return response.json().then(errData => {
                            throw new Error(errData.error || `Network response was not ok: ${response.status}`);
                        });
                    }
                    // Fallback for non-JSON errors
                    return response.text().then(text => {
                         throw new Error(`Network response was not ok: ${response.status} ${response.statusText}. Response: ${text.substring(0,100)}`);
                    });
                }
                // If OK, expect text (CSV)
                if (contentType && contentType.includes("text/csv")) {
                    return response.text();
                } else if (contentType && contentType.includes("application/json")){
                    // This case means the CF function succeeded (200 OK) but returned JSON.
                    // This could happen if Apps Script itself returned JSON successfully.
                    // Our current `convertCsvToJs` tries to handle this.
                    // Or it could be an error from Apps Script that the CF function proxied with a 200.
                    // For now, let's assume it might be an Apps Script JSON error passed through.
                    return response.text().then(text => {
                        // Let convertCsvToJs try to parse it as a potential JSON error
                        console.warn("Received JSON with a 200 OK response, attempting to parse as error or CSV-like JSON.");
                        return text;
                    });
                }
                // Fallback if content type is unexpected but response is OK
                return response.text();
            })
            .then(textData => { // This will be CSV text if successful
                statusDiv.textContent = 'Data fetched. Saving raw data to local storage...';
                localStorage.setItem(rawCsvStorageKey, textData); // textData is CSV
                console.log("Raw CSV data (or potentially JSON error string) saved to local storage.");

                statusDiv.textContent = 'Converting data to JS format with custom mappings...';
                const jsonData = convertCsvToJs(textData); // Handles CSV or JSON error string

                localStorage.setItem(jsonDataStorageKey, JSON.stringify(jsonData));
                console.log("Structured JS data saved to local storage:", jsonData);

                statusDiv.textContent = `Data synced and saved! Displaying ${jsonData.length} records in JSON format.`;
                displayJsDataAsText(jsonData);
            })
            .catch(error => {
                statusDiv.textContent = `Error during sync: ${error.message}`;
                statusDiv.style.color = 'red';
                dataOutputDiv.innerHTML = `<p>Failed to fetch or process data. Check console (F12). Error: ${error.message}</p>`;
                console.error('Sync process failed:', error);
            })
            .finally(() => {
                syncButton.disabled = false;
            });
    });

    loadAndDisplayFromLocalStorage();
});
