// functions/api/fetch_api.js

/**
 * Handles GET requests to /api/fetch_api
 * This function will fetch data from the Google Apps Script Web App
 * using secrets stored in Cloudflare Pages environment variables.
 */
export async function onRequestGet(context) {
    // context.env contains your Pages environment variables (secrets)
    const webAppUrl = context.env.APP_SCRIPT_URL;
    const secretApiKey = context.env.APP_SCRIPT_API_KEY;

    if (!webAppUrl || !secretApiKey) {
        console.error("Missing APP_SCRIPT_URL or APP_SCRIPT_API_KEY environment variables.");
        return new Response(JSON.stringify({ error: "Server configuration error: Missing API credentials." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const spreadsheetUrl = `${webAppUrl}?apiKey=${secretApiKey}`;

    try {
        console.log(`Fetching data from Google Apps Script: ${webAppUrl.substring(0,40)}...`); // Log partially for security
        const response = await fetch(spreadsheetUrl, {
            method: 'GET',
            // Google Apps Script web apps usually handle redirects automatically if needed (e.g. for new /dev URLs)
            // but if you were POSTing and needed to prevent redirects, you'd add: redirect: 'manual' or 'error'
        });

        if (!response.ok) {
            // Try to get error text from Google, but don't expose too much
            let errorText = `Google Apps Script responded with status: ${response.status}`;
            try {
                const googleError = await response.text();
                // Be careful about exposing detailed Google errors directly to the client
                // For now, we'll pass it along, but you might want to sanitize or generalize it.
                console.error("Error from Google Apps Script:", googleError);
                errorText = `Error fetching from Google: ${response.status} - ${googleError.substring(0, 200)}`;
            } catch (e) {
                console.error("Could not read error response body from Google Apps Script:", e);
            }
            return new Response(JSON.stringify({ error: errorText }), {
                status: response.status, // Propagate Google's status if it's an error
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const csvData = await response.text();

        // Forward the CSV data with the correct content type
        return new Response(csvData, {
            status: 200,
            headers: { 'Content-Type': 'text/csv; charset=utf-8' }, // Important for CSV
        });

    } catch (error) {
        console.error('Error in Cloudflare Function while fetching from Google Apps Script:', error);
        return new Response(JSON.stringify({ error: `Failed to fetch data via proxy: ${error.message}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
