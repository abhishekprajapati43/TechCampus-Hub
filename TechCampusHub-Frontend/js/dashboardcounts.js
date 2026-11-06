// =====================================================
// TechCampus_Hub
// dashboardcounts.js
// =====================================================
// Availability counts on the four student dashboard
// cards (Notes / TNP / PYQ / Exam Timetable).
//
// One request per dashboard load resolves every card's
// "Available: X" line from /api/dashboard/summary. The
// backend scopes the numbers to the signed-in caller:
// free resources plus resources of course bundles they
// hold an approved, unexpired purchase of. Locked,
// hidden, deleted, draft and expired material is never
// counted, so a card's number always matches what the
// student can actually open in that section.
//
// The count line is plain text under the existing card
// subtitle: no layout, styling or behaviour of the card
// itself is touched. On a failed request the line stays
// at its markup default rather than showing a wrong zero.

import { dashboardSummary } from "./api.js";

// Singular noun per card for a count of exactly one.
const SINGULAR = {
    notes: "Note",
    tnp: "Resource",
    pyq: "PYQ",
    timetable: "Timetable",
    syllabus: "Syllabus"
};

// Plural noun per card, matching the markup default.
const PLURAL = {
    notes: "Notes",
    tnp: "Resources",
    pyq: "PYQs",
    timetable: "Timetables",
    syllabus: "Syllabus"
};

// Cards the summary feeds. Anything else on the page
// with a count line is left alone.
const COUNT_KEYS = ["notes", "tnp", "pyq", "timetable", "syllabus"];

export function setupDashboardCounts() {
    // Only the student dashboard carries the count lines.
    if (!document.querySelector("[data-dashboard-count]")) {
        return;
    }

    loadSummary();
}

async function loadSummary() {
    let summary;

    try {
        summary = await dashboardSummary();
    } catch (error) {
        // Offline, expired session or a server hiccup: leave the
        // markup defaults in place rather than inventing numbers.
        console.error("Dashboard summary error:", error);
        return;
    }

    if (!summary) {
        return;
    }

    COUNT_KEYS.forEach(key => {
        const element = document.querySelector(
            `[data-dashboard-count="${key}"]`
        );

        if (!element) {
            return;
        }

        const count = normaliseCount(summary[key]);

        element.textContent =
            `Available: ${count} ${count === 1 ? SINGULAR[key] : PLURAL[key]}`;
    });
}

// The API returns integers; anything else (missing, null, NaN,
// negative) reads as zero so the line never renders garbage.
function normaliseCount(value) {
    const count = Number(value);

    if (!Number.isFinite(count) || count < 0) {
        return 0;
    }

    return Math.floor(count);
}
