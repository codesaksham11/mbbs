document.addEventListener('DOMContentLoaded', () => {
    const syncButton = document.getElementById('syncButton');
    const statusDiv = document.getElementById('status');
    const dataOutputDiv = document.getElementById('dataOutput');
    
    const spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTDAMB0qsDiZMizUdlfjLImiT9R2H_K266U3k30rjv0CUuPoI66qDKociYAzYEftngisBHt5QOiOXCN/pub?output=csv';
    
    const rawCsvStorageKey = 'rawSpreadsheetCsvData_v2'; // Changed key in case old raw data exists
    const jsonDataStorageKey = 'structuredSpreadsheetJsData_v2'; // Changed key for new structure

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
                values.push(currentValue); // Values will be trimmed later
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue); // Add the last value
        return values.map(v => v.trim()); // Trim all parsed values
    }

    /**
     * Converts a CSV string to an array of JavaScript objects with specific key mappings.
     * "S.N" -> "id"
     * "Question" -> "questionText"
     * @param {string} csv - The CSV string data.
     * @returns {Array<Object>} An array of objects.
     */
    function convertCsvToJs(csv) {
        const trimmedCsv = csv.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n'); // Normalize newlines
        if (!trimmedCsv) return [];

        const lines = trimmedCsv.split('\n');
        if (lines.length < 1) return []; // Need at least a header line

        const headers = parseCsvLine(lines[0]);
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            const lineContent = lines[i].trim();
            if (!lineContent) continue; // Skip genuinely empty lines

            const values = parseCsvLine(lineContent);
            const obj = {};
            let hasMeaningfulData = false; // To track if the row has any non-empty value

            headers.forEach((header, index) => {
                const originalHeader = header; // Keep original for non-mapped keys
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
                    obj[originalHeader] = value; // Use original header name for other keys
                }
            });

            // Only add the object if it has some data.
            // This helps avoid pushing objects for rows that might parse as all empty strings
            // (e.g. if there are trailing commas or blank lines that weren't fully skipped).
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
        if (!data) { // Handles null or undefined
            dataOutputDiv.innerHTML = '<p>Data is not available.</p>';
            return;
        }
        if (data.length === 0) {
             dataOutputDiv.innerHTML = '<p>No data to display (dataset is empty).</p>';
             return;
        }

        const jsonString = JSON.stringify(data, null, 2); // Pretty print with 2 spaces indentation
        const preElement = document.createElement('pre');
        preElement.textContent = jsonString;
        
        dataOutputDiv.innerHTML = ''; // Clear previous content
        dataOutputDiv.appendChild(preElement);
    }

    /**
     * Loads data from local storage and displays it.
     */
    function loadAndDisplayFromLocalStorage() {
        statusDiv.textContent = 'Attempting to load data from local storage...';
        const storedJsDataString = localStorage.getItem(jsonDataStorageKey);

        if (storedJsDataString) {
            try {
                const storedJsData = JSON.parse(storedJsDataString);
                displayJsDataAsText(storedJsData); // This will handle empty array case
                statusDiv.textContent = `Data successfully loaded from local storage. ${storedJsData.length || 0} records found.`;
            } catch (error) {
                statusDiv.textContent = 'Error parsing data from local storage. It might be corrupted.';
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
                const jsonData = convertCsvToJs(csvText);
                
                localStorage.setItem(jsonDataStorageKey, JSON.stringify(jsonData));
                console.log("Structured JS data saved to local storage:", jsonData);

                statusDiv.textContent = `Data synced and saved! Displaying ${jsonData.length} records in JSON format.`;
                displayJsDataAsText(jsonData);
            })
            .catch(error => {
                statusDiv.textContent = `Error during sync: ${error.message}`;
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
