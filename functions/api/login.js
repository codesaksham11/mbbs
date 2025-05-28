// functions/api/login.js

// Helper function to generate secure random token
function generateSessionToken() {
    return crypto.randomUUID();
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // KV Bindings
    const MBBS_DATA = env.MBBS_DATA;
    const MBBS_SESSION = env.MBBS_SESSION;

    if (!MBBS_DATA || !MBBS_SESSION) {
        console.error("Missing KV Bindings! Ensure MBBS_DATA and MBBS_SESSION are bound.");
        return new Response(JSON.stringify({ error: 'Server configuration error' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    const SESSION_TTL_SECONDS = 3600 * 24 * 7; // 7 days session validity (adjust as needed)

    try {
        let userDataInput;
        try {
            userDataInput = await request.json();
        } catch (error) {
            console.error("JSON parsing error:", error.message);
            return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const { name, email, mbbsId, forceLogin = false } = userDataInput;
        console.log(`Login attempt: Email: ${email}, MBBS ID: ${mbbsId ? mbbsId.substring(0,4) + '***' : 'N/A'}, Force: ${forceLogin}`);

        if (!name || typeof name !== 'string' || name.trim() === '' ||
            !email || typeof email !== 'string' || !email.includes('@') ||
            !mbbsId || typeof mbbsId !== 'string' || mbbsId.trim() === '') {
            console.log("Input validation failed for login.");
            return new Response(JSON.stringify({ error: 'Missing or invalid input fields' }), {
                status: 400, headers: { 'Content-Type': 'application/json' }
            });
        }

        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();
        const trimmedMbbsId = mbbsId.trim();

        // 1. Look up user in MBBS_DATA using MbbsId
        const storedUserJson = await MBBS_DATA.get(trimmedMbbsId);

        if (!storedUserJson) {
            console.log(`Login failed: MBBS ID not found - ${trimmedMbbsId}`);
            return new Response(JSON.stringify({ error: 'Invalid credentials or user not found' }), {
                status: 401, headers: { 'Content-Type': 'application/json' }
            });
        }

        let storedUserData;
        try {
            storedUserData = JSON.parse(storedUserJson);
        } catch (parseError) {
            console.error(`Failed to parse user data for MBBS ID ${trimmedMbbsId}:`, parseError);
            return new Response(JSON.stringify({ error: 'Internal server error during user data parsing' }), {
                status: 500, headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. Verify email and user status (e.g., isActive)
        const storedEmail = storedUserData.email ? storedUserData.email.trim().toLowerCase() : null;
        const storedNameFromRecord = storedUserData.name || trimmedName; // Use name from record if available

        if (storedEmail !== trimmedEmail) {
            console.log(`Login failed: Email mismatch for MBBS ID ${trimmedMbbsId}. Submitted: ${trimmedEmail}, Stored: ${storedEmail}`);
            return new Response(JSON.stringify({ error: 'Invalid credentials or email mismatch' }), {
                status: 401, headers: { 'Content-Type': 'application/json' }
            });
        }

        // Example: Check for an 'isActive' flag in your MBBS_DATA record
        if (storedUserData.isActive === false) { // Check explicitly for false
            console.log(`Login failed: Account for MBBS ID ${trimmedMbbsId} is inactive.`);
            return new Response(JSON.stringify({ error: 'Account is inactive. Please contact support.' }), {
                status: 403, headers: { 'Content-Type': 'application/json' } // 403 Forbidden
            });
        }

        // 3. Check for existing active session for this email in MBBS_SESSION
        const existingSessionTokenForEmail = await MBBS_SESSION.get(trimmedEmail);

        if (existingSessionTokenForEmail) {
            console.log(`Existing session token found for email ${trimmedEmail}: ${existingSessionTokenForEmail.substring(0,8)}***`);
            if (!forceLogin) {
                console.log(`Returning 409 Conflict for email: ${trimmedEmail}`);
                return new Response(JSON.stringify({
                    conflict: true,
                    message: 'This email is already logged in on another device or browser.'
                }), {
                    status: 409, headers: { 'Content-Type': 'application/json' }
                });
            } else {
                // Force login: Invalidate the old session
                console.log(`Force login for ${trimmedEmail}. Invalidating previous session token ${existingSessionTokenForEmail.substring(0,8)}***`);
                await MBBS_SESSION.delete(existingSessionTokenForEmail); // Delete session by its token
                await MBBS_SESSION.delete(trimmedEmail); // Delete the email-to-token mapping
                console.log(`Deleted old session token and email mapping for ${trimmedEmail}.`);
            }
        }

        // 4. Create New Session
        const newSessionToken = generateSessionToken();
        const sessionData = {
            mbbsId: trimmedMbbsId,
            name: storedNameFromRecord, // Use name from MBBS_DATA if available, else submitted name
            email: trimmedEmail
        };

        // Store session data (Token -> SessionDetails)
        await MBBS_SESSION.put(newSessionToken, JSON.stringify(sessionData), {
            expirationTtl: SESSION_TTL_SECONDS
        });
        console.log(`Stored new session data for token ${newSessionToken.substring(0,8)}***`);

        // Store active session mapping (Email -> Token)
        // IMPORTANT: Store the token itself as a plain string, not JSON.stringify(token)
        await MBBS_SESSION.put(trimmedEmail, newSessionToken, {
            expirationTtl: SESSION_TTL_SECONDS
        });
        console.log(`Stored new email-to-token mapping for ${trimmedEmail} -> ${newSessionToken.substring(0,8)}***`);

        // 5. Prepare Response - Set HttpOnly Cookie
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append(
            'Set-Cookie',
            `session_token=${newSessionToken}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
        );

        console.log(`Login successful for MBBS ID ${trimmedMbbsId}, Email ${trimmedEmail} (Forced: ${forceLogin})`);
        return new Response(JSON.stringify({
            message: 'Login successful',
            status: 'success'
        }), {
            status: 200,
            headers: headers
        });

    } catch (error) {
        console.error('Error in /api/login function:', error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            details: error.message
        }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Optional: Add handlers for other methods if needed, or a catch-all
export async function onRequest(context) {
  if (context.request.method === "POST") {
    return await onRequestPost(context);
  }
  // CORS Preflight for POST
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204, // No Content
      headers: {
        "Access-Control-Allow-Origin": context.request.headers.get("Origin") || "*", // Be more specific in prod
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400", // 1 day
      },
    });
  }
  return new Response('Method Not Allowed', { status: 405 });
}
