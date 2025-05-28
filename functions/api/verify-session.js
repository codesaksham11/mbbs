// functions/api/verify-session.js

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

export async function onRequestGet(context) { // Changed to onRequestGet for clarity
    const { request, env } = context;

    const MBBS_DATA = env.MBBS_DATA;
    const MBBS_SESSION = env.MBBS_SESSION;

    if (!MBBS_DATA || !MBBS_SESSION) {
        console.error("Missing KV Bindings in verify-session! Ensure MBBS_DATA and MBBS_SESSION are bound.");
        // Even on server config error, client should see logged out state
        return new Response(JSON.stringify({ loggedIn: false, error: 'Server configuration error' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const sessionTokenFromCookie = getCookie(request, 'session_token');

        if (!sessionTokenFromCookie) {
            return new Response(JSON.stringify({ loggedIn: false, reason: "No session token cookie" }), {
                headers: { 'Content-Type': 'application/json' }, status: 200
            });
        }

        // 1. Look up the session token in MBBS_SESSION to get session data
        const sessionDataJson = await MBBS_SESSION.get(sessionTokenFromCookie);

        if (!sessionDataJson) {
            console.log(`Verify session: Token ${sessionTokenFromCookie.substring(0,8)}*** from cookie not found in MBBS_SESSION (likely expired/invalid).`);
            // Clear the potentially bad cookie by sending an expired cookie instruction
            const clearCookieHeaders = new Headers({ 'Content-Type': 'application/json' });
            clearCookieHeaders.append('Set-Cookie', `session_token=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
            return new Response(JSON.stringify({ loggedIn: false, reason: "Session token invalid or expired" }), {
                headers: clearCookieHeaders, status: 200
            });
        }

        let sessionData;
        try {
            sessionData = JSON.parse(sessionDataJson);
        } catch (e) {
            console.error(`Verify session: Failed to parse session data for token ${sessionTokenFromCookie.substring(0,8)}***`, e);
            await MBBS_SESSION.delete(sessionTokenFromCookie); // Delete corrupted session
            return new Response(JSON.stringify({ loggedIn: false, reason: "Corrupted session data" }), {
                headers: { 'Content-Type': 'application/json' }, status: 200
            });
        }

        const { mbbsId, name, email } = sessionData;

        if (!mbbsId || !name || !email) {
            console.error(`Verify session: Incomplete session data for token ${sessionTokenFromCookie.substring(0,8)}***. Data:`, sessionData);
            await MBBS_SESSION.delete(sessionTokenFromCookie); // Delete incomplete session
            return new Response(JSON.stringify({ loggedIn: false, reason: "Incomplete session data" }), {
                headers: { 'Content-Type': 'application/json' }, status: 200
            });
        }

        // 2. CRITICAL: Verify that this sessionTokenFromCookie is still the active token for this email
        // This prevents using an old (but not yet TTL-expired) token if a newer session was created for the same email.
        const activeTokenForEmail = await MBBS_SESSION.get(email); // Email is key, token is value

        if (!activeTokenForEmail || activeTokenForEmail !== sessionTokenFromCookie) {
            console.log(`Verify session: Token mismatch for email ${email}. Cookie token: ${sessionTokenFromCookie.substring(0,8)}***, Active token in KV: ${activeTokenForEmail ? activeTokenForEmail.substring(0,8)+'***' : 'None'}. Session superseded or invalid.`);
            await MBBS_SESSION.delete(sessionTokenFromCookie); // Clean up the superseded/orphaned session token
            const clearCookieHeaders = new Headers({ 'Content-Type': 'application/json' });
            clearCookieHeaders.append('Set-Cookie', `session_token=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
            return new Response(JSON.stringify({ loggedIn: false, reason: "Session superseded by another login" }), {
                headers: clearCookieHeaders, status: 200
            });
        }

        // 3. (Optional but Recommended) Verify user still exists and is active in MBBS_DATA
        const masterUserDataJson = await MBBS_DATA.get(mbbsId);
        if (!masterUserDataJson) {
            console.warn(`Verify session: User ${mbbsId} from session not found in MBBS_DATA. Deleting session.`);
            await MBBS_SESSION.delete(sessionTokenFromCookie);
            await MBBS_SESSION.delete(email); // Remove email-to-token mapping too
            return new Response(JSON.stringify({ loggedIn: false, reason: "User record deleted" }), {
                headers: { 'Content-Type': 'application/json' }, status: 200
            });
        }
        const masterUserData = JSON.parse(masterUserDataJson);
        if (masterUserData.isActive === false || masterUserData.email.trim().toLowerCase() !== email) {
             console.warn(`Verify session: User ${mbbsId} is inactive or email changed. Session invalidated.`);
            await MBBS_SESSION.delete(sessionTokenFromCookie);
            await MBBS_SESSION.delete(email);
            return new Response(JSON.stringify({ loggedIn: false, reason: "User inactive or details changed" }), {
                headers: { 'Content-Type': 'application/json' }, status: 200
            });
        }


        // 4. If all checks pass, user is logged in
        return new Response(JSON.stringify({
            loggedIn: true,
            email: email,
            name: name,
            mbbsId: mbbsId // You might want to send mbbsId back too
        }), {
            headers: { 'Content-Type': 'application/json' }, status: 200
        });

    } catch (error) {
        console.error('Error in /api/verify-session:', error);
        return new Response(JSON.stringify({ loggedIn: false, error: 'Internal Server Error during session verification' }), {
            headers: { 'Content-Type': 'application/json' }, status: 500
        });
    }
}

export async function onRequest(context) {
  if (context.request.method === "GET") {
    return await onRequestGet(context);
  }
   // CORS Preflight for GET (though usually not strictly needed for GET with simple headers)
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": context.request.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type", // Or specify what you expect
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  return new Response('Method Not Allowed', { status: 405 });
}
