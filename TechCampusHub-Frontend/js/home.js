// =====================================================
// TechCampus_Hub
// home.js
//
// Public storefront: renders the course catalog and
// adapts the navigation to the visitor's session.
// =====================================================

import { getSession } from "./auth.js";
import { loadCourses, formatPrice, ratingBadgeHtml } from "./courses.js";
import { getOverallRating } from "./api.js";
import { escapeHtml } from "./helpers.js";
import { initShare } from "./share.js";

/**
 * Platform-wide average rating shown above the homepage catalog,
 * e.g. "⭐ 4.8/5 · from 1,240 reviews".
 */
async function renderOverallRating() {
    const box = document.getElementById("overallRatingSummary");

    if (!box) {
        return;
    }

    try {
        const summary = await getOverallRating();
        const count = Number(summary?.count) || 0;
        const average = Number(summary?.average) || 0;

        if (!count) {
            box.innerHTML = `
                <span class="text-sm text-slate-500 font-semibold">
                    <i class="fa-regular fa-star text-amber-400 mr-1"></i>
                    No reviews yet — be the first to rate a course
                </span>
            `;
            return;
        }

        box.innerHTML = `
            <span class="inline-flex items-center gap-2 rounded-full
                         bg-amber-50 border border-amber-200
                         px-4 py-1.5 text-sm font-extrabold text-amber-700"
                  title="Average of ${count} review${count === 1 ? "" : "s"}">
                <i class="fa-solid fa-star text-amber-400"></i>
                ${average.toFixed(1)}/5
                <span class="font-semibold text-amber-600">
                    from ${count.toLocaleString("en-IN")} review${count === 1 ? "" : "s"}
                </span>
            </span>
        `;
    } catch (error) {
        console.error("Overall rating load error:", error);
        box.innerHTML = "";
    }
}

/**
 * Top-corner pill badge for a course card: an explicit badge
 * when the data provides one, otherwise a rating-based
 * "Best Seller" or a "New" tag for recently added courses.
 */
function courseCardBadgeHtml(course) {
    const badgeBase = `absolute -top-3 right-4 rounded-full px-3 py-1
                       text-[11px] font-extrabold shadow`;
    const explicit = typeof course.badge === "string" ? course.badge.trim() : "";

    if (explicit) {
        return `<span class="${badgeBase} bg-blue-600 text-white">${escapeHtml(explicit)}</span>`;
    }

    if (Number(course.rating_avg) >= 4.5 && Number(course.rating_count) > 0) {
        return `<span class="${badgeBase} bg-amber-500 text-white">Best Seller</span>`;
    }

    const createdAt = Date.parse(course.created_at || "");

    if (createdAt && Date.now() - createdAt <= 21 * 24 * 60 * 60 * 1000) {
        return `<span class="${badgeBase} bg-emerald-500 text-white">New</span>`;
    }

    return "";
}

async function renderCourseCatalog() {
    const grid = document.getElementById("homeCourseGrid");
    const empty = document.getElementById("homeCourseEmpty");

    if (!grid) {
        return;
    }

    try {
        const courses = await loadCourses();

        if (!courses.length) {
            if (empty) {
                empty.classList.remove("hidden");
            }
            return;
        }

        grid.innerHTML = courses.map(course => {
            const price = formatPrice(course.price_inr);
            const priceValue = Number(course.price_inr) || 0;
            const mrp = Number(course.mrp_inr) || 0;

            // Discount row only when a compare-at MRP is
            // present and higher than the selling price.
            const discountPercent = mrp > priceValue
                ? Math.round(((mrp - priceValue) / mrp) * 100)
                : 0;

            const priceBlock = discountPercent > 0
                ? `
                    <div class="flex flex-wrap items-center gap-x-2">
                        <p class="text-2xl font-extrabold text-slate-900">
                            ${escapeHtml(price)}
                        </p>
                        <span class="rounded-full bg-amber-100 px-2 py-0.5
                                     text-xs font-extrabold text-amber-700">
                            ${discountPercent}% Off
                        </span>
                        <p class="w-full text-sm text-slate-400 line-through">
                            ${escapeHtml(formatPrice(mrp))}
                        </p>
                    </div>
                `
                : `
                    <p class="text-2xl font-extrabold text-slate-900">
                        ${escapeHtml(price)}
                    </p>
                `;

            const highlights = (course.highlights || [])
                .map(item => `
                    <li class="flex items-start gap-2 text-sm text-slate-600">
                        <i class="fa-solid fa-check text-emerald-500 mt-1"></i>
                        <span>${escapeHtml(item)}</span>
                    </li>
                `)
                .join("");

            return `
                <article class="course-tile card p-6 flex flex-col relative h-full
                                bg-white rounded-3xl border border-slate-200
                                shadow-soft hover:-translate-y-1 transition">
                    ${courseCardBadgeHtml(course)}
                    <div class="flex items-start justify-between gap-3">
                        <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600
                                    flex items-center justify-center text-xl shrink-0">
                            <i class="fa-solid fa-graduation-cap"></i>
                        </div>
                        <span class="rounded-full bg-slate-100 px-3 py-1
                                     text-xs font-bold text-slate-500">
                            One-time
                        </span>
                    </div>
                    <h3 class="mt-4 text-lg font-extrabold text-slate-900">
                        ${escapeHtml(course.title)}
                    </h3>
                    ${ratingBadgeHtml(course)}
                    <p class="mt-2 text-sm text-slate-500 flex-1">
                        ${escapeHtml(course.description || "")}
                    </p>
                    <ul class="mt-4 space-y-2">
                        ${highlights}
                    </ul>
                    <div class="mt-5 flex items-center justify-between gap-3">
                        ${priceBlock}
                        <a href="./courses.html"
                           class="course-cta inline-flex items-center gap-2 rounded-xl
                                  bg-blue-600 hover:bg-blue-700 text-white
                                  font-bold px-5 py-2.5 transition">
                            View course
                        </a>
                    </div>
                </article>
            `;
        }).join("");
    } catch (error) {
        console.error("Home catalog render error:", error);
    }
}

// Session flag kept synchronous so the click guard below
// can call preventDefault before navigation starts.
let visitorSignedIn = false;

async function updateNavForSession() {
    const guestActions = document.getElementById("guestNavActions");
    const memberActions = document.getElementById("memberNavActions");

    try {
        const { data } = await getSession();

        visitorSignedIn = Boolean(data?.session?.user);

        guestActions?.classList.toggle("hidden", visitorSignedIn);
        memberActions?.classList.toggle("hidden", !visitorSignedIn);
    } catch (error) {
        console.error("Session check error:", error);
    }
}

// =====================================================
// Homepage contact popup (footer "Contact Us")
// =====================================================

const CONTACT_EMAIL = "abhishekbabu7275@gmail.com";

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

function initContactPopup() {
    const trigger = document.getElementById("contactUsBtn");
    const popup = document.getElementById("contactUsPopup");

    if (!trigger || !popup) {
        return;
    }

    const closeButton = document.getElementById("closeContactUsBtn");
    const copyButton = document.getElementById("copyContactEmailBtn");
    const copyLabel = copyButton?.querySelector("[data-copy-label]");
    const emailLink = document.getElementById("contactEmailLink");
    const status = document.getElementById("contactCopyStatus");
    const caret = trigger.querySelector("[data-contact-caret]");

    let copyTimer = null;

    const isOpen = () => popup.classList.contains("is-open");

    const resetCopyFeedback = () => {
        if (copyTimer) {
            window.clearTimeout(copyTimer);
            copyTimer = null;
        }

        if (copyLabel) {
            copyLabel.textContent = "Copy Email";
        }

        if (status) {
            status.textContent = "";
            status.classList.remove("text-red-500");
            status.classList.add("text-emerald-600");
        }
    };

    const setOpen = open => {
        popup.classList.toggle("is-open", open);
        popup.setAttribute("aria-hidden", String(!open));
        trigger.setAttribute("aria-expanded", String(open));

        if (caret) {
            caret.style.transform = open ? "rotate(180deg)" : "";
        }

        if (!open) {
            resetCopyFeedback();
        }
    };

    trigger.addEventListener("click", event => {
        event.stopPropagation();
        setOpen(!isOpen());
    });

    closeButton?.addEventListener("click", () => {
        setOpen(false);
        trigger.focus();
    });

    // Opening the mail app closes the popup behind it.
    emailLink?.addEventListener("click", () => setOpen(false));

    // Clicking anywhere outside the popup closes it.
    document.addEventListener("click", event => {
        if (!isOpen()) {
            return;
        }

        if (popup.contains(event.target) || trigger.contains(event.target)) {
            return;
        }

        setOpen(false);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && isOpen()) {
            setOpen(false);
            trigger.focus();
        }
    });

    copyButton?.addEventListener("click", async () => {
        const copied = await copyToClipboard(CONTACT_EMAIL);

        if (!copied) {
            if (status) {
                status.textContent = "Couldn't copy — select the email instead.";
                status.classList.remove("text-emerald-600");
                status.classList.add("text-red-500");
            }

            return;
        }

        if (copyLabel) {
            copyLabel.textContent = "Copied!";
        }

        if (status) {
            status.textContent = "Email copied!";
            status.classList.remove("text-red-500");
            status.classList.add("text-emerald-600");
        }

        if (copyTimer) {
            window.clearTimeout(copyTimer);
        }

        copyTimer = window.setTimeout(() => {
            if (copyLabel) {
                copyLabel.textContent = "Copy Email";
            }

            if (status) {
                status.textContent = "";
            }

            copyTimer = null;
        }, 2200);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    updateNavForSession();
    renderOverallRating();
    renderCourseCatalog();
    initContactPopup();
    initShare();

    // Viewing or buying a course requires an account:
    // guests are redirected to the login page.
    document.body.addEventListener("click", event => {
        const cta = event.target.closest("a.course-cta");

        if (!cta || visitorSignedIn) {
            return;
        }

        event.preventDefault();
        window.location.href = "./login.html";
    });
});
