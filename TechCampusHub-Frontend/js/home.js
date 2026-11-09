// =====================================================
// TechCampus_Hub
// home.js
//
// Public storefront: renders the course catalog and
// adapts the navigation to the visitor's session.
// =====================================================

import { getSession } from "./auth.js";
import { loadCourses, formatPrice, ratingBadgeHtml } from "./courses.js";
import { getOverallRating, getHomeResources, getAuthToken } from "./api.js";
import { escapeHtml, formatDate } from "./helpers.js";
import { initShare } from "./share.js";
import { openPdfViewer, setupPdfViewer } from "./pdfviewer.js";

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

// =====================================================
// Homepage study-resource previews
// =====================================================

const HOME_RESOURCE_SECTIONS = [
    {
        key: "notes",
        gridId: "homeResourceNotes",
        countId: "homeResourceCountNotes",
        emptyId: "homeResourceEmptyNotes"
    },
    {
        key: "pyq",
        gridId: "homeResourcePyq",
        countId: "homeResourceCountPyq",
        emptyId: "homeResourceEmptyPyq"
    },
    {
        key: "tnp",
        gridId: "homeResourceTnp",
        countId: "homeResourceCountTnp",
        emptyId: "homeResourceEmptyTnp"
    },
    {
        key: "syllabus",
        gridId: "homeResourceSyllabus",
        countId: "homeResourceCountSyllabus",
        emptyId: "homeResourceEmptySyllabus"
    }
];

const HOME_RESOURCE_STYLES = {
    notes: {
        icon: "fa-book-open",
        iconClass: "bg-blue-50 text-blue-600"
    },
    pyq: {
        icon: "fa-file-circle-question",
        iconClass: "bg-amber-50 text-amber-600"
    },
    tnp: {
        icon: "fa-briefcase",
        iconClass: "bg-emerald-50 text-emerald-600"
    },
    syllabus: {
        icon: "fa-book",
        iconClass: "bg-indigo-50 text-indigo-600"
    }
};

/** One homepage preview card: basic metadata + a View button. */
function homeResourceCardHtml(item) {
    const style = HOME_RESOURCE_STYLES[item.category] || HOME_RESOURCE_STYLES.notes;
    const title = item.title || "Untitled";
    const meta = [];

    if (item.course) {
        meta.push(`
            <span class="home-resource-meta">
                <i class="fa-solid fa-graduation-cap text-[10px]" aria-hidden="true"></i>
                ${escapeHtml(item.course)}
            </span>
        `);
    }

    if (Number(item.semester) > 0) {
        meta.push(`
            <span class="home-resource-meta">
                <i class="fa-regular fa-calendar text-[10px]" aria-hidden="true"></i>
                Sem ${escapeHtml(item.semester)}
            </span>
        `);
    }

    if (item.subject) {
        meta.push(`
            <span class="home-resource-meta">
                <i class="fa-solid fa-bookmark text-[10px]" aria-hidden="true"></i>
                ${escapeHtml(item.subject)}
            </span>
        `);
    }

    const description = item.description
        ? `<p class="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">${escapeHtml(item.description)}</p>`
        : "";

    const date = item.uploadDate
        ? `<span class="text-[11px] text-slate-400">
                <i class="fa-regular fa-calendar mr-1" aria-hidden="true"></i>
                ${escapeHtml(formatDate(item.uploadDate))}
           </span>`
        : "<span></span>";

    const lock = item.locked
        ? `<span class="inline-flex shrink-0 items-center rounded-lg bg-amber-50 px-2 py-1
                       text-[10px] font-bold text-amber-700"
                 title="Included with a course bundle">
                <i class="fa-solid fa-lock" aria-hidden="true"></i>
           </span>`
        : "";

    return `
        <article class="home-resource-card resource-card card p-4">
            <div class="flex items-start gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${style.iconClass}">
                    <i class="fa-solid ${style.icon}" aria-hidden="true"></i>
                </span>
                <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-2">
                        <h4 class="text-sm font-extrabold leading-5 text-slate-900"
                            title="${escapeHtml(title)}">
                            ${escapeHtml(title)}
                        </h4>
                        ${lock}
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                        ${meta.join("")}
                    </div>
                    ${description}
                </div>
            </div>
            <div class="mt-auto flex items-center justify-between gap-2 pt-4">
                ${date}
                <button type="button"
                        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg
                               bg-blue-600 px-3 py-1.5 text-xs font-bold text-white
                               transition hover:bg-blue-700"
                        data-home-resource
                        data-resource-category="${escapeHtml(item.category)}"
                        data-resource-id="${escapeHtml(item.id)}"
                        data-resource-title="${escapeHtml(title)}">
                    <i class="fa-regular fa-eye" aria-hidden="true"></i>
                    View
                </button>
            </div>
        </article>
    `;
}

async function renderHomeResources() {
    const container = document.getElementById("homeResourceSections");

    if (!container) {
        return;
    }

    try {
        const data = await getHomeResources(4);
        const groups = {
            notes: Array.isArray(data?.notes) ? data.notes : [],
            pyq: Array.isArray(data?.pyq) ? data.pyq : [],
            tnp: Array.isArray(data?.tnp) ? data.tnp : [],
            syllabus: Array.isArray(data?.syllabus) ? data.syllabus : []
        };

        HOME_RESOURCE_SECTIONS.forEach(section => {
            const grid = document.getElementById(section.gridId);
            const empty = document.getElementById(section.emptyId);
            const count = document.getElementById(section.countId);
            const rows = groups[section.key] || [];

            if (!grid) {
                return;
            }

            if (!rows.length) {
                grid.innerHTML = "";
                empty?.classList.remove("hidden");
                count?.classList.add("hidden");
                return;
            }

            empty?.classList.add("hidden");
            grid.innerHTML = rows.map(homeResourceCardHtml).join("");

            if (count) {
                count.textContent = `${rows.length} latest`;
                count.classList.remove("hidden");
            }
        });

        // Each section shows its own empty state when it has no rows.
    } catch (error) {
        console.error("Home resources load error:", error);
    }
}

function showHomeResourceNotice(message) {
    const notice = document.getElementById("homeResourceNotice");

    if (!notice) {
        return;
    }

    notice.textContent = message;
    notice.classList.remove("hidden");

    window.setTimeout(() => {
        notice.textContent = "";
        notice.classList.add("hidden");
    }, 4500);
}

// =====================================================
// Login-required popup
// =====================================================

let loginGate = null;

function initLoginGate() {
    const modal = document.getElementById("loginRequiredModal");

    if (!modal) {
        return null;
    }

    const cancel = document.getElementById("loginRequiredCancelBtn");
    let lastFocused = null;

    const isOpen = () => modal.classList.contains("is-open");

    const open = () => {
        lastFocused = document.activeElement;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("login-gate-open");
        cancel?.focus();
    };

    const close = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("login-gate-open");

        if (lastFocused instanceof HTMLElement) {
            lastFocused.focus();
        }
    };

    cancel?.addEventListener("click", close);

    // Clicking the dimmed backdrop (but not the card) closes it.
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            close();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && isOpen()) {
            close();
        }
    });

    return { open, close, isOpen };
}

/**
 * The session flag resolves asynchronously on load. Re-check the
 * backend only when a token exists but the flag is still false, so
 * a stale token shows the login gate instead of a broken viewer.
 */
async function resolveSignedIn() {
    if (visitorSignedIn) {
        return true;
    }

    if (!getAuthToken()) {
        return false;
    }

    try {
        const { data } = await getSession();
        visitorSignedIn = Boolean(data?.session?.user);
    } catch {
        visitorSignedIn = false;
    }

    return visitorSignedIn;
}

// =====================================================
// Secure PDF viewer (lazy: only for logged-in visitors)
// =====================================================

let pdfViewerPromise = null;

/**
 * The homepage does not ship the shared modals partial. Load just
 * the secure PDF viewer from it the first time a signed-in visitor
 * opens a document, then reuse the exact same reader as the
 * dashboard (JWT relay, no download/print/save, right-click and
 * Ctrl+S / Ctrl+P blocked).
 */
function ensurePdfViewer() {
    if (document.getElementById("pdfViewerModal")) {
        setupPdfViewer();
        return Promise.resolve(true);
    }

    if (!pdfViewerPromise) {
        pdfViewerPromise = fetch("./partials/modals.html")
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Viewer partial failed (${response.status})`);
                }
                return response.text();
            })
            .then(html => {
                const template = document.createElement("template");
                template.innerHTML = html;

                const modal = template.content.querySelector("#pdfViewerModal");

                if (!modal) {
                    throw new Error("PDF viewer markup not found");
                }

                document.body.appendChild(modal);
                setupPdfViewer();

                return true;
            })
            .catch(error => {
                console.error("PDF viewer load error:", error);
                pdfViewerPromise = null;
                return false;
            });
    }

    return pdfViewerPromise;
}

function initHomeResourceActions() {
    const container = document.getElementById("homeResourceSections");

    if (!container) {
        return;
    }

    container.addEventListener("click", async event => {
        const button = event.target.closest("[data-home-resource]");

        if (!button) {
            return;
        }

        event.preventDefault();

        const category = button.dataset.resourceCategory;
        const id = button.dataset.resourceId;
        const title = button.dataset.resourceTitle || "Document";

        if (!category || !id) {
            return;
        }

        if (!(await resolveSignedIn())) {
            loginGate?.open();
            return;
        }

        button.disabled = true;

        try {
            const ready = await ensurePdfViewer();

            if (!ready) {
                showHomeResourceNotice(
                    "The secure viewer could not be loaded. Please try again."
                );
                return;
            }

            await openPdfViewer({ category, id, title });
        } finally {
            button.disabled = false;
        }
    });
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
// Animated statistics counters
// =====================================================

function formatCounterValue(value, suffix) {
    return `${Math.round(value).toLocaleString("en-IN")}${suffix}`;
}

function animateCounter(element) {
    const target = Number(element.dataset.counterTo);
    const suffix = element.dataset.counterSuffix || "";

    if (!Number.isFinite(target)) {
        return;
    }

    const duration = 1600;
    const start = performance.now();

    const step = now => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        element.textContent = formatCounterValue(target * eased, suffix);

        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            element.textContent = formatCounterValue(target, suffix);
        }
    };

    window.requestAnimationFrame(step);
}

/**
 * Counts up each [data-counter-to] value the first time its
 * statistics tile scrolls into view. Markup already contains the
 * final value, so no-JS and reduced-motion visitors see it too.
 */
function initStatCounters() {
    const counters = Array.from(
        document.querySelectorAll("[data-counter-to]")
    );

    if (!counters.length) {
        return;
    }

    const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
    )?.matches;

    if (reducedMotion || !("IntersectionObserver" in window)) {
        counters.forEach(element => {
            element.textContent = formatCounterValue(
                Number(element.dataset.counterTo),
                element.dataset.counterSuffix || ""
            );
        });
        return;
    }

    counters.forEach(element => {
        element.textContent = formatCounterValue(
            0,
            element.dataset.counterSuffix || ""
        );
    });

    const observer = new IntersectionObserver(
        (entries, currentObserver) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    return;
                }

                animateCounter(entry.target);
                currentObserver.unobserve(entry.target);
            });
        },
        { threshold: 0.4 }
    );

    counters.forEach(element => observer.observe(element));
}

// =====================================================
// Homepage footer contact email (copy on click)
// =====================================================

const CONTACT_EMAIL = "techcampushub2026@gmail.com";

let contactToast = null;
let contactToastTimer = null;

/**
 * Small bottom toast used by the footer contact email. Created on
 * first use so the footer markup stays free of decoration.
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

function initContactEmailCopy() {
    const button = document.getElementById("contactEmailBtn");

    if (!button) {
        return;
    }

    button.addEventListener("click", async () => {
        const copied = await copyToClipboard(CONTACT_EMAIL);

        showContactToast(
            copied
                ? "Email copied successfully!"
                : "Couldn't copy the email — please select it instead."
        );
    });
}

/**
 * Deep links from other public pages (e.g. ./index.html#resources) must
 * survive the homepage's async catalog/resource rendering: the browser's
 * native hash jump happens before those cards expand the layout, so land
 * once more when rendering settles.
 */
function landOnCurrentHash(hash) {
    if (!hash || window.location.hash !== hash) {
        return;
    }

    const target = document.getElementById(hash.slice(1));

    if (!target) {
        return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initHashLanding(pageData, initialHash) {
    if (!initialHash) {
        return;
    }

    window.requestAnimationFrame(() => landOnCurrentHash(initialHash));

    pageData.then(() => {
        landOnCurrentHash(initialHash);

        // A late font/image/layout shift can move the target a few
        // pixels, so make one final correction after the page settles.
        window.setTimeout(() => landOnCurrentHash(initialHash), 500);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const initialHash = window.location.hash;
    const pageData = Promise.allSettled([
        renderOverallRating(),
        renderCourseCatalog(),
        renderHomeResources()
    ]);

    updateNavForSession();
    initStatCounters();
    initContactEmailCopy();
    initShare();

    loginGate = initLoginGate();
    initHomeResourceActions();
    initHashLanding(pageData, initialHash);

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
