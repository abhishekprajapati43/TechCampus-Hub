// =====================================================
// TechCampus_Hub
// faculty.js
//
// Faculty workspace (faculty.html):
//   - dashboard stats          GET  /api/faculty/stats
//   - launch a course          POST /api/faculty/courses
//   - list own courses         GET  /api/faculty/courses
//   - edit / publish a course  PUT  /api/faculty/courses/{id}
//   - upload content (PDF)     POST /api/faculty/notes | tnp-notes | pyqs | timetables
//   - upload resources         POST /api/faculty/resources  (videos / assignments / other)
//   - list own content         GET  /api/faculty/notes | tnp-notes | pyqs | timetables | resources
//   - edit own content         PUT  /api/faculty/notes/{id} | tnp-notes/{id} | pyqs/{id} | timetables/{id}
//   - my students (read-only)  GET  /api/faculty/students
//   - notify my students       POST /api/faculty/notifications
//   - sent notifications       GET  /api/faculty/notifications
//   - certificates             GET  /api/faculty/certificates
//   - feedback                 GET  /api/faculty/feedback
//   - profile / password       GET  /api/auth/me, PUT /api/auth/profile,
//                                 PUT /api/auth/change-password
//
// There is NO removal route under /api/faculty and this
// module therefore offers no removal affordance at all -
// removing content stays behind the admin endpoints.
//
// PDFs travel straight from the browser to Cloudinary
// through js/storage.js uploadPdf(), the same pipeline
// the admin panel uses; only the resulting URL/public id
// is persisted on the content record.
// =====================================================

import { $, escapeHtml, formatDate, showTimedMessage } from "./helpers.js";
import { currentStudent, currentUserRole } from "./state.js";

import {
    apiGet,
    apiPost,
    apiPut,
    getStoredUser,
    setStoredUser,
    normalizeCourse,
    getRelatedVideos
} from "./api.js";

import {
    collectVideos,
    resetVideos,
    setVideos
} from "./videos.js";

import { uploadPdf } from "./storage.js";
import { formatPrice } from "./courses.js";
import { logoutUser } from "./ui.js";
import { activateAdminPanel } from "./events.js";

// =====================================================
// Module state
// =====================================================

let eventsWired = false;

// Rows exactly as the backend returns them (camelCase).
let facultyCourses = [];
let facultyNotes = [];

// The other three content collections (owner-scoped, same
// shape as the admin rows).
let facultyTnpItems = [];
let facultyPyqItems = [];
let facultyTimetableItems = [];

// Extra resource kinds (videos / assignments / other files),
// served by GET|POST /api/faculty/resources.
let facultyResources = [];

// Dashboard-scoped collections, each rendering one tab panel.
let facultyStats = null;
let facultyStudents = [];
let facultySentNotifications = [];
let facultyCertificates = [];
let facultyFeedbackItems = [];

// Profile panel state: the form starts read-only and only the
// editable fields unlock after "Edit Profile" is pressed.
let facultyProfile = null;
let profileEditing = false;

// Course being edited through the Launch Course form (null =
// create mode; set = PUT /api/faculty/courses/{id}).
let editingCourseId = null;

// Active category in the Manage Content pill row.
let activeManageCategory = "notes";

// One auto-hide timer per message element.
const messageTimers = {};

// Cloudinary folder used for faculty PDFs (mirrors the
// admin flow, which uploads to the "notes" folder).
const PDF_FOLDER = "notes";

// Per-category Cloudinary folders, mirroring the admin
// panel ("notes", "tnp", "pyq", "timetable" folders). The
// three resource kinds upload through the same pipeline
// into their own folders; videos never touch storage
// (they use a URL instead).
const CONTENT_FOLDERS = {
    notes: PDF_FOLDER,
    tnp: "tnp",
    pyq: "pyq",
    timetable: "timetable",
    assignments: "assignments",
    other: "other"
};

// The three categories served by POST /api/faculty/resources
// share one upload form; the kind comes from this map.
const RESOURCE_KIND_BY_CATEGORY = {
    videos: "VIDEO",
    assignments: "ASSIGNMENT",
    other: "OTHER"
};

// Short labels used in headings, success messages and
// error fallbacks.
const CATEGORY_LABELS = {
    notes: "Note",
    tnp: "TNP resource",
    pyq: "PYQ",
    timetable: "Timetable",
    videos: "Video",
    assignments: "Assignment",
    other: "Other file"
};

// Section subtitle shown for the selected upload category.
const UPLOAD_SUBTITLES = {
    notes: "Share a PDF with your students.",
    tnp: "Share placement resources with your students.",
    pyq: "Share previous year papers with your students.",
    timetable: "Share exam timetables with your students.",
    videos: "Share a video link with your students.",
    assignments: "Share an assignment PDF with your students.",
    other: "Share any other PDF with your students."
};

// One message element per upload form, so a message for one
// category can never show up under another one. The three
// resource kinds share the single resource form (and its
// message) because only one panel is ever visible.
const UPLOAD_MESSAGE_IDS = {
    notes: "uploadNoteMessage",
    tnp: "facultyUploadTnpMessage",
    pyq: "facultyUploadPyqMessage",
    timetable: "facultyUploadTimetableMessage",
    videos: "facultyUploadResourceMessage",
    assignments: "facultyUploadResourceMessage",
    other: "facultyUploadResourceMessage"
};

// =====================================================
// Small field helpers
// =====================================================

function getValue(id) {
    return String($(id)?.value || "").trim();
}

function getNumber(id) {
    const raw = getValue(id);

    if (raw === "") {
        return null;
    }

    const number = Number(raw);

    return Number.isFinite(number) ? number : null;
}

function getFile(id) {
    return $(id)?.files?.[0] || null;
}

// Write a value into a field (blank for null/undefined).
function setValue(id, value) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.value = value ?? "";
}

function isFacultyUser() {
    return currentUserRole === "faculty";
}

// =====================================================
// Message elements
// =====================================================
//
// Same look/behaviour as the admin message element:
// textContent only, success/error class toggle, auto-hide.
// =====================================================

function facultyMessage(elementId, message, type = "success", hideAfter = 5000) {
    showTimedMessage(elementId, message, type, hideAfter, messageTimers);
}

function errorMessage(error, fallback) {
    return error?.message || fallback;
}

function dispatchRefresh() {
    window.dispatchEvent(
        new CustomEvent("campusnotes:refresh")
    );
}

// =====================================================
// Shared empty state (dashed card, render.js idiom)
// =====================================================

function emptyStateHtml(iconClass, message) {
    return `
        <div class="col-span-full">
            <div class="rounded-2xl border border-dashed
                        border-gray-300 bg-white p-10
                        text-center shadow-sm">
                <div class="mx-auto mb-4 flex h-14 w-14
                            items-center justify-center
                            rounded-full bg-gray-100">
                    <i class="fa-solid ${iconClass} text-slate-400 text-xl"></i>
                </div>
                <p class="text-sm text-slate-500">${escapeHtml(message)}</p>
            </div>
        </div>
    `;
}

// =====================================================
// Welcome header
// =====================================================

function renderWelcome() {
    const target = $("facultyWelcomeName");

    if (!target) {
        return;
    }

    const user = getStoredUser() || null;
    const name = String(
        user?.name || currentStudent?.name || ""
    ).trim();

    target.textContent = name || "Faculty!";
}

// =====================================================
// Header profile menu (photo, name, dropdown)
// =====================================================

function renderHeaderProfile() {
    const user = getStoredUser() || null;
    const rawRole = String(
        user?.role || currentStudent?.role || ""
    ).toLowerCase();

    const isFaculty = rawRole === "faculty";

    const name = String(
        user?.name || currentStudent?.name || ""
    ).trim() || (isFaculty ? "Faculty" : "Student");

    const roleLabel = isFaculty
        ? "Faculty"
        : rawRole === "admin"
            ? "Admin"
            : "Student";

    const nameTarget = $("headerProfileName");

    if (nameTarget) {
        nameTarget.textContent = name;
    }

    // Small caption under the name ("Student" / "Faculty").
    const roleTarget = $("headerProfileRole");

    if (roleTarget) {
        roleTarget.textContent = roleLabel;
    }

    // "My Profile" points at the page that role actually uses.
    const profileLink = $("headerMyProfileBtn");

    if (profileLink) {
        profileLink.href = isFaculty
            ? "./faculty.html#profile"
            : "./profile.html";
    }

    const photoTarget = $("headerProfilePhoto");

    if (!photoTarget) {
        return;
    }

    const photoUrl = String(
        user?.profilePhotoUrl
        || currentStudent?.profilePhotoUrl
        || ""
    ).trim();

    if (/^https?:\/\//i.test(photoUrl)) {
        photoTarget.innerHTML = `
            <img src="${escapeHtml(photoUrl)}"
                 alt="${escapeHtml(name)}"
                 loading="lazy"
                 decoding="async"
                 class="h-full w-full object-cover">
        `;
    } else {
        photoTarget.innerHTML =
            '<i class="fa-solid fa-user"></i>';
    }
}

// The dropdown opens on the avatar click and closes on any
// outside click or Escape. Guarded so wiring runs once even
// if two boot paths try.
function setupHeaderProfileMenu() {
    const button = $("headerProfileBtn");
    const dropdown = $("headerProfileDropdown");

    if (!button || !dropdown || button.dataset.wired === "true") {
        return;
    }

    button.dataset.wired = "true";

    const setOpen = open => {
        dropdown.classList.toggle("hidden", !open);
        button.setAttribute(
            "aria-expanded",
            String(open)
        );
    };

    button.addEventListener("click", event => {
        event.stopPropagation();
        setOpen(dropdown.classList.contains("hidden"));
    });

    // "My Profile" is a plain link to the Profile tab; close the
    // menu when it (or any item) is chosen.
    dropdown.addEventListener("click", () => setOpen(false));

    $("headerChangePasswordBtn")?.addEventListener("click", () => {
        // The shared modal ships with the header partial on every
        // page; the page fallbacks only matter if a future page
        // ever renders the header without the shared modals.
        if ($("facultyChangePasswordModal")) {
            openChangePasswordModal();
            return;
        }

        const isFaculty = String(
            getStoredUser()?.role || currentStudent?.role || ""
        ).toLowerCase() === "faculty";

        window.location.href = isFaculty
            ? "./faculty.html#profile"
            : "./profile.html";
    });

    $("headerLogoutBtn")?.addEventListener(
        "click",
        () => logoutUser()
    );

    document.addEventListener("click", event => {
        if (dropdown.classList.contains("hidden")) {
            return;
        }

        if (event.target.closest("#headerProfileMenu")) {
            return;
        }

        setOpen(false);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            setOpen(false);
        }
    });
}

// One call site (app.js) wires the menu on every page that
// renders the shared header partial, so the chrome can never
// appear live while its handlers are missing.
export function initHeaderProfileMenu() {
    renderHeaderProfile();
    setupHeaderProfileMenu();
}

// =====================================================
// Change-password modal (shared)
// =====================================================

//
// The modal ships in partials/modals.html, so every page
// that renders the shared header can open it: the header
// dropdown on any page plus the faculty Profile panel
// button. Wiring lives here (not in setupFacultyEvents) so
// student pages get the same behaviour as the workspace.
//

let changePasswordWired = false;

export function initChangePasswordModal() {
    const form = $("facultyChangePasswordForm");

    if (!form || changePasswordWired) {
        return;
    }

    changePasswordWired = true;

    $("facultyProfileChangePasswordBtn")?.addEventListener(
        "click",
        openChangePasswordModal
    );

    form.addEventListener(
        "submit",
        handleChangePassword
    );

    $("closeFacultyChangePasswordBtn")?.addEventListener(
        "click",
        closeChangePasswordModal
    );

    $("cancelFacultyChangePasswordBtn")?.addEventListener(
        "click",
        closeChangePasswordModal
    );

    // Click on the dimmed backdrop closes the modal.
    $("facultyChangePasswordModal")?.addEventListener(
        "click",
        event => {
            if (event.target === event.currentTarget) {
                closeChangePasswordModal();
            }
        }
    );

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        const modal = $("facultyChangePasswordModal");

        if (modal && !modal.classList.contains("hidden")) {
            closeChangePasswordModal();
        }
    });
}

// =====================================================
// Dashboard stats
// (GET /api/faculty/stats)
// =====================================================

async function loadFacultyStats() {
    const stats = await apiGet("/api/faculty/stats");

    facultyStats = stats || null;

    renderFacultyStats();
    renderRecentPurchases();
}

function setStatValue(elementId, value) {
    const target = $(elementId);

    if (!target) {
        return;
    }

    target.textContent = String(value ?? 0);
}

function renderFacultyStats() {
    if (!facultyStats) {
        return;
    }

    setStatValue(
        "facultyStatCourses",
        facultyStats.totalCourses
    );
    setStatValue(
        "facultyStatStudents",
        facultyStats.totalStudents
    );
    setStatValue(
        "facultyStatContent",
        facultyStats.totalContent
    );
    setStatValue(
        "facultyStatPurchases",
        facultyStats.recentPurchases
    );
}

function purchaseStatusPill(status) {
    const normalized = String(status || "").toLowerCase();

    const styles = {
        approved: "bg-emerald-50 text-emerald-700",
        pending: "bg-amber-50 text-amber-700",
        rejected: "bg-red-50 text-red-600"
    };

    const style = styles[normalized]
        || "bg-slate-100 text-slate-600";

    return `
        <span class="rounded-lg px-2.5 py-1 text-xs
                     font-bold ${style}">
            ${escapeHtml(
                normalized
                    ? normalized.charAt(0).toUpperCase()
                        + normalized.slice(1)
                    : "Unknown"
            )}
        </span>
    `;
}

function renderRecentPurchases() {
    const list = $("facultyRecentPurchases");

    if (!list) {
        return;
    }

    const rows = Array.isArray(
        facultyStats?.recentPurchaseList
    ) ? facultyStats.recentPurchaseList : [];

    if (!rows.length) {
        list.innerHTML = emptyStateHtml(
            "fa-cart-shopping",
            "No purchases of your courses yet."
        );
        return;
    }

    list.innerHTML = rows.map(purchase => `
        <div class="rounded-2xl border border-gray-200
                    bg-white p-4 flex flex-wrap items-center
                    gap-4 justify-between">
            <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-10 w-10 shrink-0 items-center
                            justify-center rounded-full
                            bg-blue-50 text-blue-600">
                    <i class="fa-solid fa-user-graduate"></i>
                </div>
                <div class="min-w-0">
                    <p class="truncate text-sm font-semibold
                              text-gray-900">
                        ${escapeHtml(purchase.userName || "Student")}
                    </p>
                    <p class="truncate text-xs text-slate-400">
                        ${escapeHtml(purchase.courseTitle || "Course")}
                        · ${escapeHtml(formatDate(
                            purchase.createdAt
                        ))}
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-extrabold
                             text-blue-600">
                    ${escapeHtml(formatPrice(
                        purchase.amountInr
                    ))}
                </span>
                ${purchaseStatusPill(purchase.status)}
            </div>
        </div>
    `).join("");
}

// =====================================================
// Users table (GET /api/faculty/students)
// =====================================================
//
// Read-only by design: the backend exposes no mutation
// route for these rows, so the table renders no actions.
// =====================================================

async function loadFacultyStudents() {
    const rows = await apiGet("/api/faculty/students");

    facultyStudents = Array.isArray(rows) ? rows : [];

    renderFacultyStudents();
}

function accessStatusPill(status) {
    const normalized = String(status || "").trim().toLowerCase();

    const styles = {
        active: "bg-emerald-50 text-emerald-700",
        pending: "bg-amber-50 text-amber-700",
        expired: "bg-slate-100 text-slate-600",
        rejected: "bg-red-50 text-red-600"
    };

    const style = styles[normalized]
        || "bg-slate-100 text-slate-600";

    const label = String(status || "Unknown");

    return `
        <span class="rounded-lg px-2.5 py-1 text-xs
                     font-bold ${style}">
            ${escapeHtml(label)}
        </span>
    `;
}

function renderFacultyStudents() {
    const body = $("facultyStudentsBody");

    if (!body) {
        return;
    }

    const empty = $("facultyStudentsEmpty");

    if (!facultyStudents.length) {
        body.innerHTML = "";
        empty?.classList.remove("hidden");
        return;
    }

    empty?.classList.add("hidden");

    body.innerHTML = facultyStudents.map(row => {
        // Progress is nullable until the backend starts
        // tracking it; show a dash rather than a fake 0%.
        const progress = row.progress;
        const hasProgress = Number.isFinite(Number(progress))
            && progress !== null;

        const progressHtml = hasProgress ? `
            <div class="flex items-center gap-2 min-w-[110px]">
                <div class="h-2 flex-1 rounded-full bg-slate-100
                            overflow-hidden">
                    <div class="h-full rounded-full bg-blue-600"
                         style="width:${Math.min(
                             100,
                             Math.max(0, Number(progress))
                         )}%"></div>
                </div>
                <span class="text-xs font-bold
                             text-slate-600">
                    ${Number(progress)}%
                </span>
            </div>` : `<span class="text-slate-400">–</span>`;

        return `
            <tr class="align-top">
                <td class="px-4 py-3 whitespace-nowrap">
                    <span class="font-semibold
                                 text-gray-900">
                        ${escapeHtml(row.studentName || "Student")}
                    </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap
                           text-slate-600">
                    ${escapeHtml(row.userEmail || "–")}
                </td>
                <td class="px-4 py-3 whitespace-nowrap
                           text-slate-600">
                    ${escapeHtml(row.userPhone || "–")}
                </td>
                <td class="px-4 py-3 whitespace-nowrap
                           text-slate-600">
                    ${escapeHtml(row.courseTitle || "Course")}
                </td>
                <td class="px-4 py-3 whitespace-nowrap
                           text-slate-600">
                    ${escapeHtml(formatDate(row.purchaseDate))}
                </td>
                <td class="px-4 py-3">${progressHtml}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                    ${accessStatusPill(row.accessStatus)}
                </td>
            </tr>
        `;
    }).join("");
}

// =====================================================
// Notifications (POST|GET /api/faculty/notifications)
// =====================================================

async function loadSentNotifications() {
    const rows = await apiGet("/api/faculty/notifications");

    facultySentNotifications = Array.isArray(rows) ? rows : [];

    renderSentNotifications();
}

function renderSentNotifications() {
    const list = $("facultySentNotifications");

    if (!list) {
        return;
    }

    if (!facultySentNotifications.length) {
        list.innerHTML = emptyStateHtml(
            "fa-bell",
            "You haven't sent any notifications yet."
        );
        return;
    }

    list.innerHTML = facultySentNotifications.map(item => `
        <div class="rounded-2xl border border-gray-200
                    bg-white p-4">
            <div class="flex flex-wrap items-start
                        justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-sm font-semibold
                              text-gray-900">
                        ${escapeHtml(item.title || "Notification")}
                    </p>
                    ${item.message ? `
                    <p class="mt-1 text-sm text-slate-500">
                        ${escapeHtml(item.message)}
                    </p>` : ""}
                </div>
                <span class="shrink-0 rounded-lg bg-blue-50
                             px-2.5 py-1 text-xs font-bold
                             text-blue-700">
                    ${escapeHtml(item.kind || "INFO")}
                </span>
            </div>
            <p class="mt-2 text-xs text-slate-400">
                Sent to ${escapeHtml(
                    item.broadcast
                        ? "all your students"
                        : (item.targetUserName || "a student")
                )} · ${escapeHtml(formatDate(item.createdAt))}
            </p>
        </div>
    `).join("");
}

async function handleSendNotification(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');

    const title = getValue("facultyNotifTitle");

    if (!title) {
        facultyMessage(
            "facultyNotificationMessage",
            "Please enter a title.",
            "error"
        );
        return;
    }

    const courseId = getNumber("facultyNotifCourse");

    const payload = {
        title,
        message: getValue("facultyNotifMessage") || null,
        kind: getValue("facultyNotifKind") || "INFO",
        category: getValue("facultyNotifCategory") || "general",
        // null = every student enrolled in any of my courses.
        courseId: courseId ?? null
    };

    if (button) {
        button.disabled = true;
    }

    try {
        const result = await apiPost(
            "/api/faculty/notifications",
            payload
        );

        facultyMessage(
            "facultyNotificationMessage",
            `Notification sent to ${result?.sentCount ?? 0} student(s).`
        );

        const countTarget = $("facultyNotificationSentCount");

        if (countTarget) {
            countTarget.textContent =
                `Last sent to ${result?.sentCount ?? 0} student(s).`;
        }

        form?.reset();

        await loadSentNotifications();
    } catch (error) {
        console.error("Faculty notification error:", error);

        facultyMessage(
            "facultyNotificationMessage",
            errorMessage(error, "Could not send the notification."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Certificates (GET /api/faculty/certificates)
// =====================================================

async function loadFacultyCertificates() {
    const rows = await apiGet("/api/faculty/certificates");

    facultyCertificates = Array.isArray(rows) ? rows : [];

    renderFacultyCertificates();
}

function renderFacultyCertificates() {
    const list = $("facultyCertificatesList");

    if (!list) {
        return;
    }

    if (!facultyCertificates.length) {
        list.innerHTML = emptyStateHtml(
            "fa-certificate",
            "No certificates issued for your courses yet."
        );
        return;
    }

    list.innerHTML = facultyCertificates.map(item => {
        const fileUrl = typeof item.fileUrl === "string"
            ? item.fileUrl.trim()
            : "";

        const canOpen = /^https?:\/\//i.test(fileUrl);

        const openHtml = canOpen ? `
                    <a href="${escapeHtml(fileUrl)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="inline-flex items-center gap-2 rounded-lg bg-blue-50
                              px-3 py-2 text-sm font-medium text-blue-700 transition
                              hover:bg-blue-100">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        Open
                    </a>` : "";

        return `
            <div class="rounded-2xl border border-gray-200
                        bg-white p-4 flex flex-wrap items-center
                        gap-4 justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="flex h-10 w-10 shrink-0 items-center
                                justify-center rounded-xl
                                bg-amber-50 text-amber-600">
                        <i class="fa-solid fa-certificate"></i>
                    </div>
                    <div class="min-w-0">
                        <p class="truncate text-sm font-semibold
                                  text-gray-900">
                            ${escapeHtml(item.title || "Certificate")}
                        </p>
                        <p class="truncate text-xs text-slate-400">
                            ${escapeHtml(item.userName || "Student")}
                            · ${escapeHtml(item.courseTitle || "Course")}
                            ${item.certificateNo
                                ? `· ${escapeHtml(item.certificateNo)}`
                                : ""}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs text-slate-400">
                        ${escapeHtml(formatDate(item.issuedOn || item.createdAt))}
                    </span>
                    ${openHtml}
                </div>
            </div>
        `;
    }).join("");
}

// =====================================================
// Feedback (GET /api/faculty/feedback)
// =====================================================

async function loadFacultyFeedback() {
    const rows = await apiGet("/api/faculty/feedback");

    facultyFeedbackItems = Array.isArray(rows) ? rows : [];

    renderFacultyFeedback();
}

// Star row shared with the student feedback cards.
function starsHtml(rating) {
    const value = Number(rating) || 0;

    let html = "";

    for (let star = 1; star <= 5; star += 1) {
        html += `<i class="fa-${star <= value ? "solid" : "regular"}
                    fa-star ${star <= value ? "text-amber-400" : "text-slate-300"}"></i>`;
    }

    return `<span class="inline-flex gap-0.5 text-xs">${html}</span>`;
}

function renderFacultyFeedback() {
    const list = $("facultyFeedbackList");

    if (!list) {
        return;
    }

    if (!facultyFeedbackItems.length) {
        list.innerHTML = emptyStateHtml(
            "fa-star",
            "No feedback on your courses yet."
        );
        return;
    }

    list.innerHTML = facultyFeedbackItems.map(item => `
        <div class="rounded-2xl border border-gray-200
                    bg-white p-4">
            <div class="flex flex-wrap items-start
                        justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-sm font-semibold
                              text-gray-900">
                        ${escapeHtml(item.userName || "Student")}
                    </p>
                    <p class="text-xs text-slate-400">
                        ${escapeHtml(item.courseTitle || item.targetLabel || "Website")}
                        · ${escapeHtml(formatDate(item.createdAt))}
                    </p>
                </div>
                ${starsHtml(item.rating)}
            </div>
            ${item.message ? `
            <p class="mt-3 text-sm text-slate-600">
                ${escapeHtml(item.message)}
            </p>` : ""}
        </div>
    `).join("");
}

// =====================================================
// Profile
// (GET /api/auth/me, PUT /api/auth/profile)
// =====================================================

// Fields the form can edit once "Edit Profile" is pressed.
const PROFILE_EDITABLE_FIELDS = [
    "facultyProfileName",
    "facultyProfileDepartment",
    "facultyProfileQualification",
    "facultyProfileExperience",
    "facultyProfilePhone"
];

// System-managed fields: always read-only (the backend
// assigns the faculty id, owns the login email and stamps
// the join date itself).
const PROFILE_READONLY_FIELDS = [
    "facultyProfileId",
    "facultyProfileEmail",
    "facultyProfileJoined"
];

async function loadFacultyProfile() {
    const me = await apiGet("/api/auth/me");

    facultyProfile = me || null;

    renderFacultyProfile();
}

function applyProfileEditingState() {
    PROFILE_READONLY_FIELDS.forEach(id => {
        const field = $(id);

        if (field) {
            field.disabled = true;
        }
    });

    PROFILE_EDITABLE_FIELDS.forEach(id => {
        const field = $(id);

        if (field) {
            field.disabled = !profileEditing;
        }
    });

    // Save only exists while editing; Edit doubles as the
    // read-only affordance and disables itself in edit mode.
    $("facultyProfileSaveBtn")?.classList.toggle(
        "hidden",
        !profileEditing
    );

    const editButton = $("facultyProfileEditBtn");

    if (editButton) {
        editButton.disabled = profileEditing;
        editButton.classList.toggle("opacity-50", profileEditing);
    }
}

function renderFacultyProfile() {
    if (!facultyProfile) {
        return;
    }

    setValue("facultyProfileName", facultyProfile.name);
    setValue("facultyProfileId", facultyProfile.facultyId);
    setValue("facultyProfileDepartment", facultyProfile.department);
    setValue("facultyProfileQualification", facultyProfile.qualification);
    setValue("facultyProfileExperience", facultyProfile.experience);
    setValue("facultyProfileEmail", facultyProfile.email);
    setValue("facultyProfilePhone", facultyProfile.phone);
    setValue("facultyProfileJoined", formatDate(facultyProfile.createdAt));

    applyProfileEditingState();
}

function setProfileEditing(editable) {
    profileEditing = editable;

    applyProfileEditingState();

    if (editable) {
        $("facultyProfileName")?.focus();
    }
}

async function handleProfileSave(event) {
    event.preventDefault();

    // Enter submits the form even while read-only; ignore it.
    if (!profileEditing) {
        return;
    }

    const name = getValue("facultyProfileName");

    if (!name) {
        facultyMessage(
            "facultyProfileMessage",
            "Please enter your full name.",
            "error"
        );
        return;
    }

    const button = $("facultyProfileSaveBtn");

    if (button) {
        button.disabled = true;
    }

    // Only the editable fields travel; email, faculty id and
    // the join date have no update route by design.
    const payload = {
        name,
        phone: getValue("facultyProfilePhone") || null,
        department: getValue("facultyProfileDepartment") || null,
        qualification: getValue("facultyProfileQualification") || null,
        experience: getValue("facultyProfileExperience") || null
    };

    try {
        const updated = await apiPut("/api/auth/profile", payload);

        facultyProfile = updated || facultyProfile;

        // Keep the stored session copy (header/sidebar name
        // and photo) in step with the server response.
        setStoredUser({
            ...(getStoredUser() || {}),
            ...(facultyProfile || {})
        });

        setProfileEditing(false);
        renderFacultyProfile();
        renderWelcome();
        renderHeaderProfile();

        facultyMessage(
            "facultyProfileMessage",
            "Profile updated successfully."
        );
    } catch (error) {
        console.error("Faculty profile save error:", error);

        facultyMessage(
            "facultyProfileMessage",
            errorMessage(error, "Could not update your profile."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Change password
// (PUT /api/auth/change-password)
// =====================================================
//
// One shared modal serves the Profile panel button and the
// header dropdown item; both routes only ever open it.
// =====================================================

function openChangePasswordModal() {
    const modal = $("facultyChangePasswordModal");

    if (!modal) {
        return;
    }

    // Never carry a stale error (or a typed password) over
    // from a previous attempt.
    $("facultyChangePasswordForm")?.reset();
    facultyMessage("facultyChangePasswordMessage", "");

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    $("facultyCurrentPassword")?.focus();
}

function closeChangePasswordModal() {
    const modal = $("facultyChangePasswordModal");

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");

    $("facultyChangePasswordForm")?.reset();
    facultyMessage("facultyChangePasswordMessage", "");
}

async function handleChangePassword(event) {
    event.preventDefault();

    const currentPassword = getValue("facultyCurrentPassword");
    const newPassword = getValue("facultyNewPassword");
    const confirmPassword = getValue("facultyConfirmPassword");

    if (!currentPassword || !newPassword) {
        facultyMessage(
            "facultyChangePasswordMessage",
            "Please fill in both passwords.",
            "error"
        );
        return;
    }

    if (newPassword.length < 8) {
        facultyMessage(
            "facultyChangePasswordMessage",
            "The new password must be at least 8 characters.",
            "error"
        );
        return;
    }

    if (newPassword !== confirmPassword) {
        facultyMessage(
            "facultyChangePasswordMessage",
            "The new passwords do not match.",
            "error"
        );
        return;
    }

    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');

    if (button) {
        button.disabled = true;
    }

    try {
        await apiPut("/api/auth/change-password", {
            currentPassword,
            newPassword
        });

        form?.reset();

        facultyMessage(
            "facultyChangePasswordMessage",
            "Password updated successfully."
        );

        // Leave the confirmation visible for a moment, then
        // close so the success is still readable.
        window.setTimeout(closeChangePasswordModal, 1200);
    } catch (error) {
        console.error("Faculty change password error:", error);

        facultyMessage(
            "facultyChangePasswordMessage",
            errorMessage(error, "Could not change the password."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Courses (GET /api/faculty/courses)
// =====================================================

async function loadFacultyCourses() {
    const rows = await apiGet("/api/faculty/courses");

    facultyCourses = (Array.isArray(rows) ? rows : [])
        .map(normalizeCourse)
        .filter(Boolean);

    renderFacultyCourses();
    populateBundleSelect();
}

function renderFacultyCourses() {
    const list = $("facultyCoursesList");

    if (!list) {
        return;
    }

    if (!facultyCourses.length) {
        list.innerHTML = emptyStateHtml(
            "fa-rocket",
            "You haven't launched a course yet."
        );
        return;
    }

    list.innerHTML = facultyCourses.map(course => {
        const price = formatPrice(course.price_inr);
        const compareAt = Number(course.mrp_inr) > Number(course.price_inr)
            ? formatPrice(course.mrp_inr)
            : "";
        const validity = Number(course.validity_days) > 0
            ? `${Number(course.validity_days)} days validity`
            : "";
        const meta = [
            course.code || "",
            course.category || ""
        ].filter(Boolean).join(" · ");

        return `
            <article class="resource-card rounded-2xl border border-gray-200
                            bg-white p-5 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <h4 class="truncate text-base font-semibold text-gray-900"
                            title="${escapeHtml(course.title || "Untitled course")}">
                            ${escapeHtml(course.title || "Untitled course")}
                        </h4>
                        <p class="mt-1 text-xs text-slate-400">
                            ${escapeHtml(meta)}
                        </p>
                    </div>
                    ${course.is_active ? `
                    <span class="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1
                                 text-xs font-bold text-emerald-700">
                        Live
                    </span>` : `
                    <span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1
                                 text-xs font-bold text-slate-600">
                        Draft
                    </span>`}
                </div>
                <div class="mt-4 flex flex-wrap items-center gap-2">
                    <span class="text-base font-extrabold text-blue-600">
                        ${escapeHtml(price)}
                    </span>
                    ${compareAt ? `
                    <span class="text-xs text-slate-400 line-through">
                        ${escapeHtml(compareAt)}
                    </span>` : ""}
                    ${validity ? `
                    <span class="text-xs text-slate-400">
                        ${escapeHtml(validity)}
                    </span>` : ""}
                </div>
                <button type="button"
                    data-faculty-open-course="${escapeHtml(String(course.id ?? ""))}"
                    class="mt-4 w-full inline-flex items-center justify-center gap-2
                           rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold
                           text-slate-700 transition hover:bg-slate-200">
                    <i class="fa-regular fa-folder-open"></i>
                    View content
                </button>
                <div class="mt-2 grid grid-cols-2 gap-2">
                    <button type="button"
                        data-faculty-edit-course="${escapeHtml(String(course.id ?? ""))}"
                        class="inline-flex items-center justify-center gap-2
                               rounded-xl border border-slate-200 px-3 py-2.5
                               text-sm font-semibold text-slate-700 transition
                               hover:bg-slate-50">
                        <i class="fa-solid fa-pen"></i>
                        Edit
                    </button>
                    <button type="button"
                        data-faculty-toggle-course="${escapeHtml(String(course.id ?? ""))}"
                        class="inline-flex items-center justify-center gap-2
                               rounded-xl px-3 py-2.5 text-sm font-semibold
                               transition ${course.is_active
                                   ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                   : "bg-blue-600 text-white hover:bg-blue-700"}">
                        <i class="fa-solid ${course.is_active
                            ? "fa-eye-slash"
                            : "fa-paper-plane"}"></i>
                        ${course.is_active ? "Unpublish" : "Publish"}
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

// Fill one "My courses" picker with the optional bundles.
// firstLabel lets a picker frame the empty value its own way
// (bundle uploads say "Free — no bundle", the notification
// audience says "All my students").
function fillBundleSelect(select, firstLabel = "Free — no bundle") {
    if (!select) {
        return;
    }

    const previous = select.value;

    const options = facultyCourses.map(course => `
        <option value="${escapeHtml(String(course.id ?? ""))}">
            ${escapeHtml(course.title || "Untitled course")}
        </option>
    `).join("");

    select.innerHTML = `
        <option value="">
            ${escapeHtml(firstLabel)}
        </option>
        ${options}
    `;

    const canRestore = Array.from(select.options).some(
        option => option.value === previous
    );

    select.value = canRestore ? previous : "";
}

// "My courses" pickers for the optional bundles, the resource
// form and the notification audience.
function populateBundleSelect() {
    fillBundleSelect($("noteBundleSelect"));
    fillBundleSelect($("facultyTnpBundle"));
    fillBundleSelect($("facultyResourceCourse"));
    fillBundleSelect($("facultyNotifCourse"), "All my students");
}

// =====================================================
// Content collections
// (GET /api/faculty/notes | tnp-notes | pyqs | timetables)
// =====================================================

async function loadFacultyNotes() {
    const rows = await apiGet("/api/faculty/notes");

    facultyNotes = Array.isArray(rows) ? rows : [];

    renderActiveManageCategory();
}

// TNP resources (owner-scoped like the notes).
async function loadFacultyTnp() {
    const rows = await apiGet("/api/faculty/tnp-notes");

    facultyTnpItems = Array.isArray(rows) ? rows : [];

    renderActiveManageCategory();
}

// Previous year papers (owner-scoped like the notes).
async function loadFacultyPyqs() {
    const rows = await apiGet("/api/faculty/pyqs");

    facultyPyqItems = Array.isArray(rows) ? rows : [];

    renderActiveManageCategory();
}

// Exam timetables (owner-scoped like the notes).
async function loadFacultyTimetables() {
    const rows = await apiGet("/api/faculty/timetables");

    facultyTimetableItems = Array.isArray(rows) ? rows : [];

    renderActiveManageCategory();
}

// =====================================================
// Resources — videos / assignments / other files
// (GET /api/faculty/resources)
// =====================================================

async function loadFacultyResources() {
    const rows = await apiGet("/api/faculty/resources");

    facultyResources = Array.isArray(rows) ? rows : [];

    renderActiveManageCategory();
}

// Meta line for one resource row (manage cards and the
// course content viewer share it).
function resourceMetaLine(item) {
    const kindLabels = {
        VIDEO: "Video",
        ASSIGNMENT: "Assignment",
        OTHER: "Other file"
    };

    return [
        kindLabels[String(item.kind || "").toUpperCase()] || "Resource",
        item.fileName || ""
    ].filter(Boolean).join(" · ");
}

// The three resource categories render from one collection,
// filtered by kind to match the active pill.
function renderFacultyResources() {
    const list = $("facultyNotesList");

    if (!list) {
        return;
    }

    const kind = RESOURCE_KIND_BY_CATEGORY[activeManageCategory];

    const rows = kind
        ? facultyResources.filter(
            item => String(item.kind || "").toUpperCase() === kind
        )
        : [];

    if (!rows.length) {
        list.innerHTML = emptyStateHtml(
            "fa-photo-film",
            "No resources in this category yet."
        );
        return;
    }

    list.innerHTML = rows.map(item => contentCardHtml(item, {
        iconClass: "fa-solid fa-photo-film",
        titleFallback: "Untitled resource",
        metaLine: resourceMetaLine(item),
        // The link may be a video page, not a PDF.
        linkLabel: "Open",
        // Resources have no edit form of their own; editing
        // stays with the four original content categories.
        hideEdit: true
    })).join("");
}

// Reload whichever collection the success message is about.
function reloadFacultyContent(category) {
    switch (category) {
        case "tnp":
            return loadFacultyTnp();
        case "pyq":
            return loadFacultyPyqs();
        case "timetable":
            return loadFacultyTimetables();
        case "videos":
        case "assignments":
        case "other":
            return loadFacultyResources();
        default:
            return loadFacultyNotes();
    }
}

function noteMetaLine(note) {
    const parts = [
        note.subject || "",
        note.course || ""
    ].filter(Boolean);

    if (Number(note.year) > 0) {
        parts.push(`Year ${Number(note.year)}`);
    }

    if (Number(note.semester) > 0) {
        parts.push(`Semester ${Number(note.semester)}`);
    }

    return parts.join(" · ");
}

function renderFacultyNotes() {
    const list = $("facultyNotesList");

    if (!list) {
        return;
    }

    if (!facultyNotes.length) {
        list.innerHTML = emptyStateHtml(
            "fa-file-lines",
            "You haven't uploaded any notes yet."
        );
        return;
    }

    list.innerHTML = facultyNotes.map(note => {
        const fileUrl = typeof note.fileUrl === "string"
            ? note.fileUrl.trim()
            : "";

        // View only exists when there is a stored PDF.
        const canView = /^https?:\/\//i.test(fileUrl);

        const viewHtml = canView ? `
                    <a href="${escapeHtml(fileUrl)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="inline-flex items-center gap-2 rounded-lg bg-blue-50
                              px-3 py-2 text-sm font-medium text-blue-700 transition
                              hover:bg-blue-100">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        View
                    </a>` : "";

        const bundleBadge = note.courseTitle ? `
                <span class="mt-3 inline-flex rounded-full bg-violet-50 px-2.5 py-1
                             text-xs font-bold text-violet-700">
                    ${escapeHtml(note.courseTitle)}
                </span>` : "";

        return `
            <article data-faculty-note-card
                class="resource-card rounded-2xl border border-gray-200
                       bg-white p-5 shadow-sm">
                <div class="flex items-start gap-3">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center
                                rounded-xl bg-blue-50 text-blue-600">
                        <i class="fa-regular fa-file-lines"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="truncate text-base font-semibold text-gray-900"
                            title="${escapeHtml(note.title || "Untitled note")}">
                            ${escapeHtml(note.title || "Untitled note")}
                        </h3>
                        <p class="mt-1 text-xs text-slate-400">
                            ${escapeHtml(noteMetaLine(note))}
                        </p>
                        <p class="mt-1 text-xs text-slate-400">
                            Uploaded ${escapeHtml(formatDate(note.createdAt))}
                        </p>
                    </div>
                </div>
                ${bundleBadge}
                <div class="mt-4 flex flex-wrap items-center gap-2">
                    ${viewHtml}
                    <button type="button"
                        class="faculty-edit-btn inline-flex items-center gap-2
                               rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium
                               text-slate-700 transition hover:bg-slate-200"
                        data-note-id="${escapeHtml(String(note.id ?? ""))}">
                        <i class="fa-solid fa-pen"></i>
                        Edit
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function findNote(noteId) {
    const wanted = String(noteId);

    return facultyNotes.find(
        note => String(note.id) === wanted
    ) || null;
}

// =====================================================
// Manage Content — category routing
// =====================================================
//
// One list container (#facultyNotesList) serves all four
// categories; the pill row picks which renderer runs.
// =====================================================

function renderActiveManageCategory() {
    switch (activeManageCategory) {
        case "tnp":
            renderFacultyTnp();
            break;
        case "pyq":
            renderFacultyPyq();
            break;
        case "timetable":
            renderFacultyTimetable();
            break;
        case "videos":
        case "assignments":
        case "other":
            renderFacultyResources();
            break;
        default:
            // Notes keep their original card rendering.
            renderFacultyNotes();
    }
}

// Resolve an id inside the collection for a category.
function findContentItem(category, itemId) {
    if (category === "notes") {
        return findNote(itemId);
    }

    const wanted = String(itemId);

    const source = {
        tnp: facultyTnpItems,
        pyq: facultyPyqItems,
        timetable: facultyTimetableItems
    }[category] || [];

    return source.find(
        item => String(item.id) === wanted
    ) || null;
}

// =====================================================
// Shared card markup for tnp / pyq / timetable
// (mirrors renderFacultyNotes so the look matches)
// =====================================================

function contentCardHtml(item, options) {
    const titleFallback = options.titleFallback || "Untitled content";
    const title = item.title || titleFallback;
    const metaLine = String(options.metaLine || "").trim();

    const fileUrl = typeof item.fileUrl === "string"
        ? item.fileUrl.trim()
        : "";

    // View only exists when there is a stored file.
    const canView = /^https?:\/\//i.test(fileUrl);

    // Videos and files alike: PDFs say "View PDF", link
    // resources say "Open" (set per group / caller).
    const viewHtml = canView ? `
                    <a href="${escapeHtml(fileUrl)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="inline-flex items-center gap-2 rounded-lg bg-blue-50
                              px-3 py-2 text-sm font-medium text-blue-700 transition
                              hover:bg-blue-100">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        ${escapeHtml(options.linkLabel || "View PDF")}
                    </a>` : "";

    const metaHtml = metaLine ? `
                        <p class="mt-1 text-xs text-slate-400">
                            ${escapeHtml(metaLine)}
                        </p>` : "";

    const descriptionHtml = item.description ? `
                <p class="mt-3 text-sm text-slate-500 line-clamp-2">
                    ${escapeHtml(item.description)}
                </p>` : "";

    const bundleBadge = item.courseTitle ? `
                <span class="mt-3 inline-flex rounded-full bg-violet-50 px-2.5 py-1
                             text-xs font-bold text-violet-700">
                    ${escapeHtml(item.courseTitle)}
                </span>` : "";

    return `
            <article data-faculty-content-card
                class="resource-card rounded-2xl border border-gray-200
                       bg-white p-5 shadow-sm">
                <div class="flex items-start gap-3">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center
                                rounded-xl bg-blue-50 text-blue-600">
                        <i class="${escapeHtml(options.iconClass)}"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="truncate text-base font-semibold text-gray-900"
                            title="${escapeHtml(title)}">
                            ${escapeHtml(title)}
                        </h3>
                        ${metaHtml}
                        <p class="mt-1 text-xs text-slate-400">
                            Uploaded ${escapeHtml(formatDate(item.createdAt))}
                        </p>
                    </div>
                </div>
                ${descriptionHtml}
                ${bundleBadge}
                <div class="mt-4 flex flex-wrap items-center gap-2">
                    ${viewHtml}
                    ${options.hideEdit ? "" : `
                    <button type="button"
                        class="faculty-edit-btn inline-flex items-center gap-2
                               rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium
                               text-slate-700 transition hover:bg-slate-200"
                        data-note-id="${escapeHtml(String(item.id ?? ""))}">
                        <i class="fa-solid fa-pen"></i>
                        Edit
                    </button>`}
                </div>
            </article>
        `;
}

// =====================================================
// TNP (GET /api/faculty/tnp-notes)
// =====================================================

function tnpMetaLine(item) {
    // "topic" carries the subject / topic area label.
    return [item.topic || ""].filter(Boolean).join(" · ");
}

function renderFacultyTnp() {
    const list = $("facultyNotesList");

    if (!list) {
        return;
    }

    if (!facultyTnpItems.length) {
        list.innerHTML = emptyStateHtml(
            "fa-briefcase",
            "You haven't uploaded any TNP resources yet."
        );
        return;
    }

    list.innerHTML = facultyTnpItems.map(item => contentCardHtml(item, {
        iconClass: "fa-solid fa-briefcase",
        titleFallback: "Untitled TNP resource",
        metaLine: tnpMetaLine(item)
    })).join("");
}

// =====================================================
// PYQ (GET /api/faculty/pyqs)
// =====================================================

function pyqMetaLine(item) {
    const parts = [
        item.subject || "",
        item.course || "",
        item.branch || ""
    ].filter(Boolean);

    if (Number(item.semester) > 0) {
        parts.push(`Semester ${Number(item.semester)}`);
    }

    if (Number(item.examYear) > 0) {
        parts.push(`${Number(item.examYear)}`);
    }

    return parts.join(" · ");
}

function renderFacultyPyq() {
    const list = $("facultyNotesList");

    if (!list) {
        return;
    }

    if (!facultyPyqItems.length) {
        list.innerHTML = emptyStateHtml(
            "fa-clock-rotate-left",
            "You haven't uploaded any previous year papers yet."
        );
        return;
    }

    list.innerHTML = facultyPyqItems.map(item => contentCardHtml(item, {
        iconClass: "fa-solid fa-clock-rotate-left",
        titleFallback: "Untitled previous year paper",
        metaLine: pyqMetaLine(item)
    })).join("");
}

// =====================================================
// Timetable (GET /api/faculty/timetables)
// =====================================================

function timetableMetaLine(item) {
    const parts = [
        item.course || "",
        item.examType || ""
    ].filter(Boolean);

    if (Number(item.semester) > 0) {
        parts.push(`Semester ${Number(item.semester)}`);
    }

    if (Number(item.examYear) > 0) {
        parts.push(`${Number(item.examYear)}`);
    }

    return parts.join(" · ");
}

function renderFacultyTimetable() {
    const list = $("facultyNotesList");

    if (!list) {
        return;
    }

    if (!facultyTimetableItems.length) {
        list.innerHTML = emptyStateHtml(
            "fa-calendar-days",
            "You haven't uploaded any exam timetables yet."
        );
        return;
    }

    list.innerHTML = facultyTimetableItems.map(item => contentCardHtml(item, {
        iconClass: "fa-solid fa-calendar-days",
        titleFallback: "Untitled timetable",
        metaLine: timetableMetaLine(item)
    })).join("");
}

// =====================================================
// Edit modal (own markup in faculty.html)
// =====================================================
//
// One modal serves all four categories: the hidden
// #facultyEditCategory field remembers which collection the
// record came from, drives the visible field groups and
// decides where handleEditSubmit PUTs the update.
// =====================================================

// Field-group wrapper ids inside #facultyEditForm.
const EDIT_GROUP_IDS = {
    subject: "facultyEditGroupSubject",
    title: "facultyEditGroupTitle",
    course: "facultyEditGroupCourse",
    branch: "facultyEditGroupBranch",
    semester: "facultyEditGroupSemester",
    examYear: "facultyEditGroupExamYear",
    examType: "facultyEditGroupExamType",
    description: "facultyEditGroupDescription",
    file: "facultyEditGroupFile",
    videos: "facultyEditGroupVideos"
};

// Which field groups each category exposes. Timetables carry
// no description; notes/tnp/pyq share subject/title/
// description/replace-file.
const EDIT_FIELDS_BY_CATEGORY = {
    notes: ["subject", "title", "description", "file", "videos"],
    tnp: ["subject", "title", "description", "file", "videos"],
    pyq: [
        "subject", "title", "course", "branch",
        "semester", "examYear", "description", "file"
    ],
    timetable: ["course", "semester", "examYear", "examType", "title", "file"]
};

// One PUT route per content category (all owner-scoped).
const EDIT_ENDPOINTS = {
    notes: id => `/api/faculty/notes/${encodeURIComponent(id)}`,
    tnp: id => `/api/faculty/tnp-notes/${encodeURIComponent(id)}`,
    pyq: id => `/api/faculty/pyqs/${encodeURIComponent(id)}`,
    timetable: id => `/api/faculty/timetables/${encodeURIComponent(id)}`
};

async function openEditModal(category, item) {
    const modal = $("facultyEditModal");

    if (!modal || !item) {
        return;
    }

    const activeCategory = EDIT_FIELDS_BY_CATEGORY[category]
        ? category
        : "notes";

    const fields = EDIT_FIELDS_BY_CATEGORY[activeCategory];

    // Videos are fetched only when a Notes/TNP edit form opens.
    // null = the fetch failed, so a later save must keep the stored list.
    let videos = item.videos;

    if (activeCategory === "notes" || activeCategory === "tnp") {
        try {
            videos = await getRelatedVideos(activeCategory, item.id);
        } catch (error) {
            console.warn("Could not load related videos:", error);
            videos = null;
        }
    }

    // Show only the field groups this category uses.
    Object.entries(EDIT_GROUP_IDS).forEach(([field, elementId]) => {
        $(elementId)?.classList.toggle(
            "hidden",
            !fields.includes(field)
        );
    });

    const idField = $("facultyEditNoteId");
    const categoryField = $("facultyEditCategory");

    if (idField) {
        idField.value = String(item.id ?? "");
    }

    if (categoryField) {
        categoryField.value = activeCategory;
    }

    // Heading + subject wording follow the category.
    const heading = $("facultyEditHeading");

    if (heading) {
        heading.textContent = `Edit ${CATEGORY_LABELS[activeCategory]}`;
    }

    const subjectLabel = $("facultyEditSubjectLabel");

    if (subjectLabel) {
        // TNP stores its subject / topic area under "topic".
        subjectLabel.textContent = activeCategory === "tnp"
            ? "Subject / Topic"
            : "Subject";
    }

    const subjectField = $("facultyEditSubject");

    if (subjectField) {
        subjectField.value = activeCategory === "tnp"
            ? (item.topic || "")
            : (item.subject || "");
    }

    const titleField = $("facultyEditTitle");

    if (titleField) {
        titleField.value = item.title || "";
    }

    const courseField = $("facultyEditCourse");

    if (courseField) {
        courseField.value = item.course || "";
    }

    const branchField = $("facultyEditBranch");

    if (branchField) {
        branchField.value = item.branch || "";
    }

    const semesterField = $("facultyEditSemester");

    if (semesterField) {
        // 0 / absent means "no semester selected".
        semesterField.value = Number(item.semester) > 0
            ? String(Number(item.semester))
            : "";
    }

    const examYearField = $("facultyEditExamYear");

    if (examYearField) {
        examYearField.value = Number(item.examYear) > 0
            ? String(Number(item.examYear))
            : "";
    }

    const examTypeField = $("facultyEditExamType");

    if (examTypeField) {
        examTypeField.value = item.examType || "";
    }

    const descriptionField = $("facultyEditDescription");

    if (descriptionField) {
        descriptionField.value = item.description || "";
    }

    const fileField = $("facultyEditFile");

    if (fileField) {
        fileField.value = "";
    }

    const videoManager = $("facultyEditGroupVideos");

    if (videoManager) {
        const isVideoCategory =
            activeCategory === "notes" || activeCategory === "tnp";

        if (isVideoCategory && videos !== null) {
            videoManager.dataset.videoUnavailable = "false";
            setVideos(videoManager, videos || []);
        } else {
            videoManager.dataset.videoUnavailable =
                isVideoCategory ? "true" : "false";

            setVideos(videoManager, []);
        }
    }

    facultyMessage("facultyEditMessage", "");

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    // Focus the first visible field of this category.
    const firstVisibleField = Array.from(
        modal.querySelectorAll(
            "input:not([type='hidden']), select, textarea"
        )
    ).find(field => !field.closest(".hidden"));

    firstVisibleField?.focus();
}

function closeEditModal() {
    const modal = $("facultyEditModal");

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");

    $("facultyEditForm")?.reset();
    facultyMessage("facultyEditMessage", "");
}

// =====================================================
// Course content viewer (read-only modal)
// GET /api/faculty/courses/{id}/content
// =====================================================
//
// The endpoint answers { course, notes, tnpNotes, pyqs,
// timetables } using the exact same item shapes as the four
// owner-scoped collections, so the existing per-category meta
// helpers describe every row.
//
// This viewer is read-only by design: there is NO edit or
// delete affordance here. Editing stays in #facultyEditModal
// and removal stays behind the admin endpoints only.
// =====================================================

// One block per content collection inside the modal body.
const COURSE_CONTENT_GROUPS = [
    {
        heading: "Notes",
        iconClass: "fa-solid fa-file-lines",
        titleFallback: "Untitled note",
        itemsKey: "notes",
        metaLine: noteMetaLine
    },
    {
        heading: "TNP Resources",
        iconClass: "fa-solid fa-briefcase",
        titleFallback: "Untitled TNP resource",
        itemsKey: "tnpNotes",
        metaLine: tnpMetaLine
    },
    {
        heading: "Previous Year Papers",
        iconClass: "fa-solid fa-clock-rotate-left",
        titleFallback: "Untitled previous year paper",
        itemsKey: "pyqs",
        metaLine: pyqMetaLine
    },
    {
        heading: "Exam Timetables",
        iconClass: "fa-solid fa-calendar-days",
        titleFallback: "Untitled timetable",
        itemsKey: "timetables",
        metaLine: timetableMetaLine
    },
    {
        // Injected client-side in openCourseContent(): the
        // endpoint predates /api/faculty/resources, so the
        // three resource kinds are merged in from the loaded
        // owner-scoped collection instead of a backend field.
        heading: "Videos, Assignments & Files",
        iconClass: "fa-solid fa-photo-film",
        titleFallback: "Untitled resource",
        itemsKey: "resources",
        metaLine: resourceMetaLine,
        // The link may be a video page, not a PDF.
        linkLabel: "Open"
    }
];

// Read-only sibling of contentCardHtml(): same card look,
// but only the View / Open link - never Edit / delete buttons.
function courseContentCardHtml(item, options) {
    const title = item.title || options.titleFallback;
    const metaLine = String(options.metaLine(item) || "").trim();

    // Rows normally carry camelCase fileUrl; file_url is kept
    // as a fallback in case a payload arrives snake-cased.
    const fileUrl = typeof item.fileUrl === "string"
        ? item.fileUrl.trim()
        : (typeof item.file_url === "string"
            ? item.file_url.trim()
            : "");

    const canView = /^https?:\/\//i.test(fileUrl);

    const viewHtml = canView ? `
                <div class="mt-3">
                    <a href="${escapeHtml(fileUrl)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="inline-flex items-center gap-2 rounded-lg bg-blue-50
                              px-3 py-2 text-sm font-medium text-blue-700 transition
                              hover:bg-blue-100">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        ${escapeHtml(options.linkLabel || "View PDF")}
                    </a>
                </div>` : "";

    const metaHtml = metaLine ? `
                        <p class="mt-1 text-xs text-slate-400">
                            ${escapeHtml(metaLine)}
                        </p>` : "";

    return `
            <article class="resource-card rounded-2xl border border-gray-200
                           bg-white p-4 shadow-sm">
                <div class="flex items-start gap-3">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center
                                rounded-xl bg-blue-50 text-blue-600">
                        <i class="${escapeHtml(options.iconClass)}"></i>
                    </div>
                    <div class="min-w-0">
                        <h4 class="truncate text-sm font-semibold text-gray-900"
                            title="${escapeHtml(title)}">
                            ${escapeHtml(title)}
                        </h4>
                        ${metaHtml}
                        <p class="mt-1 text-xs text-slate-400">
                            Uploaded ${escapeHtml(formatDate(item.createdAt))}
                        </p>
                    </div>
                </div>
                ${viewHtml}
            </article>
        `;
}

// One labelled block (subheading + item grid) per category.
function courseContentGroupHtml(group, items) {
    return `
        <section>
            <div class="mb-3 flex items-center gap-2">
                <i class="${escapeHtml(group.iconClass)} text-slate-400 text-sm"></i>
                <h4 class="text-sm font-extrabold uppercase tracking-wide text-slate-700">
                    ${escapeHtml(group.heading)}
                </h4>
                <span class="rounded-full bg-slate-100 px-2 py-0.5
                             text-xs font-bold text-slate-500">
                    ${items.length}
                </span>
            </div>
            <div class="grid sm:grid-cols-2 gap-4">
                ${items.map(item => courseContentCardHtml(item, group)).join("")}
            </div>
        </section>
    `;
}

// Fill #facultyCourseContentBody with whichever categories
// actually hold content (empty course -> shared empty state).
function renderCourseContentBody(data) {
    const body = $("facultyCourseContentBody");

    if (!body) {
        return;
    }

    const blocks = COURSE_CONTENT_GROUPS
        .map(group => ({
            group,
            items: Array.isArray(data?.[group.itemsKey])
                ? data[group.itemsKey]
                : []
        }))
        .filter(entry => entry.items.length);

    if (!blocks.length) {
        body.innerHTML = emptyStateHtml(
            "fa-folder-open",
            "No content uploaded for this course yet."
        );
        return;
    }

    body.innerHTML = blocks
        .map(entry => courseContentGroupHtml(entry.group, entry.items))
        .join("");
}

async function openCourseContent(courseId) {
    const modal = $("facultyCourseContentModal");
    const title = $("facultyCourseContentTitle");
    const body = $("facultyCourseContentBody");

    if (!modal || !body) {
        return;
    }

    if (title) {
        title.textContent = "Course Content";
    }

    body.innerHTML = `
        <div class="rounded-2xl border border-dashed
                    border-gray-300 bg-white p-10
                    text-center shadow-sm">
            <div class="mx-auto mb-4 flex h-14 w-14
                        items-center justify-center
                        rounded-full bg-gray-100">
                <i class="fa-solid fa-spinner fa-spin text-slate-400 text-xl"></i>
            </div>
            <p class="text-sm text-slate-500">Loading course content…</p>
        </div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    try {
        const data = await apiGet(
            `/api/faculty/courses/${encodeURIComponent(String(courseId))}/content`
        );

        if (title) {
            title.textContent = data?.course?.title || "Course Content";
        }

        // Merge in this course's resources (videos /
        // assignments / other files) from the collection
        // loaded at startup; unattached ("free") resources
        // belong to no course viewer.
        data.resources = facultyResources.filter(
            item => String(item.courseId ?? "") === String(courseId)
        );

        renderCourseContentBody(data);
    } catch (error) {
        console.error("Faculty course content loading error:", error);

        // 403 / 404 carry the backend's message through apiGet().
        body.innerHTML = `
            <div class="rounded-2xl border border-red-200
                        bg-red-50 px-4 py-3 text-sm text-red-700">
                ${escapeHtml(errorMessage(
                    error,
                    "Could not load course content."
                ))}
            </div>
        `;
    }
}

function closeCourseContentModal() {
    const modal = $("facultyCourseContentModal");

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");

    const body = $("facultyCourseContentBody");

    if (body) {
        body.innerHTML = "";
    }
}

// =====================================================
// Launch course — POST /api/faculty/courses
// =====================================================

async function handleLaunchCourse(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');

    const title = getValue("launchCourseTitle");
    const price = getNumber("launchCoursePrice");

    if (!title) {
        facultyMessage(
            "launchCourseMessage",
            "Please enter the course title.",
            "error"
        );
        return;
    }

    if (price === null || price < 0) {
        facultyMessage(
            "launchCourseMessage",
            "Please enter a valid price (0 or more).",
            "error"
        );
        return;
    }

    const mrp = getNumber("launchCourseMrp");
    const validity = getNumber("launchCourseValidity");
    const highlights = getValue("launchCourseHighlights")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    const payload = {
        title,
        code: getValue("launchCourseCode") || null,
        category: getValue("launchCourseCategory") || null,
        description: getValue("launchCourseDescription") || null,
        priceInr: price,
        // No compare-at price when the field is blank or not a discount.
        mrpInr: mrp !== null && mrp > price ? mrp : null,
        validityDays: validity !== null && validity >= 1 ? validity : 365,
        highlights: highlights.length ? highlights : null
    };

    // Edit mode keeps the publish state: only the fields the
    // form owns travel with the request, everything else is
    // left untouched server-side.
    const editing = editingCourseId
        ? findCourse(editingCourseId)
        : null;

    if (editing) {
        payload.active = !!editing.is_active;
    }

    if (button) {
        button.disabled = true;
    }

    try {
        if (editing) {
            await apiPut(
                `/api/faculty/courses/${encodeURIComponent(String(editing.id))}`,
                payload
            );

            facultyMessage(
                "launchCourseMessage",
                "Course updated successfully."
            );
        } else {
            const created = await apiPost(
                "/api/faculty/courses",
                payload
            );

            facultyMessage(
                "launchCourseMessage",
                "Course launched successfully. It is live now."
            );

            if (created) {
                dispatchRefresh();
            }
        }

        // Back to create mode either way.
        editingCourseId = null;
        form?.reset();
        setLaunchFormMode(null);

        await loadFacultyCourses();
    } catch (error) {
        console.error("Launch course error:", error);

        facultyMessage(
            "launchCourseMessage",
            errorMessage(
                error,
                editing
                    ? "Could not update the course."
                    : "Could not launch the course."
            ),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Upload note — uploadPdf() then POST /api/faculty/notes
// =====================================================

async function handleUploadNote(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $("uploadNoteBtn");

    const subject = getValue("facultyNoteSubject");
    const file = getFile("facultyNoteFile");

    if (!subject) {
        facultyMessage(
            "uploadNoteMessage",
            "Please enter the subject.",
            "error"
        );
        return;
    }

    if (!file) {
        facultyMessage(
            "uploadNoteMessage",
            "Please select a PDF file.",
            "error"
        );
        return;
    }

    let videos;

    try {
        // Validate every YouTube link before starting the upload.
        videos = collectVideos("facultyNoteVideos");
    } catch (error) {
        facultyMessage(
            "uploadNoteMessage",
            error.message,
            "error"
        );
        return;
    }

    if (button) {
        button.disabled = true;
    }

    facultyMessage(
        "uploadNoteMessage",
        "Uploading PDF to Cloudinary…",
        "success",
        0
    );

    try {
        // Browser -> Cloudinary (same pipeline as admin).
        const uploaded = await uploadPdf(file, PDF_FOLDER);

        const fileUrl = uploaded?.file_url || null;
        const storagePath = uploaded?.cloudinary_public_id || null;

        if (!fileUrl) {
            throw new Error(
                "Upload succeeded, but no file URL was returned."
            );
        }

        const payload = {
            title: getValue("facultyNoteTitle") || null,
            subject,
            course: getValue("facultyNoteCourse") || null,
            branch: getValue("facultyNoteBranch") || null,
            year: getNumber("facultyNoteYear"),
            semester: getNumber("facultyNoteSemester"),
            description: getValue("facultyNoteDescription") || null,
            fileUrl,
            storagePath,
            // Optional ordered YouTube lectures
            videos,
            // Optional bundle this note unlocks.
            courseId: getNumber("noteBundleSelect")
        };

        await apiPost("/api/faculty/notes", payload);

        form?.reset();

        resetVideos("facultyNoteVideos");

        facultyMessage(
            "uploadNoteMessage",
            "Note uploaded successfully."
        );

        await loadFacultyNotes();
        dispatchRefresh();
    } catch (error) {
        console.error("Faculty note upload error:", error);

        facultyMessage(
            "uploadNoteMessage",
            errorMessage(error, "Could not upload the note."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// TNP upload — uploadPdf() then POST /api/faculty/tnp-notes
// =====================================================

async function handleUploadTnp(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $("facultyUploadTnpBtn");
    const messageElement = UPLOAD_MESSAGE_IDS.tnp;

    const topic = getValue("facultyTnpTopic");
    const file = getFile("facultyTnpFile");

    if (!topic) {
        facultyMessage(
            messageElement,
            "Please enter the subject / topic area.",
            "error"
        );
        return;
    }

    if (!file) {
        facultyMessage(
            messageElement,
            "Please select a PDF file.",
            "error"
        );
        return;
    }

    let videos;

    try {
        // Validate every YouTube link before starting the upload.
        videos = collectVideos("facultyTnpVideos");
    } catch (error) {
        facultyMessage(
            messageElement,
            error.message,
            "error"
        );
        return;
    }

    if (button) {
        button.disabled = true;
    }

    facultyMessage(
        messageElement,
        "Uploading PDF to Cloudinary…",
        "success",
        0
    );

    try {
        // Browser -> Cloudinary (same pipeline as admin).
        const uploaded = await uploadPdf(file, CONTENT_FOLDERS.tnp);

        const fileUrl = uploaded?.file_url || null;
        const storagePath = uploaded?.cloudinary_public_id || null;

        if (!fileUrl) {
            throw new Error(
                "Upload succeeded, but no file URL was returned."
            );
        }

        const payload = {
            title: getValue("facultyTnpTitle") || null,
            // The "Subject / Topic area" input maps to topic.
            topic,
            fileUrl,
            storagePath,
            // Optional ordered YouTube lectures
            videos,
            // Optional bundle this TNP resource unlocks.
            courseId: getNumber("facultyTnpBundle")
        };

        await apiPost("/api/faculty/tnp-notes", payload);

        form?.reset();

        resetVideos("facultyTnpVideos");

        facultyMessage(
            messageElement,
            "TNP resource uploaded successfully."
        );

        await loadFacultyTnp();
        dispatchRefresh();
    } catch (error) {
        console.error("Faculty TNP upload error:", error);

        facultyMessage(
            messageElement,
            errorMessage(error, "Could not upload the TNP resource."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// PYQ upload — uploadPdf() then POST /api/faculty/pyqs
// =====================================================

async function handleUploadPyq(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $("facultyUploadPyqBtn");
    const messageElement = UPLOAD_MESSAGE_IDS.pyq;

    const subject = getValue("facultyPyqSubject");
    const file = getFile("facultyPyqFile");

    if (!subject) {
        facultyMessage(
            messageElement,
            "Please enter the subject.",
            "error"
        );
        return;
    }

    if (!file) {
        facultyMessage(
            messageElement,
            "Please select a PDF file.",
            "error"
        );
        return;
    }

    if (button) {
        button.disabled = true;
    }

    facultyMessage(
        messageElement,
        "Uploading PDF to Cloudinary…",
        "success",
        0
    );

    try {
        // Browser -> Cloudinary (same pipeline as admin).
        const uploaded = await uploadPdf(file, CONTENT_FOLDERS.pyq);

        const fileUrl = uploaded?.file_url || null;
        const storagePath = uploaded?.cloudinary_public_id || null;

        if (!fileUrl) {
            throw new Error(
                "Upload succeeded, but no file URL was returned."
            );
        }

        const payload = {
            title: getValue("facultyPyqTitle") || null,
            subject,
            course: getValue("facultyPyqCourse") || null,
            branch: getValue("facultyPyqBranch") || null,
            // 0 = no semester selected (PyqResponse contract).
            semester: getNumber("facultyPyqSemester") || 0,
            examYear: getNumber("facultyPyqExamYear"),
            fileUrl,
            storagePath
        };

        await apiPost("/api/faculty/pyqs", payload);

        form?.reset();

        facultyMessage(
            messageElement,
            "Previous year paper uploaded successfully."
        );

        await loadFacultyPyqs();
        dispatchRefresh();
    } catch (error) {
        console.error("Faculty PYQ upload error:", error);

        facultyMessage(
            messageElement,
            errorMessage(error, "Could not upload the previous year paper."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Timetable upload — uploadPdf() then POST /api/faculty/timetables
// =====================================================

async function handleUploadTimetable(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $("facultyUploadTimetableBtn");
    const messageElement = UPLOAD_MESSAGE_IDS.timetable;

    const course = getValue("facultyTimetableCourse");
    const examType = getValue("facultyTimetableExamType");
    const file = getFile("facultyTimetableFile");

    if (!course) {
        facultyMessage(
            messageElement,
            "Please enter the course.",
            "error"
        );
        return;
    }

    if (!examType) {
        facultyMessage(
            messageElement,
            "Please select the exam type.",
            "error"
        );
        return;
    }

    if (!file) {
        facultyMessage(
            messageElement,
            "Please select a timetable file.",
            "error"
        );
        return;
    }

    if (button) {
        button.disabled = true;
    }

    facultyMessage(
        messageElement,
        "Uploading file to Cloudinary…",
        "success",
        0
    );

    try {
        // Browser -> Cloudinary (same pipeline as admin).
        const uploaded = await uploadPdf(file, CONTENT_FOLDERS.timetable);

        const fileUrl = uploaded?.file_url || null;
        const storagePath = uploaded?.cloudinary_public_id || null;

        if (!fileUrl) {
            throw new Error(
                "Upload succeeded, but no file URL was returned."
            );
        }

        // No title here: the backend composes it from course +
        // examType + examYear when the title is omitted.
        const payload = {
            course,
            semester: getNumber("facultyTimetableSemester"),
            examYear: getNumber("facultyTimetableExamYear"),
            examType,
            fileUrl,
            storagePath,
            // Original file name (the admin flow stores it too).
            fileName: file.name
        };

        await apiPost("/api/faculty/timetables", payload);

        form?.reset();

        facultyMessage(
            messageElement,
            "Exam timetable uploaded successfully."
        );

        await loadFacultyTimetables();
        dispatchRefresh();
    } catch (error) {
        console.error("Faculty timetable upload error:", error);

        facultyMessage(
            messageElement,
            errorMessage(error, "Could not upload the exam timetable."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Resource upload (videos / assignments / other files)
// url (videos) or uploadPdf() (the rest), then
// POST /api/faculty/resources
// =====================================================

async function handleUploadResource(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = $("facultyUploadResourceBtn");
    const messageElement = UPLOAD_MESSAGE_IDS.videos;

    const kind = getValue("facultyUploadResourceKind") || "VIDEO";
    const title = getValue("facultyResourceTitle");

    if (!title) {
        facultyMessage(
            messageElement,
            "Please enter a title.",
            "error"
        );
        return;
    }

    const isVideo = kind === "VIDEO";
    const file = getFile("facultyResourceFile");
    const url = getValue("facultyResourceUrl");

    if (isVideo && !/^https?:\/\//i.test(url)) {
        facultyMessage(
            messageElement,
            "Please enter a valid video URL (https://…).",
            "error"
        );
        return;
    }

    if (!isVideo && !file) {
        facultyMessage(
            messageElement,
            "Please select a PDF file.",
            "error"
        );
        return;
    }

    if (button) {
        button.disabled = true;
    }

    try {
        let fileUrl = null;
        let storagePath = null;
        let fileName = null;

        if (isVideo) {
            // Videos are links only - the storage pipeline
            // accepts PDFs and images, never video bytes.
            fileUrl = url;
        } else {
            facultyMessage(
                messageElement,
                "Uploading PDF to Cloudinary…",
                "success",
                0
            );

            // Browser -> Cloudinary (same pipeline as admin).
            const uploaded = await uploadPdf(
                file,
                CONTENT_FOLDERS[kind === "ASSIGNMENT"
                    ? "assignments"
                    : "other"]
            );

            fileUrl = uploaded?.file_url || null;
            storagePath = uploaded?.cloudinary_public_id || null;
            fileName = uploaded?.file_name || file?.name || null;

            if (!fileUrl) {
                throw new Error(
                    "Upload succeeded, but no file URL was returned."
                );
            }
        }

        const payload = {
            title,
            description: getValue("facultyResourceDescription") || null,
            kind,
            fileUrl,
            storagePath,
            fileName,
            // Optional bundle this resource unlocks.
            courseId: getNumber("facultyResourceCourse")
        };

        await apiPost("/api/faculty/resources", payload);

        form?.reset();

        // The reset clears the hidden kind field too; put the
        // visible row back in sync with the chosen category.
        syncResourceFormForCategory(
            $("facultyUploadCategory")?.value || "videos"
        );

        facultyMessage(
            messageElement,
            isVideo
                ? "Video link saved successfully."
                : "File uploaded successfully."
        );

        await loadFacultyResources();
        dispatchRefresh();
    } catch (error) {
        console.error("Faculty resource upload error:", error);

        facultyMessage(
            messageElement,
            errorMessage(error, "Could not upload the resource."),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Upload category selector — swaps the four upload forms
// =====================================================
//
// Each category lives in its own panel (message + form), so
// a late message from a hidden form can never surface under
// the category the user is looking at.
// =====================================================

function updateFacultyUploadCategoryPanel() {
    const category = $("facultyUploadCategory")?.value || "notes";

    // The three resource kinds share one panel, so they all
    // resolve to the same key.
    const panelKey = RESOURCE_KIND_BY_CATEGORY[category]
        ? "resource"
        : category;

    const panels = {
        notes: $("facultyUploadNotesPanel"),
        tnp: $("facultyUploadTnpPanel"),
        pyq: $("facultyUploadPyqPanel"),
        timetable: $("facultyUploadTimetablePanel"),
        resource: $("facultyUploadResourcePanel")
    };

    Object.entries(panels).forEach(([name, panel]) => {
        if (!panel) {
            return;
        }

        panel.classList.toggle("hidden", name !== panelKey);
    });

    if (panelKey === "resource") {
        syncResourceFormForCategory(category);
    }

    // Subtitle follows the selected category.
    const subtitle = $("facultyUploadSubtitle");

    if (subtitle) {
        subtitle.textContent = UPLOAD_SUBTITLES[category]
            || UPLOAD_SUBTITLES.notes;
    }
}

// Videos take a URL (the storage pipeline accepts PDFs
// only), while assignments / other files take a PDF. Swap
// the visible row, the required flags and the hidden kind
// field together so the form can never send a half-filled
// payload.
function syncResourceFormForCategory(category) {
    const kind = RESOURCE_KIND_BY_CATEGORY[category] || "VIDEO";

    const kindField = $("facultyUploadResourceKind");

    if (kindField) {
        kindField.value = kind;
    }

    const isVideo = kind === "VIDEO";

    $("facultyResourceUrlGroup")?.classList.toggle("hidden", !isVideo);
    $("facultyResourceFileGroup")?.classList.toggle("hidden", isVideo);

    const urlInput = $("facultyResourceUrl");
    const fileInput = $("facultyResourceFile");

    if (urlInput) {
        urlInput.required = isVideo;
    }

    if (fileInput) {
        fileInput.required = !isVideo;
    }

    // A URL typed for a video must not travel with a
    // later file-based upload (and vice versa).
    if (isVideo && fileInput) {
        fileInput.value = "";
    }

    if (!isVideo && urlInput) {
        urlInput.value = "";
    }

    const uploadButton = $("facultyUploadResourceBtn");

    if (uploadButton) {
        const icon = isVideo
            ? "fa-solid fa-link"
            : "fa-solid fa-cloud-arrow-up";
        const label = isVideo ? "Save video link" : "Upload";

        uploadButton.innerHTML =
            `<i class="${icon} mr-2"></i>${label}`;
    }
}

// =====================================================
// Edit content — optional uploadPdf() then
// PUT /api/faculty/notes/{id} | tnp-notes/{id} |
//                         pyqs/{id} | timetables/{id}
// =====================================================

// Only the fields of the active category are sent; blank
// optional fields become null so the backend keeps the
// current values (partial PUT in the services).
function buildEditPayload(category) {
    switch (category) {
        case "tnp":
            return {
                // The shared Subject input maps to "topic".
                topic: getValue("facultyEditSubject") || null,
                title: getValue("facultyEditTitle") || null,
                description: getValue("facultyEditDescription") || null
            };

        case "pyq":
            return {
                subject: getValue("facultyEditSubject") || null,
                title: getValue("facultyEditTitle") || null,
                course: getValue("facultyEditCourse") || null,
                branch: getValue("facultyEditBranch") || null,
                semester: getNumber("facultyEditSemester"),
                examYear: getNumber("facultyEditExamYear"),
                description: getValue("facultyEditDescription") || null
            };

        case "timetable":
            return {
                // Timetable records carry no description field.
                title: getValue("facultyEditTitle") || null,
                course: getValue("facultyEditCourse") || null,
                semester: getNumber("facultyEditSemester"),
                examYear: getNumber("facultyEditExamYear"),
                examType: getValue("facultyEditExamType") || null
            };

        default:
            return {
                title: getValue("facultyEditTitle") || null,
                subject: getValue("facultyEditSubject") || null,
                description: getValue("facultyEditDescription") || null
            };
    }
}

async function handleEditSubmit(event) {
    event.preventDefault();

    const contentId = $("facultyEditNoteId")?.value;

    if (!contentId) {
        return;
    }

    const category = $("facultyEditCategory")?.value || "notes";
    const label = CATEGORY_LABELS[category] || CATEGORY_LABELS.notes;
    const endpointBuilder = EDIT_ENDPOINTS[category] || EDIT_ENDPOINTS.notes;

    const button = $("saveFacultyEditBtn");

    const file = getFile("facultyEditFile");

    if (button) {
        button.disabled = true;
    }

    if (file) {
        facultyMessage(
            "facultyEditMessage",
            "Uploading PDF to Cloudinary…",
            "success",
            0
        );
    } else {
        facultyMessage(
            "facultyEditMessage",
            "Saving changes…",
            "success",
            0
        );
    }

    try {
        const payload = buildEditPayload(category);

        // Notes / TNP carry an optional ordered video list.
        // Skip it when the form could not load the stored links.
        if (category === "notes" || category === "tnp") {
            const videoManager = $("facultyEditGroupVideos");

            if (videoManager?.dataset.videoUnavailable !== "true") {
                payload.videos = collectVideos(videoManager);
            }
        }

        if (file) {
            const uploaded = await uploadPdf(
                file,
                CONTENT_FOLDERS[category] || PDF_FOLDER
            );

            const fileUrl = uploaded?.file_url || null;

            if (!fileUrl) {
                throw new Error(
                    "Upload succeeded, but no file URL was returned."
                );
            }

            payload.fileUrl = fileUrl;
            payload.storagePath =
                uploaded?.cloudinary_public_id || "";

            // Timetable records also keep the original file name.
            if (category === "timetable") {
                payload.fileName = file.name;
            }
        }

        await apiPut(endpointBuilder(contentId), payload);

        closeEditModal();

        facultyMessage(
            "facultyManageMessage",
            `${label} updated successfully.`
        );

        await reloadFacultyContent(category);
        dispatchRefresh();
    } catch (error) {
        console.error(`Faculty ${label} edit error:`, error);

        facultyMessage(
            "facultyEditMessage",
            errorMessage(
                error,
                `Could not update the ${label.toLowerCase()}.`
            ),
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

// =====================================================
// Sidebar-hash tab switching
// =====================================================
//
// The shared sidebar links to ./faculty.html#dashboard |
// #courses | #content | … - short hashes that match no
// element id, so the browser's native anchor jump is a no-op.
// Map each hash to the matching tab (the tab engine is the
// same one admin.html uses) and, for the legacy section
// hashes kept alive from the first workspace layout, scroll
// to the section inside that tab.
// =====================================================

const FACULTY_TAB_BY_HASH = {
    // Canonical hashes (sidebar + header dropdown links).
    dashboard: "dashboard",
    courses: "courses",
    content: "content",
    syllabus: "syllabus",
    notifications: "notifications",
    certificates: "certificates",
    feedback: "feedback",
    users: "users",
    profile: "profile",
    // Legacy section hashes from the pre-tab layout.
    course: "courses",
    launch: "courses",
    upload: "content",
    manage: "content"
};

// Legacy hashes keep their finer-grained landing spot.
const FACULTY_SCROLL_TARGET_BY_HASH = {
    course: "facultyCourseSection",
    launch: "facultyLaunchSection",
    upload: "facultyUploadSection",
    manage: "facultyManageSection"
};

// Sidebar entry that mirrors each tab (the Profile tab is
// reached through the header dropdown, so it maps to none).
const FACULTY_NAV_ID_BY_TAB = {
    dashboard: "facultyDashboardNavBtn",
    courses: "facultyCourseNavBtn",
    content: "facultyUploadNavBtn",
    syllabus: "facultySyllabusNavBtn",
    notifications: "facultyNotificationsNavBtn",
    certificates: "facultyCertificatesNavBtn",
    feedback: "facultyFeedbackNavBtn",
    users: "facultyUsersNavBtn"
};

function markFacultyNavLink(tab) {
    const navId = FACULTY_NAV_ID_BY_TAB[tab];

    if (!navId) {
        return;
    }

    // Same scope layout.js uses in markActiveNav(), so the
    // highlight can never disagree with the page-level one.
    document
        .querySelectorAll("#sidebar .nav-item")
        .forEach(item => {
            item.classList.remove("active");
        });

    $(navId)?.classList.add("active");
}

function scrollToFacultyHash() {
    const hash = String(window.location.hash || "").replace(/^#/, "");

    if (!hash) {
        return;
    }

    const tab = FACULTY_TAB_BY_HASH[hash];

    if (!tab) {
        return;
    }

    // The horizontal tab bar is gone - the sidebar (plus the
    // header profile menu) is the only navigation. Switch the
    // panels through the shared engine instead of clicking a
    // tab button that no longer exists.
    activateAdminPanel(tab);

    markFacultyNavLink(tab);

    const sectionId = FACULTY_SCROLL_TARGET_BY_HASH[hash];
    const target = sectionId
        ? $(sectionId)
        : $("facultyPanel");

    // "instant" (not "smooth"): the stylesheet sets a global
    // scroll-behavior:smooth, and layering a JS-smooth scroll on top
    // of it makes long jumps stall and land late.
    target?.scrollIntoView({
        behavior: "instant",
        block: "start"
    });
}

// =====================================================
// Events (wired once, null-guarded like other modules)
// =====================================================

// Manage Content pill classes (active = blue bg, white text).
const MANAGE_PILL_ACTIVE_CLASSES = [
    "bg-blue-600",
    "text-white",
    "border-blue-600"
];

const MANAGE_PILL_INACTIVE_CLASSES = [
    "bg-white",
    "text-slate-600",
    "border-slate-200",
    "hover:bg-slate-50"
];

function updateManageCategoryPills() {
    const pills = $("facultyManageSection")?.querySelectorAll(
        "[data-faculty-manage-category]"
    ) || [];

    pills.forEach(pill => {
        const isActive = pill.dataset.facultyManageCategory
            === activeManageCategory;

        MANAGE_PILL_ACTIVE_CLASSES.forEach(
            className => pill.classList.toggle(className, isActive)
        );

        MANAGE_PILL_INACTIVE_CLASSES.forEach(
            className => pill.classList.toggle(className, !isActive)
        );
    });
}

function handleManageCategoryClick(event) {
    const pill = event.target.closest(
        "[data-faculty-manage-category]"
    );

    if (!pill) {
        return;
    }

    const category = pill.dataset.facultyManageCategory;

    if (!category) {
        return;
    }

    activeManageCategory = category;

    updateManageCategoryPills();

    // Errors from the category we just left must not linger.
    facultyMessage("facultyManageMessage", "");

    renderActiveManageCategory();
}

// Edit buttons live inside every card flavour rendered into
// #facultyNotesList — resolve the id against the active
// category and open the shared modal.
function handleContentListClick(event) {
    const button = event.target.closest(".faculty-edit-btn");

    if (!button) {
        return;
    }

    const item = findContentItem(
        activeManageCategory,
        button.dataset.noteId
    );

    if (!item) {
        return;
    }

    openEditModal(activeManageCategory, item);
}

// "View content", "Edit" and "Publish/Unpublish" buttons all
// live in the course cards rendered into #facultyCoursesList
// (My Courses section).
function handleCourseListClick(event) {
    const editButton = event.target.closest(
        "[data-faculty-edit-course]"
    );

    if (editButton) {
        startCourseEdit(editButton.dataset.facultyEditCourse);
        return;
    }

    const toggleButton = event.target.closest(
        "[data-faculty-toggle-course]"
    );

    if (toggleButton) {
        toggleCourseActive(
            toggleButton.dataset.facultyToggleCourse
        );
        return;
    }

    const button = event.target.closest(
        "[data-faculty-open-course]"
    );

    if (!button) {
        return;
    }

    const courseId = button.dataset.facultyOpenCourse;

    if (!courseId) {
        return;
    }

    openCourseContent(courseId);
}

// =====================================================
// Course editing (My Courses)
// =====================================================
//
// Editing reuses the Launch Course form: "Edit" prefills it
// and switches the submit into PUT /api/faculty/courses/{id}
// mode; "Cancel edit" (or a fresh submit) returns it to
// POST /api/faculty/courses create mode.
// =====================================================

function findCourse(courseId) {
    const wanted = String(courseId ?? "");

    return facultyCourses.find(
        course => String(course.id) === wanted
    ) || null;
}

// The submit button doubles as "Launch Course" /
// "Save Changes"; its label always follows the mode.
function setLaunchFormMode(course) {
    const form = $("launchCourseForm");
    const submitButton = form?.querySelector('button[type="submit"]');
    const cancelButton = $("cancelCourseEditBtn");
    const heading = $("facultyLaunchHeading");

    if (course) {
        if (submitButton) {
            submitButton.innerHTML =
                '<i class="fa-solid fa-check mr-2"></i>Save Changes';
        }

        cancelButton?.classList.remove("hidden");

        if (heading) {
            heading.textContent = "Edit Course";
        }
    } else {
        if (submitButton) {
            submitButton.innerHTML =
                '<i class="fa-solid fa-rocket mr-2"></i>Launch Course';
        }

        cancelButton?.classList.add("hidden");

        if (heading) {
            heading.textContent = "Launch Course";
        }
    }
}

function startCourseEdit(courseId) {
    const course = findCourse(courseId);

    if (!course) {
        return;
    }

    editingCourseId = course.id;

    // Prefill every field the form owns; untouched fields
    // (thumbnail, slug, sort order) are simply not sent on
    // update, so the backend keeps their current values.
    setValue("launchCourseTitle", course.title);
    setValue("launchCourseCode", course.code);
    setValue("launchCourseCategory", course.category);
    setValue("launchCourseDescription", course.description);
    setValue("launchCoursePrice", course.price_inr);
    setValue("launchCourseMrp", course.mrp_inr);
    setValue("launchCourseValidity", course.validity_days);
    setValue(
        "launchCourseHighlights",
        Array.isArray(course.highlights)
            ? course.highlights.join("\n")
            : ""
    );

    setLaunchFormMode(course);

    facultyMessage(
        "launchCourseMessage",
        `Editing “${course.title || "Untitled course"}” — submit to save your changes.`,
        "success",
        0
    );

    // The form sits under the course list in the same panel;
    // bring it into view so the edit context is obvious.
    $("facultyLaunchSection")?.scrollIntoView({
        behavior: "instant",
        block: "start"
    });
}

function cancelCourseEdit() {
    editingCourseId = null;

    $("launchCourseForm")?.reset();
    setLaunchFormMode(null);

    facultyMessage("launchCourseMessage", "");
}

// Publish / unpublish sends the course's current data back
// with active flipped. Fields the form cannot represent are
// either sent as-is (mrp) or omitted (nulls leave the stored
// value untouched on the backend).
async function toggleCourseActive(courseId) {
    const course = findCourse(courseId);

    if (!course) {
        return;
    }

    const nextActive = !course.is_active;

    const payload = {
        title: course.title || "Untitled course",
        code: course.code || null,
        category: course.category || null,
        description: course.description || null,
        priceInr: Number(course.price_inr) || 0,
        // Always applied server-side: send the current value
        // so the existing discount survives the toggle.
        mrpInr: course.mrp_inr,
        validityDays: Number(course.validity_days) || 365,
        highlights: Array.isArray(course.highlights)
            && course.highlights.length
            ? course.highlights
            : null,
        active: nextActive
    };

    try {
        await apiPut(
            `/api/faculty/courses/${encodeURIComponent(String(course.id))}`,
            payload
        );

        facultyMessage(
            "facultyCourseMessage",
            nextActive
                ? "Course published — it is live now."
                : "Course unpublished — students can no longer buy it."
        );

        await loadFacultyCourses();
        dispatchRefresh();
    } catch (error) {
        console.error("Faculty course update error:", error);

        facultyMessage(
            "facultyCourseMessage",
            errorMessage(error, "Could not update the course."),
            "error"
        );
    }
}

// Guarded one-shot reload behind a panel's Refresh button:
// clears the old message, then reports the outcome in the
// same element the loaders use.
async function refreshCollection(load, messageElementId, label) {
    facultyMessage(messageElementId, "");

    try {
        await load();

        facultyMessage(
            messageElementId,
            `${label.charAt(0).toUpperCase() + label.slice(1)} refreshed.`
        );
    } catch (error) {
        console.error(`Faculty ${label} refresh error:`, error);

        facultyMessage(
            messageElementId,
            errorMessage(error, `Could not load your ${label}.`),
            "error"
        );
    }
}

export function setupFacultyEvents() {
    if (eventsWired) {
        return;
    }

    eventsWired = true;

    // The header profile menu is wired by initHeaderProfileMenu()
    // (app.js) for every page, not just this one.

    $("launchCourseForm")?.addEventListener(
        "submit",
        handleLaunchCourse
    );

    // Edit mode leaves via its own button (submit always saves).
    $("cancelCourseEditBtn")?.addEventListener(
        "click",
        cancelCourseEdit
    );

    // ---- Upload (one form per category) ----
    $("uploadNoteForm")?.addEventListener(
        "submit",
        handleUploadNote
    );

    $("facultyUploadCategory")?.addEventListener(
        "change",
        updateFacultyUploadCategoryPanel
    );

    $("facultyUploadTnpForm")?.addEventListener(
        "submit",
        handleUploadTnp
    );

    $("facultyUploadPyqForm")?.addEventListener(
        "submit",
        handleUploadPyq
    );

    $("facultyUploadTimetableForm")?.addEventListener(
        "submit",
        handleUploadTimetable
    );

    // One shared form for videos / assignments / other files.
    $("facultyUploadResourceForm")?.addEventListener(
        "submit",
        handleUploadResource
    );

    // ---- Manage Content (category pills) ----
    $("facultyManageSection")?.addEventListener(
        "click",
        handleManageCategoryClick
    );

    // ---- Edit modal (one modal, four categories) ----
    $("facultyEditForm")?.addEventListener(
        "submit",
        handleEditSubmit
    );

    $("closeFacultyEditBtn")?.addEventListener(
        "click",
        closeEditModal
    );

    $("cancelFacultyEditBtn")?.addEventListener(
        "click",
        closeEditModal
    );

    $("facultyNotesList")?.addEventListener(
        "click",
        handleContentListClick
    );

    // ---- Course content viewer (read-only modal) ----
    $("facultyCoursesList")?.addEventListener(
        "click",
        handleCourseListClick
    );

    $("facultyCourseContentClose")?.addEventListener(
        "click",
        closeCourseContentModal
    );

    // Click on the dimmed backdrop closes the viewer.
    $("facultyCourseContentModal")?.addEventListener(
        "click",
        event => {
            if (event.target === event.currentTarget) {
                closeCourseContentModal();
            }
        }
    );

    // ---- Notifications panel ----
    $("facultyNotificationForm")?.addEventListener(
        "submit",
        handleSendNotification
    );

    $("refreshFacultyNotificationsBtn")?.addEventListener(
        "click",
        () => refreshCollection(
            loadSentNotifications,
            "facultyNotificationMessage",
            "notifications"
        )
    );

    // ---- Refresh buttons on the other panels ----
    $("refreshFacultyStudentsBtn")?.addEventListener(
        "click",
        () => refreshCollection(
            loadFacultyStudents,
            "facultyStudentsMessage",
            "users"
        )
    );

    $("refreshFacultyCertificatesBtn")?.addEventListener(
        "click",
        () => refreshCollection(
            loadFacultyCertificates,
            "facultyCertificatesMessage",
            "certificates"
        )
    );

    $("refreshFacultyFeedbackBtn")?.addEventListener(
        "click",
        () => refreshCollection(
            loadFacultyFeedback,
            "facultyFeedbackMessage",
            "feedback"
        )
    );

    // ---- Profile panel ----
    $("facultyProfileForm")?.addEventListener(
        "submit",
        handleProfileSave
    );

    $("facultyProfileEditBtn")?.addEventListener(
        "click",
        () => setProfileEditing(true)
    );

    // The shared change-password modal (Profile button +
    // header dropdown) is wired for every page by
    // initChangePasswordModal() in app.js.

    // Sidebar hashes (#course, #launch, …) never match an
    // element id, so the native anchor jump never fires while
    // already on faculty.html - scroll to the section by hand.
    window.addEventListener(
        "hashchange",
        scrollToFacultyHash
    );

    // Click on the dimmed backdrop closes the modal.
    $("facultyEditModal")?.addEventListener(
        "click",
        event => {
            if (event.target === event.currentTarget) {
                closeEditModal();
            }
        }
    );

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        // The viewer sits above the edit modal, so it gets
        // first refusal on the Escape key.
        const contentModal = $("facultyCourseContentModal");

        if (contentModal && !contentModal.classList.contains("hidden")) {
            closeCourseContentModal();
            return;
        }

        // (The shared change-password modal is closed by its
        // own Escape listener from initChangePasswordModal().)

        const modal = $("facultyEditModal");

        if (modal && !modal.classList.contains("hidden")) {
            closeEditModal();
        }
    });
}

// =====================================================
// Entry point (called from app.js on protected pages)
// =====================================================

export async function initFaculty() {
    // Every other page keeps its own DOM untouched.
    if (document.body?.dataset?.page !== "faculty") {
        return;
    }

    // The header profile menu (render + wire) already ran via
    // initHeaderProfileMenu() in app.js - one owner, every page.
    renderWelcome();
    setupFacultyEvents();

    // Sync the upload panels with the category selector
    // (the markup already defaults to notes).
    updateFacultyUploadCategoryPanel();

    // Light guard: data only loads for the faculty role
    // (applyRoleUI already redirects everyone else away).
    if (!isFacultyUser()) {
        return;
    }

    try {
        await loadFacultyCourses();
    } catch (error) {
        console.error("Faculty courses loading error:", error);

        facultyMessage(
            "facultyCourseMessage",
            errorMessage(error, "Could not load your courses."),
            "error"
        );
    }

    // Every remaining panel loads up front so its tab switches
    // instantly; each loader is guarded on its own so one bad
    // endpoint cannot blank the rest of the page. The message
    // element matches the panel the loader renders.
    const panelLoaders = [
        {
            label: "dashboard stats",
            message: "facultyDashboardMessage",
            load: loadFacultyStats
        },
        {
            label: "users",
            message: "facultyStudentsMessage",
            load: loadFacultyStudents
        },
        {
            label: "notifications",
            message: "facultyNotificationMessage",
            load: loadSentNotifications
        },
        {
            label: "certificates",
            message: "facultyCertificatesMessage",
            load: loadFacultyCertificates
        },
        {
            label: "feedback",
            message: "facultyFeedbackMessage",
            load: loadFacultyFeedback
        },
        {
            label: "profile",
            message: "facultyProfileMessage",
            load: loadFacultyProfile
        },
        // The content collections back the Manage Content
        // pills (and the course content viewer).
        {
            label: "notes",
            message: "facultyManageMessage",
            load: loadFacultyNotes
        },
        {
            label: "TNP resources",
            message: "facultyManageMessage",
            load: loadFacultyTnp
        },
        {
            label: "previous year papers",
            message: "facultyManageMessage",
            load: loadFacultyPyqs
        },
        {
            label: "exam timetables",
            message: "facultyManageMessage",
            load: loadFacultyTimetables
        },
        {
            label: "videos, assignments & files",
            message: "facultyManageMessage",
            load: loadFacultyResources
        }
    ];

    await Promise.all(panelLoaders.map(async ({ label, message, load }) => {
        try {
            await load();
        } catch (error) {
            console.error(`Faculty ${label} loading error:`, error);

            facultyMessage(
                message,
                errorMessage(error, `Could not load your ${label}.`),
                "error"
            );
        }
    }));

    // Deep link from the sidebar (./faculty.html#users …):
    // wait until every panel exists so the tab switch and the
    // jump land correctly.
    scrollToFacultyHash();
}
