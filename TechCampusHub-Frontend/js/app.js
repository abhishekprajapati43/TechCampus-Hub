// =====================================================
// TechCampus_Hub
// app.js
// =====================================================

import { setupEvents } from "./events.js";
import { initializeApp, handleCategoryChange, initStudentProfileEditing } from "./ui.js";
import { renderLayout } from "./layout.js";
import { getSession } from "./auth.js";
import { refreshOwnership } from "./courses.js";
import { initFavorites } from "./favorites.js";
import { initNotifications } from "./notifications.js";
import { initCertificates } from "./certificates.js";
import { initFeedback } from "./feedback.js";
import { initChatbot } from "./chatbot.js";
import { initFaculty, initHeaderProfileMenu, initChangePasswordModal } from "./faculty.js";
import { setupPdfViewer } from "./pdfviewer.js";
import { setupSmartSearch } from "./smartsearch.js";
import { setupDashboardCounts } from "./dashboardcounts.js";
import { initSyllabus } from "./syllabus.js";
import { initShare } from "./share.js";

const PAGE =
    document.body?.dataset?.page || "auth";

const VALID_CATEGORIES = [
    "notes",
    "tnp",
    "pyq",
    "timetable"
];

// =====================================================
// Start Application
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        try {
            // ------------------------------------------------
            // Protected pages: require a session, then render
            // the shared sidebar/header chrome.
            // ------------------------------------------------

            if (PAGE !== "auth" && PAGE !== "home") {
                const { data, error } = await getSession();

                if (error || !data?.session?.user) {
                    window.location.replace("./login.html");
                    return;
                }

                await renderLayout(PAGE);

                // Load the student's approved courses before any
                // notes render, so paid bundles lock correctly.
                await refreshOwnership();
            }

            // Setup all application events first.
            setupEvents();

            // Site-wide share triggers (shared header + mobile drawer).
            // Delegated, so it also covers chrome injected after load.
            if (PAGE !== "auth") {
                initShare();
            }

            // Then initialize authentication,
            // profile and dashboard.
            await initializeApp();

            // ------------------------------------------------
            // Feature modules: favourites, notifications,
            // certificates, feedback and the chatbot.
            // ------------------------------------------------

            if (PAGE !== "auth" && PAGE !== "home") {
                // Header profile menu (photo + name + dropdown):
                // wired once for every page that renders the
                // shared header, so faculty chrome can never show
                // up live without its handlers (self-guarded).
                initHeaderProfileMenu();

                // Shared change-password modal (header dropdown
                // + faculty Profile panel button).
                initChangePasswordModal();

                // Student Profile page: Edit Profile + save
                // against the same backend validation (self-
                // guarded: no-ops on pages without the form).
                initStudentProfileEditing();

                // Secure in-app PDF viewer: wires the shared
                // modal + the student card triggers once
                // (self-guarded, no-ops when the modal is absent).
                setupPdfViewer();

                // Smart content search on the dashboard: live
                // full-text search inside uploaded PDFs with
                // suggestions + history (self-guarded: no-ops
                // when the smart search box is absent).
                setupSmartSearch();

                // "Available: X" counts on the four dashboard
                // cards (Notes / TNP / PYQ / Exam Timetable),
                // resolved in one request and scoped to the
                // caller's free + purchased content (self-
                // guarded: no-ops when the cards are absent).
                setupDashboardCounts();

                await initFavorites();
                await initNotifications();
                await initCertificates();
                await initFeedback();
                await initChatbot();

                // Faculty workspace (self-guarded: only wires
                // and loads on faculty.html for faculty users).
                await initFaculty();

                // Syllabus module: student page, admin panel and
                // faculty panel (self-guarded by page/panel presence).
                await initSyllabus();
            }

            // ------------------------------------------------
            // Deep link: dashboard.html?category=notes
            // ------------------------------------------------

            if (PAGE === "dashboard") {
                const requested =
                    new URLSearchParams(window.location.search)
                        .get("category");

                // Always render a category: without a ?category= deep
                // link the dashboard used to load the data but never
                // paint the list, so notes stayed empty ("Resources
                // Found 0") until the user clicked a card.
                const category =
                    VALID_CATEGORIES.includes(requested)
                        ? requested
                        : "notes";

                await handleCategoryChange(category);

                // Keep card active states in sync.
                document
                    .querySelectorAll("[data-dashboard-category]")
                    .forEach(card => {
                        card.classList.toggle(
                            "active",
                            card.dataset.dashboardCategory === category
                        );
                    });
            }

        } catch (error) {
            console.error(
                "Application initialization error:",
                error
            );
        }
    }
);
