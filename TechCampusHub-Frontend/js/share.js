// =====================================================
// TechCampus_Hub
// share.js
//
// Site-wide "Share Website" feature.
//
//  • Phones/tablets use the native Web Share API when the
//    browser supports it.
//  • Desktop/laptop (and any browser without native share)
//    gets a themed popup with Copy Link, WhatsApp,
//    Telegram, Facebook, Email and Copy Website URL.
//
// Every trigger is declared as [data-share-trigger], so the
// same module works for static markup (homepage) and for the
// shared header/sidebar partials injected after page load.
// =====================================================

const SHARE_TITLE = "TechCampus Hub";
const SHARE_TEXT =
    "Explore TechCampus Hub for Notes, PYQs, TNP, Syllabus, Courses, and more.";
const COPY_SUCCESS = "Website link copied successfully!";
const COPY_FAILURE = "Couldn't copy the link. Please copy it manually.";

let initialized = false;

// =====================================================
// URL HELPERS
// =====================================================

/**
 * Root URL of the deployed site, derived from the current
 * location so production works without any code changes:
 *   https://site.com/index.html        -> https://site.com/
 *   https://site.com/app/dashboard.html -> https://site.com/app/
 */
function getWebsiteUrl() {
    try {
        return new URL(".", window.location.href).href;
    } catch {
        return window.location.href;
    }
}

/** URL of the page the visitor is currently on. */
function getCurrentUrl() {
    return window.location.href;
}

// =====================================================
// CLIPBOARD
// =====================================================

/**
 * Copy text with the async Clipboard API, falling back to the
 * legacy execCommand path for older browsers / insecure origins.
 */
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fall through to the legacy path.
    }

    try {
        const area = document.createElement("textarea");

        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.top = "-1000px";
        area.style.opacity = "0";

        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, text.length);

        const copied = document.execCommand("copy");

        area.remove();
        return copied;
    } catch {
        return false;
    }
}

// =====================================================
// NATIVE SHARE
// =====================================================

/**
 * Native share is used on phones/tablets only. On desktop and
 * laptop the feature intentionally shows the richer custom
 * popup (WhatsApp / Telegram / Facebook / Email / copy).
 */
function isMobileLikeDevice() {
    const userAgent = navigator.userAgent || "";

    const mobileUA =
        /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile|Tablet/i.test(
            userAgent
        );

    const coarsePointer = Boolean(
        window.matchMedia?.("(pointer: coarse)")?.matches
    );

    return mobileUA || (coarsePointer && window.innerWidth <= 1023);
}

function canUseNativeShare() {
    return (
        typeof navigator.share === "function" &&
        isMobileLikeDevice()
    );
}

// =====================================================
// POPUP + TOAST
// =====================================================

let overlay = null;
let card = null;
let urlText = null;
let toast = null;
let toastText = null;
let lastTrigger = null;
let toastTimer = null;
let previouslyFocused = null;

function buildShareUi() {
    if (document.getElementById("shareOverlay")) {
        return;
    }

    overlay = document.createElement("div");
    overlay.id = "shareOverlay";
    overlay.className = "share-overlay";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
        <div id="shareCard"
             class="share-card"
             role="dialog"
             aria-modal="true"
             aria-labelledby="shareDialogTitle"
             aria-hidden="true">
            <div class="share-handle" aria-hidden="true"></div>

            <div class="share-head">
                <div class="share-head-main">
                    <span class="share-badge" aria-hidden="true">
                        <i class="fa-solid fa-share-nodes"></i>
                    </span>
                    <div class="min-w-0">
                        <h2 id="shareDialogTitle" class="share-title">
                            Share TechCampus Hub
                        </h2>
                        <p class="share-subtitle">
                            Send this portal to a friend
                        </p>
                    </div>
                </div>
                <button type="button"
                        data-share-close
                        class="share-close"
                        aria-label="Close share popup">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <p class="share-text">${SHARE_TEXT}</p>

            <div class="share-url">
                <i class="fa-solid fa-globe" aria-hidden="true"></i>
                <span id="shareUrlText" class="share-url-text"></span>
            </div>

            <div class="share-actions">
                <button type="button"
                        class="share-action share-action-primary"
                        data-share-action="copy-link">
                    <i class="fa-solid fa-link" aria-hidden="true"></i>
                    <span>Copy Link</span>
                </button>

                <div class="share-grid">
                    <a class="share-action"
                       data-share-action="whatsapp"
                       data-share-link
                       aria-label="Share on WhatsApp"
                       target="_blank"
                       rel="noopener noreferrer">
                        <i class="fa-brands fa-whatsapp share-icon-whatsapp" aria-hidden="true"></i>
                        <span>WhatsApp</span>
                    </a>
                    <a class="share-action"
                       data-share-action="telegram"
                       data-share-link
                       aria-label="Share via Telegram"
                       target="_blank"
                       rel="noopener noreferrer">
                        <i class="fa-brands fa-telegram share-icon-telegram" aria-hidden="true"></i>
                        <span>Telegram</span>
                    </a>
                    <a class="share-action"
                       data-share-action="facebook"
                       data-share-link
                       aria-label="Share on Facebook"
                       target="_blank"
                       rel="noopener noreferrer">
                        <i class="fa-brands fa-facebook-f share-icon-facebook" aria-hidden="true"></i>
                        <span>Facebook</span>
                    </a>
                    <a class="share-action"
                       data-share-action="email"
                       data-share-link
                       aria-label="Share via Email">
                        <i class="fa-solid fa-envelope share-icon-email" aria-hidden="true"></i>
                        <span>Email</span>
                    </a>
                </div>

                <button type="button"
                        class="share-action share-action-muted"
                        data-share-action="copy-site">
                    <i class="fa-solid fa-globe" aria-hidden="true"></i>
                    <span>Copy Website URL</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    card = overlay.querySelector("#shareCard");
    urlText = overlay.querySelector("#shareUrlText");

    toast = document.createElement("div");
    toast.id = "shareToast";
    toast.className = "share-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = `
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <span id="shareToastText"></span>
    `;

    document.body.appendChild(toast);
    toastText = toast.querySelector("#shareToastText");
}

function syncShareLinks() {
    const siteUrl = getWebsiteUrl();
    const shareText = `${SHARE_TEXT} ${siteUrl}`;

    if (urlText) {
        urlText.textContent = siteUrl;
    }

    const links = {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(
            siteUrl
        )}&text=${encodeURIComponent(SHARE_TEXT)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            siteUrl
        )}`,
        email: `mailto:?subject=${encodeURIComponent(
            SHARE_TITLE
        )}&body=${encodeURIComponent(`${SHARE_TEXT}\n\n${siteUrl}`)}`
    };

    overlay
        ?.querySelectorAll("[data-share-link]")
        .forEach(link => {
            const href = links[link.dataset.shareAction];

            if (href) {
                link.setAttribute("href", href);
            }
        });
}

function isOpen() {
    return Boolean(overlay?.classList.contains("is-open"));
}

function openPopup(trigger) {
    if (!overlay) {
        return;
    }

    lastTrigger = trigger || lastTrigger;
    syncShareLinks();

    previouslyFocused =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    overlay.inert = false;
    card?.setAttribute("aria-hidden", "false");
    lastTrigger?.setAttribute("aria-expanded", "true");
    document.body.classList.add("share-open");

    card
        ?.querySelector("[data-share-close]")
        ?.focus({ preventScroll: true });
}

function closePopup(restoreFocus = true) {
    if (!overlay || !isOpen()) {
        return;
    }

    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    card?.setAttribute("aria-hidden", "true");
    lastTrigger?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("share-open");

    if (restoreFocus) {
        const target = previouslyFocused || lastTrigger;

        target?.focus?.({ preventScroll: true });
    }

    previouslyFocused = null;
}

function showToast(message, success = true) {
    if (!toast || !toastText) {
        return;
    }

    toastText.textContent = message;
    toast.classList.toggle("is-error", !success);
    toast.classList.add("is-visible");

    if (toastTimer) {
        window.clearTimeout(toastTimer);
    }

    toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
        toastTimer = null;
    }, 2600);
}

// =====================================================
// ACTIONS
// =====================================================

async function handleShareTrigger(trigger) {
    if (canUseNativeShare()) {
        try {
            await navigator.share({
                title: SHARE_TITLE,
                text: SHARE_TEXT,
                url: getWebsiteUrl()
            });

            return;
        } catch (error) {
            // Dismissing the native sheet is a normal action,
            // not a failure: keep the page as-is.
            if (error?.name === "AbortError") {
                return;
            }

            // Any other failure (no share targets, etc.)
            // falls back to the custom popup.
        }
    }

    openPopup(trigger);
}

async function handleCopy(url) {
    const copied = await copyToClipboard(url);

    showToast(
        copied ? COPY_SUCCESS : COPY_FAILURE,
        copied
    );

    return copied;
}

// =====================================================
// WIRING
// =====================================================

function wirePopup() {
    overlay.addEventListener("click", async event => {
        const closeButton = event.target.closest("[data-share-close]");

        if (closeButton) {
            closePopup();
            return;
        }

        // Clicking the dimmed backdrop (not the card) closes.
        if (event.target === overlay) {
            closePopup();
            return;
        }

        const actionButton = event.target.closest("[data-share-action]");

        if (!actionButton) {
            return;
        }

        const action = actionButton.dataset.shareAction;

        if (action === "copy-link") {
            event.preventDefault();
            await handleCopy(getCurrentUrl());
            return;
        }

        if (action === "copy-site") {
            event.preventDefault();
            await handleCopy(getWebsiteUrl());
            return;
        }

        // Social/email links keep their default navigation; the
        // popup gets out of the way so the new tab is visible.
        window.setTimeout(() => closePopup(false), 120);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && isOpen()) {
            closePopup();
        }
    });
}

export function initShare() {
    if (initialized) {
        return;
    }

    initialized = true;

    buildShareUi();

    if (!overlay) {
        return;
    }

    overlay.inert = true;

    wirePopup();

    // Delegated so triggers inside partials injected later
    // (shared header + mobile sidebar) work automatically.
    document.addEventListener("click", event => {
        const trigger = event.target.closest("[data-share-trigger]");

        if (!trigger) {
            return;
        }

        event.preventDefault();

        if (!trigger.hasAttribute("aria-haspopup")) {
            trigger.setAttribute("aria-haspopup", "dialog");
        }

        if (!trigger.hasAttribute("aria-expanded")) {
            trigger.setAttribute("aria-expanded", "false");
        }

        // Opening the share popup from the mobile drawer should
        // close the drawer first so the popup has the viewport.
        if (trigger.closest("#sidebar")) {
            document.getElementById("closeSidebarBtn")?.click();
        }

        void handleShareTrigger(trigger);
    });
}
