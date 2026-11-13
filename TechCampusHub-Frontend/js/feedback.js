// =====================================================
// TechCampus_Hub
// feedback.js
//
// Feedback & rating: 1–5 star ratings plus written
// feedback for the website, a course or a note, the
// student's own submissions, and the admin inbox
// (view / delete).
//
// Storage: backend /api/feedback (+ /api/admin/feedback).
// =====================================================

import { $, escapeHtml, formatDate, getIdentity, updateNoticeBox } from "./helpers.js";
import { loadCourses } from "./courses.js";
import { loadNotes, notes } from "./data.js";

import {
    apiGet,
    apiPost,
    apiDelete,
    normalizeFeedback
} from "./api.js";

// =====================================================
// Constants
// =====================================================

const TARGET_TYPES = ["website", "course", "note"];

// =====================================================
// Module state
// =====================================================

let myFeedbackCache = [];
let eventsWired = false;
let selectedRating = 0;

// =====================================================
// Helpers
// =====================================================

export function starHtml(rating) {
    const value = Math.max(1, Math.min(5, Number(rating) || 0));

    let html = "";

    for (let star = 1; star <= 5; star += 1) {
        html += star <= value
            ? `<i class="fa-solid fa-star text-amber-400"></i>`
            : `<i class="fa-regular fa-star text-slate-300"></i>`;
    }

    return html;
}

function pageMessage(text, type = "info") {
    const box = $("feedbackPageMessage");

    if (!box) {
        return;
    }

    box.textContent = text || "";
    box.classList.toggle("hidden", !text);
    box.className = "text-sm min-h-5 mb-4 px-4 py-3 rounded-xl";

    if (!text) {
        box.classList.add("hidden");
        return;
    }

    if (type === "error") {
        box.classList.add("bg-red-50", "text-red-700");
    } else {
        box.classList.add("bg-emerald-50", "text-emerald-700");
    }
}

// =====================================================
// Storage
// =====================================================

export async function submitFeedback({
    targetType,
    targetLabel,
    rating,
    message
}) {
    const identity = await getIdentity();

    if (!identity.id) {
        throw new Error("Please log in before submitting feedback.");
    }

    const normalizedType = TARGET_TYPES.includes(targetType)
        ? targetType
        : "website";

    const normalizedRating = Number(rating);

    if (
        !Number.isInteger(normalizedRating) ||
        normalizedRating < 1 ||
        normalizedRating > 5
    ) {
        throw new Error("Please choose a star rating from 1 to 5.");
    }

    const data = await apiPost(
        "/api/feedback",
        {
            rating: normalizedRating,
            message: String(message || "").trim(),
            targetType: normalizedType,
            targetLabel: String(targetLabel || "Website").trim()
        }
    );

    const row = normalizeFeedback(data);

    myFeedbackCache.unshift(row);

    return { row, mode: "cloud" };
}

export async function loadMyFeedback(force = false) {
    if (!force && myFeedbackCache.length) {
        return myFeedbackCache;
    }

    const identity = await getIdentity();

    if (!identity.id) {
        myFeedbackCache = [];
        return myFeedbackCache;
    }

    try {
        const rows = await apiGet("/api/feedback/mine");

        myFeedbackCache = (Array.isArray(rows) ? rows : [])
            .map(normalizeFeedback);
    } catch (error) {
        console.error("Feedback loading error:", error);

        myFeedbackCache = [];
    }

    return myFeedbackCache;
}

export async function loadAllFeedback() {
    try {
        const rows = await apiGet("/api/admin/feedback");

        return {
            rows: (Array.isArray(rows) ? rows : []).map(normalizeFeedback),
            mode: "cloud"
        };
    } catch (error) {
        console.error("Admin feedback loading error:", error);

        return { rows: [], mode: "local" };
    }
}

export async function deleteFeedback(feedbackId) {
    await apiDelete(
        `/api/admin/feedback/${feedbackId}`
    );

    myFeedbackCache = myFeedbackCache.filter(
        row => String(row.id) !== String(feedbackId)
    );
}

// =====================================================
// Student page (feedback.html)
// =====================================================

function setRating(value) {
    const numeric = Number(value) || 0;

    selectedRating = Math.max(0, Math.min(5, numeric));

    const input = $("feedbackRating");

    if (input) {
        input.value = String(selectedRating);
    }

    document.querySelectorAll("#feedbackStars .star-btn").forEach(button => {
        button.classList.toggle(
            "active",
            Number(button.dataset.rating) <= selectedRating
        );
    });

    const hint = $("feedbackRatingHint");

    if (hint) {
        hint.textContent = selectedRating
            ? `${selectedRating} star${selectedRating > 1 ? "s" : ""} selected`
            : "Tap a star to rate";
    }
}

async function populateTargetSelect(targetType) {
    const group = $("feedbackTargetGroup");
    const select = $("feedbackTargetSelect");

    if (!group || !select) {
        return;
    }

    group.classList.toggle("hidden", targetType === "website");

    if (targetType === "website") {
        return;
    }

    select.innerHTML = `<option value="">Select…</option>`;

    if (targetType === "course") {
        const courses = await loadCourses();

        courses.forEach(course => {
            const option = document.createElement("option");
            option.value = course.title;
            option.textContent = course.title;
            select.append(option);
        });

        return;
    }

    // Notes
    if (!notes.length) {
        try {
            await loadNotes();
        } catch (error) {
            console.error("Notes loading error:", error);
        }
    }

    notes.forEach(note => {
        const label = note.title || note.subject || "Untitled note";

        const option = document.createElement("option");
        option.value = label;
        option.textContent = label;
        select.append(option);
    });
}

async function renderMyFeedback() {
    const list = $("myFeedbackList");

    if (!list) {
        return;
    }

    const rows = await loadMyFeedback(true);

    if (!rows.length) {
        list.innerHTML = `
            <p class="text-sm text-slate-500">
                No feedback submitted yet.
            </p>
        `;
        return;
    }

    list.innerHTML = rows.map(row => `
        <div class="border rounded-xl p-3">
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold uppercase text-slate-400">
                    ${escapeHtml(row.target_label || row.target_type || "Website")}
                </span>
                <span>${starHtml(row.rating)}</span>
            </div>
            ${row.message
                ? `<p class="text-sm text-slate-600 mt-1">
                       ${escapeHtml(row.message)}
                   </p>`
                : ""}
            <p class="text-xs text-slate-400 mt-1">
                ${escapeHtml(formatDate(row.created_at))}
            </p>
        </div>
    `).join("");
}

async function handleFeedbackSubmit(event) {
    event.preventDefault();

    const targetType = $("feedbackTargetType")?.value || "website";
    const targetSelect = $("feedbackTargetSelect");

    let targetLabel = "Website";

    if (targetType !== "website") {
        targetLabel = targetSelect?.value || "";

        if (!targetLabel) {
            pageMessage("Please choose what you want to rate.", "error");
            return;
        }
    }

    try {
        const result = await submitFeedback({
            targetType,
            targetLabel,
            rating: selectedRating,
            message: $("feedbackMessage")?.value || ""
        });

        pageMessage(
            result.mode === "local"
                ? "Feedback saved locally — the backend is unreachable."
                : "Thank you! Your feedback has been submitted.",
            "success"
        );

        const form = $("feedbackForm");
        form?.reset();
        setRating(0);
        await populateTargetSelect("website");

        await renderMyFeedback();
    } catch (error) {
        console.error("Feedback submit error:", error);

        pageMessage(
            error?.message || "Could not submit your feedback.",
            "error"
        );
    }
}

// =====================================================
// Admin — feedback inbox (admin.html)
// =====================================================

function adminMessage(text, type = "info") {
    updateNoticeBox("feedbackAdminMessage", text, type, {
        infoClasses: ["bg-emerald-50", "text-emerald-700"]
    });
}

async function renderAdminFeedbackList() {
    const list = $("adminFeedbackList");

    if (!list) {
        return;
    }

    const { rows } = await loadAllFeedback();

    if (!rows.length) {
        list.innerHTML = `
            <p class="text-sm text-slate-500">No feedback received yet.</p>
        `;
        return;
    }

    list.innerHTML = rows.map(row => `
        <div class="border rounded-xl p-4 flex flex-wrap items-start gap-4 justify-between">
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                    <p class="font-bold text-slate-800">
                        ${escapeHtml(row.user_name || row.user_email || "Student")}
                    </p>
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                        ${escapeHtml(row.target_label || row.target_type || "Website")}
                    </span>
                    <span>${starHtml(row.rating)}</span>
                </div>
                ${row.message
                    ? `<p class="text-sm text-slate-600 mt-1">
                           ${escapeHtml(row.message)}
                       </p>`
                    : ""}
                <p class="text-xs text-slate-400 mt-1">
                    ${escapeHtml(row.user_email || "")}
                    ${row.created_at
                        ? ` · ${escapeHtml(formatDate(row.created_at))}`
                        : ""}
                </p>
            </div>
            <button type="button"
                class="delete-feedback-btn rounded-lg bg-red-50 hover:bg-red-100
                       text-red-600 text-xs font-bold px-3 py-2"
                data-feedback-id="${escapeHtml(String(row.id))}">
                Delete
            </button>
        </div>
    `).join("");
}

// =====================================================
// Events (wired once from events.js)
// =====================================================

export function setupFeedbackEvents() {
    if (eventsWired) {
        return;
    }

    eventsWired = true;

    // Star rating widget.
    $("feedbackStars")?.addEventListener("click", event => {
        const button = event.target.closest(".star-btn");

        if (!button) {
            return;
        }

        setRating(button.dataset.rating);
    });

    // Target type switches the picker between website/course/note.
    $("feedbackTargetType")?.addEventListener("change", event => {
        populateTargetSelect(event.target.value).catch(error => {
            console.error("Feedback target populate error:", error);
        });
    });

    $("feedbackForm")?.addEventListener("submit", handleFeedbackSubmit);

    // Admin: delete a feedback entry.
    $("adminFeedbackList")?.addEventListener("click", async event => {
        const button = event.target.closest(".delete-feedback-btn");

        if (!button) {
            return;
        }

        const confirmed = window.confirm(
            "Delete this feedback entry?"
        );

        if (!confirmed) {
            return;
        }

        button.disabled = true;

        try {
            await deleteFeedback(button.dataset.feedbackId);

            adminMessage("Feedback deleted.", "success");

            await renderAdminFeedbackList();
        } catch (error) {
            console.error("Feedback delete error:", error);

            adminMessage(
                error?.message || "Could not delete the feedback.",
                "error"
            );

            button.disabled = false;
        }
    });

    $("refreshFeedbackBtn")?.addEventListener("click", () => {
        renderAdminFeedbackList().catch(error => {
            console.error("Admin feedback refresh error:", error);
        });
    });
}

// Called once the app knows who is logged in.
export async function initFeedback() {
    setupFeedbackEvents();

    if ($("feedbackForm")) {
        setRating(0);
        await renderMyFeedback();
    }

    if ($("adminFeedbackList")) {
        await renderAdminFeedbackList();
    }
}
