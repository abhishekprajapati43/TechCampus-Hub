
// =====================================================
// TechCampus_Hub
// env.js  —  runtime environment config
// =====================================================
//
// Loaded as a CLASSIC <script> BEFORE the app modules, so
// js/config.js picks up window.__API_BASE_URL__ when it evaluates.
//
// Resolution order:
//   1. ?api=<url> query param            (one-off override)
//   2. localStorage "campusnotes:apiBase" (sticky override)
//   3. localhost / 127.0.0.1 / file://   → http://localhost:8080
//   4. PROD_API below                    (production default)
//
// >>> DEPLOYMENT (Render): PROD_API points at the Render web     <<<
// >>> service "techcampushub-backend". If Render gives that      <<<
// >>> service a different URL (name already taken, e.g.          <<<
// >>> techcampushub-backend-xxxx.onrender.com), paste the URL    <<<
// >>> here (https, no trailing slash) AND update render.yaml's   <<<
// >>> APP_BASE_URL / CORS_ALLOWED_ORIGINS, then push.            <<<
//
// Local Live Server keeps hitting your local backend on :8080
// automatically. To force a different API while on localhost,
// open the site once with:  ?api=https://techcampushub-backend.onrender.com
//
(function () {
    const PROD_API = "https://techcampus-hub-backend.onrender.com";
    const LOCAL_API = "http://localhost:8080";

    let api = "";
    try {
        api = new URLSearchParams(window.location.search).get("api")
            || window.localStorage.getItem("campusnotes:apiBase");
    } catch (e) { /* storage blocked — ignore */ }

    const host = window.location.hostname;
    const isLocalHost = host === "localhost"
        || host === "127.0.0.1"
        || host === "[::1]"
        || host === ""; // file://

    window.__API_BASE_URL__ = api
        || (isLocalHost ? LOCAL_API : PROD_API)
        || LOCAL_API;
})();
