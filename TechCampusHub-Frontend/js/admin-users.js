// =====================================================
// TechCampus_Hub
// admin-users.js
//
// Admin panel → Users: every registered account (students,
// faculty, admins) with their role, purchase status and premium
// validity.
//
// Admin panel → Manage Faculty: the same listing filtered down
// to faculty accounts so their registration can be approved,
// rejected or deleted.
// =====================================================

import { reloadStudents } from "./data.js";
import {
    loadAllPurchases,
    purchaseExpired,
    formatExpiryDateTime
} from "./courses.js";
import { $, escapeHtml, updateNoticeBox } from "./helpers.js";
import {
    setUserEnabled,
    setUserRegistrationStatus,
    adminDeleteUser,
    getStoredUser
} from "./api.js";

// =====================================================
// Shared user listing (one GET feeds both panels)
// =====================================================
//
// The Users tab and the Manage Faculty tab render the exact
// same GET /api/admin/users payload, so every refresh fetches
// once and repaints both lists.
// =====================================================

let userRows = [];

async function loadUserRows() {
    try {
        userRows = await reloadStudents();
    } catch (error) {
        console.error("Users loading error:", error);
        userRows = [];
    }

    return userRows;
}

// =====================================================
// Registration moderation pill (shared by both lists)
// =====================================================

function registrationStatusPill(status) {
    const normalized = String(status || "APPROVED").toUpperCase();

    if (normalized === "PENDING") {
        return `
            <span class="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                Pending approval
            </span>
        `;
    }

    if (normalized === "REJECTED") {
        return `
            <span class="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
                Rejected
            </span>
        `;
    }

    return `
        <span class="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
            Approved
        </span>
    `;
}

// =====================================================
// Welcome header (admin.html hero card)
// =====================================================

function renderAdminWelcome() {
    const target = $("adminWelcomeName");

    if (!target) {
        return;
    }

    const user = getStoredUser() || null;
    const name = String(user?.name || "").trim();

    target.textContent = name || "Admin!";
}

// =====================================================
// Rendering
// =====================================================

export async function renderAdminUsers() {
    const list = $("adminUsersList");

    if (!list) {
        return;
    }

    list.innerHTML = `
        <p class="text-sm text-slate-500">Loading users…</p>
    `;

    const students = await loadUserRows();

    // One fetch feeds both panels: the Manage Faculty tab reads
    // the very same listing.
    await renderFacultyList(students);

    const { rows: purchases } = await loadAllPurchases();

    if (!students.length) {
        list.innerHTML = `
            <p class="text-sm text-slate-500">
                No students found (register an account to see it here).
            </p>
        `;
        return;
    }

    const me = getStoredUser();

    list.innerHTML = students.map(student => {
        const mine = purchases.filter(row =>
            String(row.user_id || "").toLowerCase() ===
                String(student.id || "").toLowerCase()
            ||
            (
                row.user_email &&
                student.email &&
                row.user_email.toLowerCase() ===
                    student.email.toLowerCase()
            )
        );

        const active = mine.filter(
            row => row.status === "approved" && !purchaseExpired(row)
        );
        const expired = mine.filter(
            row => row.status === "approved" && purchaseExpired(row)
        );
        const pending = mine.filter(row => row.status === "pending");

        const suspended = student.enabled === false;
        const isSelf = me && String(me.id) === String(student.id);

        let accessBadge = `
            <span class="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                Free user
            </span>
        `;

        let validityLine = "";

        if (active.length) {
            accessBadge = `
                <span class="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    Premium
                </span>
            `;

            const latest = active
                .map(row => row.expires_at)
                .filter(Boolean)
                .sort()
                .pop();

            // An approved purchase with no expiry is lifetime access,
            // matching the student-facing labels and the backend's
            // active-purchase queries (validUntil is null).
            validityLine = latest
                ? `Valid until ${formatExpiryDateTime(latest)}`
                : "Lifetime Access";
        } else if (expired.length) {
            accessBadge = `
                <span class="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
                    Expired
                </span>
            `;
        }

        const suspendedBadge = suspended
            ? `
                <span class="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
                    Suspended
                </span>
            `
            : "";

        const roleBadge = student.role === "admin"
            ? `
                <span class="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                    Admin
                </span>
            `
            : student.role === "faculty"
                ? `
                    <span class="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
                        Faculty
                    </span>
                `
                : "";

        // Faculty sign-up declaration — shown for faculty accounts only.
        const declarationBadge = student.role === "faculty"
            ? student.declaration_accepted
                ? `
                    <span class="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Declaration ✓
                    </span>
                `
                : `
                    <span class="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        Declaration missing
                    </span>
                `
            : "";

        // Registration moderation state (pending/approved/rejected)
        // — faculty accounts only, sitting next to the badges above.
        const registrationBadge = student.role === "faculty"
            ? registrationStatusPill(student.registration_status)
            : "";

        const details = [
            student.course,
            student.branch,
            student.year ? `Year ${student.year}` : "",
            student.semester ? `Sem ${student.semester}` : ""
        ].filter(Boolean).join(" · ");

        // Suspension keeps the data but blocks the login; the signed-in admin
        // cannot suspend themselves (the backend refuses it too).
        const toggleBtn = isSelf
            ? ""
            : suspended
                ? `
                    <button type="button"
                        class="restore-user-btn rounded-lg bg-emerald-50
                               px-2.5 py-1 text-xs font-bold text-emerald-700
                               hover:bg-emerald-100 transition"
                        data-user-id="${escapeHtml(String(student.id))}"
                        data-user-name="${escapeHtml(student.name || student.email || "this user")}">
                        Restore
                    </button>
                `
                : `
                    <button type="button"
                        class="suspend-user-btn rounded-lg bg-amber-50
                               px-2.5 py-1 text-xs font-bold text-amber-700
                               hover:bg-amber-100 transition"
                        data-user-id="${escapeHtml(String(student.id))}"
                        data-user-name="${escapeHtml(student.name || student.email || "this user")}">
                        Remove
                    </button>
                `;

        const deleteBtn = isSelf
            ? ""
            : `
                <button type="button"
                    class="delete-user-btn rounded-lg bg-red-50
                           px-2.5 py-1 text-xs font-bold text-red-600
                           hover:bg-red-100 transition"
                    data-user-id="${escapeHtml(String(student.id))}"
                    data-user-name="${escapeHtml(student.name || student.email || "this user")}">
                    Delete
                </button>
            `;

        return `
            <div class="border rounded-xl p-4 flex flex-wrap items-center gap-4 justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 shrink-0 rounded-full bg-blue-100 text-blue-700
                                flex items-center justify-center">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div class="min-w-0">
                        <p class="font-bold text-slate-800 break-words">
                            ${escapeHtml(student.name || "Student")}
                        </p>
                        ${roleBadge || declarationBadge || registrationBadge || suspendedBadge
                            ? `<div class="mt-1 flex flex-wrap items-center gap-2">
                                   ${roleBadge}
                                   ${declarationBadge}
                                   ${registrationBadge}
                                   ${suspendedBadge}
                               </div>`
                            : ""}
                        <p class="text-sm text-slate-500 break-words">
                            ${escapeHtml(student.email || "")}
                        </p>
                        ${details
                            ? `<p class="text-xs text-slate-400 break-words">${escapeHtml(details)}</p>`
                            : ""}
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1 max-w-full">
                    <div class="flex flex-wrap items-center justify-end gap-2">
                        ${pending.length
                            ? `<span class="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                                   ${pending.length} pending
                               </span>`
                            : ""}
                        ${accessBadge}
                    </div>
                    ${validityLine
                        ? `<p class="text-xs text-slate-400 text-right">${escapeHtml(validityLine)}</p>`
                        : ""}
                    <div class="flex flex-wrap items-center justify-end gap-2 mt-1">
                        ${toggleBtn}
                        ${deleteBtn}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// =====================================================
// Manage Faculty (same listing, filtered to faculty)
// =====================================================
//
// Every row carries a moderation status pill plus Approve /
// Reject / Delete. Suspend/Restore stays exclusive to the Users
// tab — approving an account is what unblocks its login.
// =====================================================

function facultyEmptyStateHtml(iconClass, message) {
    return `
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
    `;
}

// "Manage Faculty (2)" while sign-ups are waiting for review.
function updateFacultyTabBadge(faculty) {
    const label = $("facultyTabLabel");

    if (!label) {
        return;
    }

    const pending = faculty.filter(
        member =>
            String(member.registration_status).toUpperCase() === "PENDING"
    ).length;

    label.innerHTML = pending
        ? `Manage Faculty
           <span class="rounded-lg bg-amber-100 px-2 py-0.5
                        text-xs font-extrabold text-amber-700">${pending}</span>`
        : "Manage Faculty";
}

export async function renderFacultyList(rows) {
    const list = $("adminFacultyList");

    if (!list) {
        return;
    }

    // renderAdminUsers() hands over the rows it just fetched;
    // a standalone refresh pulls the listing itself.
    const members = rows || await loadUserRows();
    const faculty = members.filter(
        member => member.role === "faculty"
    );

    updateFacultyTabBadge(faculty);

    if (!faculty.length) {
        list.innerHTML = facultyEmptyStateHtml(
            "fa-chalkboard-user",
            "No faculty accounts yet - faculty sign-ups will appear here for approval."
        );
        return;
    }

    const me = getStoredUser();

    list.innerHTML = faculty.map(member => {
        const status = String(
            member.registration_status || "APPROVED"
        ).toUpperCase();

        const isSelf = me && String(me.id) === String(member.id);

        // Approve disappears once approved, Reject once rejected.
        const approveBtn = status === "APPROVED"
            ? ""
            : `
                <button type="button"
                    class="approve-faculty-btn rounded-lg bg-emerald-50
                           px-2.5 py-1 text-xs font-bold text-emerald-700
                           hover:bg-emerald-100 transition"
                    data-user-id="${escapeHtml(String(member.id))}"
                    data-user-name="${escapeHtml(member.name || member.email || "this faculty member")}">
                    Approve
                </button>
            `;

        const rejectBtn = status === "REJECTED"
            ? ""
            : `
                <button type="button"
                    class="reject-faculty-btn rounded-lg bg-amber-50
                           px-2.5 py-1 text-xs font-bold text-amber-700
                           hover:bg-amber-100 transition"
                    data-user-id="${escapeHtml(String(member.id))}"
                    data-user-name="${escapeHtml(member.name || member.email || "this faculty member")}">
                    Reject
                </button>
            `;

        // Same confirm + API flow as the Users tab (shared class
        // and delegated handler); an admin never deletes itself.
        const deleteBtn = isSelf
            ? ""
            : `
                <button type="button"
                    class="delete-user-btn rounded-lg bg-red-50
                           px-2.5 py-1 text-xs font-bold text-red-600
                           hover:bg-red-100 transition"
                    data-user-id="${escapeHtml(String(member.id))}"
                    data-user-name="${escapeHtml(member.name || member.email || "this faculty member")}">
                    Delete
                </button>
            `;

        const declarationBadge = member.declaration_accepted
            ? `
                <span class="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    Declaration ✓
                </span>
            `
            : `
                <span class="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                    Declaration missing
                </span>
            `;

        return `
            <div class="border rounded-xl p-4 flex flex-wrap items-center gap-4 justify-between">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-10 h-10 shrink-0 rounded-full bg-blue-100 text-blue-700
                                flex items-center justify-center">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div class="min-w-0">
                        <p class="font-bold text-slate-800 break-words">
                            ${escapeHtml(member.name || "Faculty")}
                        </p>
                        <div class="mt-1 flex flex-wrap items-center gap-2">
                            ${registrationStatusPill(status)}
                            ${declarationBadge}
                        </div>
                        <p class="text-sm text-slate-500 break-words">
                            ${escapeHtml(member.email || "")}
                        </p>
                        ${member.phone
                            ? `<p class="text-xs text-slate-400 break-words">${escapeHtml(member.phone)}</p>`
                            : ""}
                    </div>
                </div>
                <div class="flex flex-wrap items-center justify-end gap-2 max-w-full">
                    ${approveBtn}
                    ${rejectBtn}
                    ${deleteBtn}
                </div>
            </div>
        `;
    }).join("");
}

// =====================================================
// Actions: suspend / restore / permanently delete
// =====================================================

function usersMessage(text, type = "info") {
    updateNoticeBox("adminUsersMessage", text, type, {
        baseClasses: "text-sm min-h-5 mb-3 px-3 py-2 rounded-xl"
    });
}

// Same styling, but for the Manage Faculty panel message line
// (the backend's own copy — "Faculty member approved" /
// "Faculty application rejected" — is echoed here).
function facultyMessage(text, type = "info") {
    updateNoticeBox("facultyAdminMessage", text, type, {
        baseClasses: "text-sm min-h-5 mb-3 px-3 py-2 rounded-xl"
    });
}

// Re-fetch the shared listing once and repaint whichever panels
// exist (renderAdminUsers() also repaints the faculty list).
async function refreshUserPanels() {
    if ($("adminUsersList")) {
        await renderAdminUsers();
        return;
    }

    await renderFacultyList();
}

// Freeze every row button while a request is in flight; the
// re-render afterwards brings them back enabled.
function setFacultyButtonsDisabled(disabled) {
    const list = $("adminFacultyList");

    if (!list) {
        return;
    }

    list.querySelectorAll("button").forEach(button => {
        button.disabled = disabled;
    });
}

async function handleUsersAction(event) {
    const button = event.target.closest(
        ".suspend-user-btn, .restore-user-btn, .delete-user-btn"
    );

    if (!button) {
        return;
    }

    const userId = button.dataset.userId;
    const name = button.dataset.userName || "this user";
    const isDelete = button.classList.contains("delete-user-btn");
    const isRestore = button.classList.contains("restore-user-btn");

    // Deletes can also be triggered from the Manage Faculty list,
    // which owns the message line shown to the admin.
    const notify = button.closest("#adminFacultyList")
        ? facultyMessage
        : usersMessage;

    // Confirmation dialog before either action.
    const confirmed = isDelete
        ? window.confirm(
            `Permanently delete ${name}'s account?\n\n` +
            "All of their data — profile, purchases, favorites and " +
            "reviews — will be removed. This cannot be undone."
        )
        : window.confirm(
            isRestore
                ? `Restore ${name}'s account? They will be able to log in again.`
                : `Remove ${name}?\n\n` +
                  "Their account will be suspended (they cannot log in) " +
                  "until you restore it. All data is kept."
        );

    if (!confirmed) {
        return;
    }

    button.disabled = true;

    try {
        if (isDelete) {
            await adminDeleteUser(userId);
            notify(`${name}'s account was permanently deleted.`, "success");
        } else {
            await setUserEnabled(userId, isRestore);
            notify(
                isRestore
                    ? `${name}'s account was restored.`
                    : `${name} was removed (suspended).`,
                "success"
            );
        }

        await refreshUserPanels();
    } catch (error) {
        console.error("User management error:", error);
        notify(
            error.message || "The action could not be completed.",
            "error"
        );
        button.disabled = false;
    }
}

// =====================================================
// Actions: approve / reject a faculty registration
// =====================================================

async function handleFacultyAction(event) {
    const button = event.target.closest(
        ".approve-faculty-btn, .reject-faculty-btn"
    );

    if (!button) {
        // Anything else in this list (Delete) goes through the
        // shared Users-panel confirm + API flow, which reports
        // back through this panel's message line.
        handleUsersAction(event);
        return;
    }

    const approve = button.classList.contains("approve-faculty-btn");
    const userId = button.dataset.userId;
    const name = button.dataset.userName || "this faculty member";

    const confirmed = window.confirm(
        approve
            ? `Approve ${name}'s faculty registration?\n\n` +
              "They will be able to log in immediately."
            : `Reject ${name}'s faculty application?\n\n` +
              "They cannot log in and any existing session is revoked."
    );

    if (!confirmed) {
        return;
    }

    setFacultyButtonsDisabled(true);

    try {
        const envelope = await setUserRegistrationStatus(
            userId,
            approve ? "APPROVED" : "REJECTED"
        );

        facultyMessage(
            envelope?.message ||
                (approve
                    ? "Faculty member approved"
                    : "Faculty application rejected"),
            "success"
        );

        await refreshUserPanels();
    } catch (error) {
        console.error("Faculty moderation error:", error);

        facultyMessage(
            error.message || "The action could not be completed.",
            "error"
        );

        setFacultyButtonsDisabled(false);
    }
}

// =====================================================
// Wiring (called from events.js setupEvents)
// =====================================================

export function setupFacultyModeration() {
    if (!$("adminFacultyList")) {
        return;
    }

    // Delegated: the row buttons are re-rendered after every
    // action (Delete is forwarded to handleUsersAction there).
    $("adminFacultyList")?.addEventListener("click", handleFacultyAction);
}

export function setupAdminUsers() {
    if (!$("adminUsersList")) {
        return;
    }

    // Hero card above the panel: the signed-in admin's name.
    renderAdminWelcome();

    renderAdminUsers().catch(error => {
        console.error("Admin users render error:", error);
    });

    $("refreshUsersBtn")?.addEventListener("click", () => {
        renderAdminUsers().catch(error => {
            console.error("Admin users refresh error:", error);
        });
    });

    // Delegated: the row buttons are re-rendered after every action.
    $("adminUsersList")?.addEventListener("click", handleUsersAction);

    // Manage Faculty tab: approve / reject / delete.
    setupFacultyModeration();
}
