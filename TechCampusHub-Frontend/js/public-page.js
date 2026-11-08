// =====================================================
// Shared bootstrap for the public pages
// (help-center.html and about.html)
// =====================================================
//
// Keeps the header session-aware, wires the footer "copy email"
// button and boots the share popup, without pulling in the
// homepage-only modules (courses, ratings, resource previews).

import { getSession } from "./auth.js";
import { initShare } from "./share.js";

const CONTACT_EMAIL = "techcampushub2026@gmail.com";

let contactToast = null;
let contactToastTimer = null;

/**
 * Small bottom toast used by the footer contact email. Created on
 * first use so the page markup stays free of decoration.
 */
function showContactToast(message) {
    if (!contactToast) {
        contactToast = document.createElement("div");
        contactToast.id = "contactEmailToast";
        contactToast.className = "contact-toast";
        contactToast.setAttribute("role", "status");
        contactToast.setAttribute("aria-live", "polite");
        contactToast.innerHTML = `
            <i class="fa-regular fa-circle-check" aria-hidden="true"></i>
            <span data-contact-toast-text></span>
        `;
        document.body.appendChild(contactToast);
    }

    const text = contactToast.querySelector("[data-contact-toast-text]");

    if (text) {
        text.textContent = message;
    }

    contactToast.classList.add("is-visible");

    if (contactToastTimer) {
        window.clearTimeout(contactToastTimer);
    }

    contactToastTimer = window.setTimeout(() => {
        contactToast?.classList.remove("is-visible");
        contactToastTimer = null;
    }, 2400);
}

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

/**
 * Every [data-copy-email] button on the page copies the address and
 * toasts - it never opens Gmail or the default mail app.
 */
function initContactEmailCopy() {
    const buttons = document.querySelectorAll("[data-copy-email]");

    buttons.forEach(button => {
        button.addEventListener("click", async () => {
            const copied = await copyToClipboard(CONTACT_EMAIL);

            showContactToast(
                copied
                    ? "Email copied successfully!"
                    : "Couldn't copy the email — please select it instead."
            );
        });
    });
}

// Guest / member header actions follow the stored session.
async function updateNavForSession() {
    const guestActions = document.getElementById("guestNavActions");
    const memberActions = document.getElementById("memberNavActions");

    if (!guestActions && !memberActions) {
        return;
    }

    try {
        const { data } = await getSession();

        const signedIn = Boolean(data?.session?.user);

        guestActions?.classList.toggle("hidden", signedIn);
        memberActions?.classList.toggle("hidden", !signedIn);
    } catch (error) {
        console.error("Session check error:", error);
    }
}

/**
 * Landing on help-center.html#contact-information (or any other
 * section) races with the CDN stylesheets: the browser may anchor
 * the scroll while the layout is still taller than its final size.
 * Re-align once everything has settled so the section always ends
 * up under the sticky header.
 */
function alignHashTarget() {
    if (!window.location.hash) {
        return;
    }

    let id = window.location.hash.slice(1);

    try {
        id = decodeURIComponent(id);
    } catch {
        // Keep the raw value.
    }

    const target = document.getElementById(id);

    if (!target) {
        return;
    }

    target.scrollIntoView({ behavior: "instant", block: "start" });
}

function alignHashTargetWhenReady() {
    if (document.readyState === "complete") {
        alignHashTarget();
    } else {
        window.addEventListener("load", alignHashTarget, { once: true });
    }

    // Web fonts change section heights, so re-align after them too.
    document.fonts?.ready.then(alignHashTarget).catch(() => {});
}

function initPublicPage() {
    updateNavForSession();
    initContactEmailCopy();
    initShare();
    alignHashTargetWhenReady();
}

// Modules are deferred, so the DOM is usually ready already.
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPublicPage, { once: true });
} else {
    initPublicPage();
}
