// functions/api/logout.js

// Helper function to parse cookies
function getCookie(request, name) {
    let result = null;
    const cookieString = request.headers.get('Cookie');
    if (cookieString) {
        const cookies = cookieString.split(';');
        cookies.forEach(cookie => {
            const [cookieName, cookieValue] = cookie.split('=').map(c => c.trim());
            if (cookieName === name) {
                result = cookieValue;
            }
        });
    }
    return result;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    const MBBS_SESSION = env.MBBS_SESSION;

    if (!MBBS_SESSION) {
        console.error("Missing KV Binding in logout! Ensure MBBS_SESSION is bound.");
        // Still try to clear the cookie even if server config is an issue
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('Set-Cookie', `session_token=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
        return new Response(JSON.stringify({ error: 'Server configuration error during logout' }), {
            status: 500, headers: headers
        });
    }

    let userEmailFromSession = null;

    try {
        const sessionToken = getCookie(request, 'session_token');

        if (sessionToken) {
            console.log(`Logout initiated for session token: ${sessionToken.substring(0,8)}***`);

            // 1. Get session data (specifically the email) from MBBS_SESSION using the token
            const sessionDataJson = await MBBS_SESSION.get(sessionToken);

            if (sessionDataJson) {
                try {
                    const sessionData = JSON.parse(sessionDataJson);
                    if (sessionData && sessionData.email) {
                        userEmailFromSession = sessionData.email;
                        console.log(`Email associated with token ${sessionToken.substring(0,8)}*** is ${userEmailFromSession}`);

                        // 2. Delete the email-to-token mapping from MBBS_SESSION
                        // Only delete if the current token is the one mapped to this email.
                        // This prevents accidental deletion if tokens are somehow out of sync,
                        // though with proper login/verify, this should be the case.
                        const activeTokenForEmail = await MBBS_SESSION.get(userEmailFromSession);
                        if (activeTokenForEmail && activeTokenForEmail === sessionToken) {
                            await MBBS_SESSION.delete(userEmailFromSession);
                            console.log(`Deleted email-to-token mapping from MBBS_SESSION for email: ${userEmailFromSession}`);
                        } else {
                             console.warn(`During logout for token ${sessionToken.substring(0,8)}***, the active token for email ${userEmailFromSession} was different (${activeTokenForEmail ? activeTokenForEmail.substring(0,8)+'***' : 'None'}) or not found. Email mapping not deleted by this logout.`);
                        }
                    } else {
                        console.warn(`Session data found for token ${sessionToken.substring(0,8)}*** but email is missing. Cannot clear email-to-token mapping.`);
                    }
                } catch (parseError) {
                    console.error(`Failed to parse session data for token ${sessionToken.substring(0,8)}*** during logout:`, parseError);
                    // Proceed with deleting the token itself anyway
                }
            } else {
                console.log(`Logout for token ${sessionToken.substring(0,8)}***: Session data not found in MBBS_SESSION (likely already expired or invalid).`);
            }

            // 3. Always delete the session data (token -> session details) from MBBS_SESSION
            await MBBS_SESSION.delete(sessionToken);
            console.log(`Deleted session token data from MBBS_SESSION: ${sessionToken.substring(0,8)}***`);

        } else {
            console.log('Logout endpoint called, but no session_token cookie found.');
        }

        // 4. Prepare response headers to clear the cookie on the client
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append(
            'Set-Cookie',
            `session_token=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0` // Max-Age=0 expires immediately
        );

        return new Response(JSON.stringify({ message: 'Logout successful' }), {
            status: 200,
            headers: headers
        });

    } catch (error) {
        console.error('Error in /api/logout function:', error);
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('Set-Cookie', `session_token=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
        return new Response(JSON.stringify({ error: 'Internal Server Error during logout' }), {
            status: 500,
            headers: headers
        });
    }
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return await onRequestPost(context);
  }
  // CORS Preflight for POST
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": context.request.headers.get("Origin") || "*", // Be more specific in prod
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  return new Response('Method Not Allowed', { status: 405 });
}
