// =====================================================
// TechCampus_Hub
// syllabus.js
//
// Syllabus module - three surfaces share this file:
//
//   1. syllabus.html        students browse the syllabus of
//                           their program + semester.
//   2. admin.html           Syllabus Management tab.
//   3. faculty.html         Syllabus panel for the courses
//                           the signed-in faculty member owns.
//
// PDFs are never linked directly. Every "View" button is a
// data-pdf-open trigger, so the bytes stream through the
// authenticated /api/content/syllabus/{id}/pdf relay and
// open in the same secure viewer as Notes. Students only
// ever receive a payload without fileUrl/storagePath.
//
// One active syllabus may exist per program + semester.
// Uploading a replacement asks for confirmation first and
// then sends replaceExisting=true; the backend marks the
// previous row Inactive instead of deleting it.
// =====================================================

import { $, escapeHtml, formatDate, showTimedMessage } from "./helpers.js";

import {
    apiGet,
    getStoredUser,
    getSyllabus,
    getAdminSyllabus,
    getFacultySyllabus,
    createSyllabus,
    updateSyllabus,
    deleteSyllabus,
    createFacultySyllabus,
    updateFacultySyllabus,
    deleteFacultySyllabus,
    normalizeSyllabus,
    normalizeCourse
} from "./api.js";

import { uploadPdf } from "./storage.js";

import { courseStructure } from "./config.js";

import { populateBundleSelect } from "./courses.js";

// =====================================================
// Constants
// =====================================================

// Programs the portal publishes syllabus for, in the
// order the student page shows them.
const PROGRAMS = ["BCA", "MCA", "B.Tech"];

const ROMAN = [
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII"
];

const STATUS_ACTIVE = "Active";
const STATUS_INACTIVE = "Inactive";

const MESSAGE_TIMERS = {};

// =====================================================
// Entry point (called from app.js)
// =====================================================

export async function initSyllabus() {
    if (document.body?.dataset?.page === "syllabus") {
        await initStudentPage();
        return;
    }

    if ($("syllabusAdminForm")) {
        await initAdminPanel();
        return;
    }

    if ($("facultySyllabusForm")) {
        await initFacultyPanel();
    }
}

// =====================================================
// Shared helpers
// =====================================================

function normalizeKey(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function programValue(label) {
    const key = normalizeKey(label);

    if (!key) {
        return "";
    }

    return PROGRAMS.find(program => normalizeKey(program) === key) || "";
}

function semesterLabel(semester) {
    const index = Number(semester) - 1;

    return ROMAN[index] || String(semester || "");
}

function fullSemesterLabel(semester) {
    return `Semester ${semesterLabel(semester)}`;
}

function programSemesters(program) {
    const structure = courseStructure[program];

    return Number(structure?.semesters) || 8;
}

function programLabel(program) {
    return programValue(program) || String(program || "");
}

function courseKey(row) {
    return normalizeKey(programValue(row.course) || row.course);
}

function statusPill(status) {
    const active = String(status || "").toLowerCase() === "active";

    return `
        <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold
                     ${active
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600"}">
            ${escapeHtml(active ? STATUS_ACTIVE : STATUS_INACTIVE)}
        </span>`;
}

function viewButton(row) {
    if (row?.id === null || row?.id === undefined) {
        return "";
    }

    return `
        <button type="button"
            class="inline-flex items-center gap-2 rounded-lg bg-blue-50
                   px-3 py-2 text-sm font-medium text-blue-700 transition
                   hover:bg-blue-100"
            data-pdf-open
            data-pdf-category="syllabus"
            data-pdf-id="${escapeHtml(String(row.id))}"
            data-pdf-title="${escapeHtml(row.title || "Syllabus")}">
            <i class="fa-solid fa-eye"></i>
            View
        </button>`;
}

function emptyState(icon, title, detail = "") {
    return `
        <div class="col-span-full">
            <div class="rounded-2xl border border-dashed border-gray-300
                        bg-white p-10 text-center shadow-sm">
                <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center
                            rounded-full bg-slate-100 text-2xl text-slate-400">
                    <i class="fa-solid ${escapeHtml(icon)}"></i>
                </div>
                <p class="font-semibold text-slate-700">${escapeHtml(title)}</p>
                ${detail
            ? `<p class="mt-1 text-sm text-slate-500">${escapeHtml(detail)}</p>`
            : ""}
            </div>
        </div>`;
}

function message(id, text, type = "success") {
    showTimedMessage(id, text, type, 5000, MESSAGE_TIMERS);
}

function searchTerm(value) {
    return String(value || "").trim().toLowerCase();
}

function errorMessage(error, fallback) {
    return error?.message || fallback;
}

// =====================================================
// Student page - syllabus.html
// =====================================================

const studentState = {
    rows: [],
    program: "",
    semester: 1,
    loaded: false
};

async function initStudentPage() {
    if (studentState.loaded) {
        return;
    }
    studentState.loaded = true;

    const user = getStoredUser() || {};
    const storedProgram = programValue(user.course);

    studentState.program = storedProgram || "MCA";
    studentState.semester = 1;

    const storedSemester = Number(user.semester);

    if (storedSemester > 0) {
        studentState.semester = Math.min(
            storedSemester,
            programSemesters(studentState.program)
        );
    }

    wireStudentFilters();
    setActiveProgram(studentState.program, true);
    renderStudentSemesters();
    renderStudentCards();

    try {
        const rows = await getSyllabus();

        studentState.rows = (Array.isArray(rows) ? rows : [])
            .map(normalizeSyllabus)
            .filter(Boolean);
    } catch (error) {
        console.error("Syllabus loading error:", error);

        message(
            "syllabusMessage",
            errorMessage(error, "Could not load the syllabus right now."),
            "error"
        );

        studentState.rows = [];
    }

    renderStudentCards();
}

function wireStudentFilters() {
    const tabbar = $("syllabusProgramTabs");

    tabbar?.addEventListener("click", event => {
        const button = event.target.closest("[data-syllabus-program]");

        if (!button) {
            return;
        }

        setActiveProgram(button.dataset.syllabusProgram, true);
        studentState.semester = 1;
        renderStudentSemesters();
        renderStudentCards();
    });

    const pills = $("syllabusSemesterPills");

    pills?.addEventListener("click", event => {
        const button = event.target.closest("[data-syllabus-semester]");

        if (!button) {
            return;
        }

        studentState.semester = Number(button.dataset.syllabusSemester) || 1;

        renderStudentSemesters();
        renderStudentCards();
    });
}

function setActiveProgram(program, updateMarkup = true) {
    const value = programValue(program) || "MCA";

    studentState.program = value;

    if (!updateMarkup) {
        return;
    }

    document
        .querySelectorAll("[data-syllabus-program]")
        .forEach(button => {
            const active =
                button.dataset.syllabusProgram === value;

            button.classList.toggle("active", active);
            button.classList.toggle("bg-blue-600", active);
            button.classList.toggle("text-white", active);
            button.classList.toggle("border-blue-600", active);
            button.classList.toggle("bg-white", !active);
            button.classList.toggle("text-slate-600", !active);
            button.classList.toggle("border-slate-200", !active);
        });
}

function renderStudentSemesters() {
    const container = $("syllabusSemesterPills");

    if (!container) {
        return;
    }

    const total = programSemesters(studentState.program);

    container.innerHTML = Array.from(
        { length: total },
        (_, index) => index + 1
    ).map(semester => {
        const active = semester === studentState.semester;

        return `
            <button type="button"
                data-syllabus-semester="${semester}"
                class="rounded-xl border px-3 py-2 text-sm font-bold transition
                       ${active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}">
                ${fullSemesterLabel(semester)}
            </button>`;
    }).join("");
}

function renderStudentCards() {
    const list = $("syllabusList");

    if (!list) {
        return;
    }

    const program = studentState.program;
    const semester = studentState.semester;

    const rows = studentState.rows.filter(
        row => courseKey(row) === normalizeKey(program)
            && Number(row.semester) === semester
            && String(row.status || "").toLowerCase() === "active"
    );

    const count = $("syllabusResultCount");

    if (count) {
        count.textContent =
            `${rows.length} ${rows.length === 1 ? "document" : "documents"}`
            + ` · ${program} · ${fullSemesterLabel(semester)}`;
    }

    if (!rows.length) {
        list.innerHTML = emptyState(
            "fa-book-open-reader",
            "No syllabus uploaded yet",
            `${program} ${fullSemesterLabel(semester)} syllabus will appear here once your faculty or admin uploads it.`
        );

        return;
    }

    list.innerHTML = rows.map(row => `
        <article class="resource-card rounded-2xl border border-gray-200
                        bg-white p-5 shadow-sm">
            <div class="flex items-start gap-3">
                <div class="flex h-11 w-11 shrink-0 items-center justify-center
                            rounded-xl bg-rose-50 text-rose-600">
                    <i class="fa-solid fa-book-open-reader"></i>
                </div>
                <div class="min-w-0">
                    <h3 class="truncate text-base font-semibold text-gray-900"
                        title="${escapeHtml(row.title || "Syllabus")}">
                        ${escapeHtml(row.title || "Syllabus")}
                    </h3>
                    <p class="mt-1 text-xs text-slate-400">
                        ${escapeHtml(programLabel(row.course))}
                        · ${escapeHtml(fullSemesterLabel(row.semester))}
                    </p>
                    ${row.upload_date
            ? `<p class="mt-1 text-xs text-slate-400">
                                Uploaded ${escapeHtml(formatDate(row.upload_date))}
                           </p>`
            : ""}
                </div>
            </div>
            <div class="mt-4 flex flex-wrap items-center gap-2">
                ${viewButton(row)}
                <span class="text-xs text-slate-400">
                    Opens in the secure viewer
                </span>
            </div>
        </article>
    `).join("");
}

// =====================================================
// Admin panel - admin.html
// =====================================================

const adminState = {
    rows: [],
    editingId: null,
    loaded: false
};

async function initAdminPanel() {
    if (adminState.loaded) {
        return;
    }
    adminState.loaded = true;

    const courseSelect = $("syllabusCourse");
    const semesterSelect = $("syllabusSemester");

    courseSelect?.addEventListener("change", () => {
        fillSemesterSelect(
            semesterSelect,
            courseSelect.value,
            false
        );
    });

    $("syllabusAdminForm")?.addEventListener("submit", handleAdminSubmit);
    $("cancelSyllabusEditBtn")?.addEventListener("click", resetAdminForm);
    $("refreshSyllabusBtn")?.addEventListener("click", () => loadAdminRows(true));
    $("syllabusSearchInput")?.addEventListener("input", renderAdminList);

    $("adminSyllabusList")?.addEventListener("click", handleAdminListClick);

    fillSemesterSelect(semesterSelect, "", false);

    populateBundleSelect($("syllabusBundle")).catch(error => {
        console.error("Syllabus bundle select error:", error);
    });

    await loadAdminRows();
}

async function loadAdminRows(force = false) {
    if (adminState.rows.length && !force) {
        renderAdminList();
        return;
    }

    try {
        const rows = await getAdminSyllabus();

        adminState.rows = (Array.isArray(rows) ? rows : [])
            .map(normalizeSyllabus)
            .filter(Boolean);

        message("syllabusAdminMessage", "");
    } catch (error) {
        console.error("Admin syllabus loading error:", error);

        message(
            "syllabusAdminMessage",
            errorMessage(error, "Could not load the syllabus list."),
            "error"
        );
    }

    renderAdminList();
}

function handleAdminSubmit(event) {
    event.preventDefault();

    submitSyllabusForm({
        prefix: "syllabus",
        endpoint: "admin",
        messageId: "syllabusAdminMessage",
        state: adminState,
        onSuccess: async () => {
            resetAdminForm();
            await loadAdminRows(true);
        }
    });
}

function handleAdminListClick(event) {
    const view = event.target.closest("[data-pdf-open]");

    // The secure viewer handles its own buttons globally.
    if (view) {
        return;
    }

    const edit = event.target.closest("[data-syllabus-edit]");

    if (edit) {
        startAdminEdit(edit.dataset.syllabusEdit);
        return;
    }

    const remove = event.target.closest("[data-syllabus-delete]");

    if (remove) {
        deleteAdminRow(remove.dataset.syllabusDelete);
    }
}

function startAdminEdit(id) {
    const row = adminState.rows.find(
        item => String(item.id) === String(id)
    );

    if (!row) {
        return;
    }

    adminState.editingId = row.id;

    const courseSelect = $("syllabusCourse");
    const semesterSelect = $("syllabusSemester");
    const titleInput = $("syllabusTitle");
    const statusSelect = $("syllabusStatus");
    const bundleSelect = $("syllabusBundle");
    const fileInput = $("syllabusFile");

    if (courseSelect) {
        courseSelect.value = programLabel(row.course);
    }

    fillSemesterSelect(semesterSelect, programLabel(row.course), false);
    if (semesterSelect) {
        semesterSelect.value = String(row.semester || "");
    }

    if (titleInput) {
        titleInput.value = row.title || "";
    }

    if (statusSelect) {
        statusSelect.value =
            String(row.status || "").toLowerCase() === "inactive"
                ? STATUS_INACTIVE
                : STATUS_ACTIVE;
    }

    if (bundleSelect && row.course_id !== null && row.course_id !== undefined) {
        bundleSelect.value = String(row.course_id);
    }

    if (fileInput) {
        fileInput.value = "";
    }

    const save = $("saveSyllabusBtn");
    if (save) {
        save.innerHTML =
            '<i class="fa-solid fa-floppy-disk mr-2"></i>Save changes';
    }

    $("cancelSyllabusEditBtn")?.classList.remove("hidden");

    $("syllabusAdminForm")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function deleteAdminRow(id) {
    const row = adminState.rows.find(
        item => String(item.id) === String(id)
    );

    const label = row
        ? `${programLabel(row.course)} ${fullSemesterLabel(row.semester)}`
        : "this syllabus";

    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
        return;
    }

    try {
        await deleteSyllabus(id);

        adminState.rows = adminState.rows.filter(
            item => String(item.id) !== String(id)
        );

        if (String(adminState.editingId) === String(id)) {
            resetAdminForm();
        }

        renderAdminList();
        message("syllabusAdminMessage", "Syllabus deleted.");
    } catch (error) {
        console.error("Syllabus delete error:", error);

        message(
            "syllabusAdminMessage",
            errorMessage(error, "Could not delete this syllabus."),
            "error"
        );
    }
}

function resetAdminForm() {
    adminState.editingId = null;

    $("syllabusAdminForm")?.reset();

    fillSemesterSelect($("syllabusSemester"), "", false);

    const save = $("saveSyllabusBtn");
    if (save) {
        save.innerHTML =
            '<i class="fa-solid fa-cloud-arrow-up mr-2"></i>Upload syllabus';
    }

    $("cancelSyllabusEditBtn")?.classList.add("hidden");
}

function renderAdminList() {
    const list = $("adminSyllabusList");

    if (!list) {
        return;
    }

    const term = searchTerm($("syllabusSearchInput")?.value);

    const rows = adminState.rows.filter(row => {
        if (!term) {
            return true;
        }

        const haystack = [
            row.title,
            row.course,
            programLabel(row.course),
            `semester ${row.semester}`,
            fullSemesterLabel(row.semester),
            row.status,
            row.file_name,
            row.uploaded_by_name,
            row.uploader_role
        ].join(" ").toLowerCase();

        return haystack.includes(term);
    });

    if (!rows.length) {
        list.innerHTML = emptyState(
            "fa-book-open-reader",
            term
                ? "No syllabus matches your search"
                : "No syllabus uploaded yet",
            term
                ? "Try another course or semester."
                : "Upload the first syllabus using the form above."
        );

        return;
    }

    list.innerHTML = rows.map(row => `
        <article class="rounded-2xl border border-slate-200 bg-white p-4
                        shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex min-w-0 items-start gap-3">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center
                                rounded-xl bg-rose-50 text-rose-600">
                        <i class="fa-solid fa-book-open-reader"></i>
                    </div>
                    <div class="min-w-0">
                        <h4 class="truncate text-base font-semibold text-gray-900"
                            title="${escapeHtml(row.title || "Syllabus")}">
                            ${escapeHtml(row.title || "Syllabus")}
                        </h4>
                        <p class="mt-1 text-xs text-slate-500">
                            ${escapeHtml(programLabel(row.course))}
                            · ${escapeHtml(fullSemesterLabel(row.semester))}
                        </p>
                        <p class="mt-1 text-xs text-slate-400">
                            Uploaded ${escapeHtml(formatDate(row.upload_date))}
                            ${row.uploaded_by_name
            ? ` · ${escapeHtml(row.uploaded_by_name)}
                                       ${row.uploader_role
                ? `(${escapeHtml(row.uploader_role)})`
                : ""}`
            : ""}
                        </p>
                        ${row.file_name
            ? `<p class="mt-1 truncate text-xs text-slate-400"
                                  title="${escapeHtml(row.file_name)}">
                                ${escapeHtml(row.file_name)}
                               </p>`
            : ""}
                    </div>
                </div>
                ${statusPill(row.status)}
            </div>
            <div class="mt-4 flex flex-wrap items-center gap-2">
                ${viewButton(row)}
                <button type="button"
                    class="inline-flex items-center gap-2 rounded-lg bg-slate-100
                           px-3 py-2 text-sm font-medium text-slate-700 transition
                           hover:bg-slate-200"
                    data-syllabus-edit="${escapeHtml(String(row.id))}">
                    <i class="fa-solid fa-pen"></i>
                    Edit / Replace
                </button>
                <button type="button"
                    class="inline-flex items-center gap-2 rounded-lg bg-red-50
                           px-3 py-2 text-sm font-medium text-red-700 transition
                           hover:bg-red-100"
                    data-syllabus-delete="${escapeHtml(String(row.id))}">
                    <i class="fa-solid fa-trash"></i>
                    Delete
                </button>
            </div>
        </article>
    `).join("");
}

// =====================================================
// Faculty panel - faculty.html
// =====================================================

const facultyState = {
    rows: [],
    editingId: null,
    loaded: false
};

async function initFacultyPanel() {
    if (facultyState.loaded) {
        return;
    }
    facultyState.loaded = true;

    const courseSelect = $("facultySyllabusCourse");
    const semesterSelect = $("facultySyllabusSemester");

    courseSelect?.addEventListener("change", () => {
        fillSemesterSelect(
            semesterSelect,
            courseSelect.value,
            false
        );
    });

    $("facultySyllabusForm")
        ?.addEventListener("submit", handleFacultySubmit);

    $("cancelFacultySyllabusEditBtn")
        ?.addEventListener("click", resetFacultyForm);

    $("refreshFacultySyllabusBtn")
        ?.addEventListener("click", () => loadFacultyRows(true));

    $("facultySyllabusList")
        ?.addEventListener("click", handleFacultyListClick);

    fillSemesterSelect(semesterSelect, "", false);

    await Promise.all([
        loadFacultyCourseOptions(),
        loadFacultyRows()
    ]);
}

async function loadFacultyCourseOptions() {
    const select = $("facultySyllabusBundle");

    if (!select) {
        return;
    }

    select.innerHTML =
        '<option value="">Free — no course bundle</option>';

    try {
        const rows = await apiGet("/api/faculty/courses");
        const courses = (Array.isArray(rows) ? rows : [])
            .map(normalizeCourse)
            .filter(Boolean);

        courses.forEach(course => {
            const option = document.createElement("option");

            option.value = String(course.id);
            option.textContent = course.title || `Course #${course.id}`;

            select.append(option);
        });
    } catch (error) {
        console.error("Faculty course options error:", error);
    }
}

async function loadFacultyRows(force = false) {
    if (facultyState.rows.length && !force) {
        renderFacultyList();
        return;
    }

    try {
        const rows = await getFacultySyllabus();

        facultyState.rows = (Array.isArray(rows) ? rows : [])
            .map(normalizeSyllabus)
            .filter(Boolean);

        message("facultySyllabusMessage", "");
    } catch (error) {
        console.error("Faculty syllabus loading error:", error);

        message(
            "facultySyllabusMessage",
            errorMessage(error, "Could not load your syllabus list."),
            "error"
        );
    }

    renderFacultyList();
}

function handleFacultySubmit(event) {
    event.preventDefault();

    submitSyllabusForm({
        prefix: "facultySyllabus",
        endpoint: "faculty",
        messageId: "facultySyllabusMessage",
        state: facultyState,
        onSuccess: async () => {
            resetFacultyForm();
            await loadFacultyRows(true);
        }
    });
}

function handleFacultyListClick(event) {
    const view = event.target.closest("[data-pdf-open]");

    if (view) {
        return;
    }

    const edit = event.target.closest("[data-syllabus-edit]");

    if (edit) {
        startFacultyEdit(edit.dataset.syllabusEdit);
        return;
    }

    const remove = event.target.closest("[data-syllabus-delete]");

    if (remove) {
        deleteFacultyRow(remove.dataset.syllabusDelete);
    }
}

function startFacultyEdit(id) {
    const row = facultyState.rows.find(
        item => String(item.id) === String(id)
    );

    if (!row) {
        return;
    }

    facultyState.editingId = row.id;

    const courseSelect = $("facultySyllabusCourse");
    const semesterSelect = $("facultySyllabusSemester");
    const titleInput = $("facultySyllabusTitle");
    const bundleSelect = $("facultySyllabusBundle");
    const fileInput = $("facultySyllabusFile");

    if (courseSelect) {
        courseSelect.value = programLabel(row.course);
    }

    fillSemesterSelect(
        semesterSelect,
        programLabel(row.course),
        false
    );

    if (semesterSelect) {
        semesterSelect.value = String(row.semester || "");
    }

    if (titleInput) {
        titleInput.value = row.title || "";
    }

    if (bundleSelect && row.course_id !== null && row.course_id !== undefined) {
        bundleSelect.value = String(row.course_id);
    }

    if (fileInput) {
        fileInput.value = "";
    }

    const save = $("facultySaveSyllabusBtn");
    if (save) {
        save.innerHTML =
            '<i class="fa-solid fa-floppy-disk mr-2"></i>Save changes';
    }

    $("cancelFacultySyllabusEditBtn")?.classList.remove("hidden");

    $("facultySyllabusForm")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function deleteFacultyRow(id) {
    const row = facultyState.rows.find(
        item => String(item.id) === String(id)
    );

    const label = row
        ? `${programLabel(row.course)} ${fullSemesterLabel(row.semester)}`
        : "this syllabus";

    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
        return;
    }

    try {
        await deleteFacultySyllabus(id);

        facultyState.rows = facultyState.rows.filter(
            item => String(item.id) !== String(id)
        );

        if (String(facultyState.editingId) === String(id)) {
            resetFacultyForm();
        }

        renderFacultyList();
        message("facultySyllabusMessage", "Syllabus deleted.");
    } catch (error) {
        console.error("Faculty syllabus delete error:", error);

        message(
            "facultySyllabusMessage",
            errorMessage(error, "Could not delete this syllabus."),
            "error"
        );
    }
}

function resetFacultyForm() {
    facultyState.editingId = null;

    $("facultySyllabusForm")?.reset();

    fillSemesterSelect($("facultySyllabusSemester"), "", false);

    const save = $("facultySaveSyllabusBtn");
    if (save) {
        save.innerHTML =
            '<i class="fa-solid fa-cloud-arrow-up mr-2"></i>Upload syllabus';
    }

    $("cancelFacultySyllabusEditBtn")?.classList.add("hidden");
}

function renderFacultyList() {
    const list = $("facultySyllabusList");

    if (!list) {
        return;
    }

    if (!facultyState.rows.length) {
        list.innerHTML = emptyState(
            "fa-book-open-reader",
            "You haven't uploaded any syllabus yet",
            "Upload a PDF for a program + semester, or one of your courses."
        );

        return;
    }

    list.innerHTML = facultyState.rows.map(row => `
        <article class="rounded-2xl border border-slate-200 bg-white p-4
                        shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex min-w-0 items-start gap-3">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center
                                rounded-xl bg-rose-50 text-rose-600">
                        <i class="fa-solid fa-book-open-reader"></i>
                    </div>
                    <div class="min-w-0">
                        <h4 class="truncate text-base font-semibold text-gray-900"
                            title="${escapeHtml(row.title || "Syllabus")}">
                            ${escapeHtml(row.title || "Syllabus")}
                        </h4>
                        <p class="mt-1 text-xs text-slate-500">
                            ${escapeHtml(programLabel(row.course))}
                            · ${escapeHtml(fullSemesterLabel(row.semester))}
                            ${row.course_title
            ? ` · ${escapeHtml(row.course_title)}`
            : ""}
                        </p>
                        <p class="mt-1 text-xs text-slate-400">
                            Uploaded ${escapeHtml(formatDate(row.upload_date))}
                        </p>
                    </div>
                </div>
                ${statusPill(row.status)}
            </div>
            <div class="mt-4 flex flex-wrap items-center gap-2">
                ${viewButton(row)}
                <button type="button"
                    class="inline-flex items-center gap-2 rounded-lg bg-slate-100
                           px-3 py-2 text-sm font-medium text-slate-700 transition
                           hover:bg-slate-200"
                    data-syllabus-edit="${escapeHtml(String(row.id))}">
                    <i class="fa-solid fa-pen"></i>
                    Edit / Replace
                </button>
                <button type="button"
                    class="inline-flex items-center gap-2 rounded-lg bg-red-50
                           px-3 py-2 text-sm font-medium text-red-700 transition
                           hover:bg-red-100"
                    data-syllabus-delete="${escapeHtml(String(row.id))}">
                    <i class="fa-solid fa-trash"></i>
                    Delete
                </button>
            </div>
        </article>
    `).join("");
}

// =====================================================
// Shared form handling
// =====================================================

async function submitSyllabusForm({
    prefix,
    endpoint,
    messageId,
    state,
    onSuccess
}) {
    const courseSelect = $(`${prefix}Course`);
    const semesterSelect = $(`${prefix}Semester`);
    const titleInput = $(`${prefix}Title`);
    const statusSelect = $(`${prefix}Status`);
    const bundleSelect = $(`${prefix}Bundle`);
    const fileInput = $(`${prefix}File`);

    const program = programValue(courseSelect?.value);
    const semester = Number(semesterSelect?.value);
    const file = fileInput?.files?.[0] || null;
    const editing = state.editingId !== null
        && state.editingId !== undefined;

    if (!program) {
        message(messageId, "Please select a course (BCA, MCA or B.Tech).", "error");
        return;
    }

    if (!semester || semester < 1 || semester > programSemesters(program)) {
        message(messageId, "Please select a semester.", "error");
        return;
    }

    if (!editing && !file) {
        message(messageId, "Please select a PDF file to upload.", "error");
        return;
    }

    const status = statusSelect
        ? String(statusSelect.value || STATUS_ACTIVE)
        : "";

    const requestStatus = status || undefined;

    const conflictStatus = status
        || (editing
            ? (state.rows.find(
                item => String(item.id) === String(state.editingId)
            )?.status || STATUS_ACTIVE)
            : STATUS_ACTIVE);

    let uploaded = null;

    try {
        if (file) {
            message(messageId, "Uploading PDF to Cloudinary…", "info");
            uploaded = await uploadPdf(file, "syllabus");
        }
    } catch (error) {
        console.error("Syllabus PDF upload error:", error);
        message(
            messageId,
            errorMessage(error, "Could not upload the PDF."),
            "error"
        );
        return;
    }

    const conflict = findActiveConflict(
        state.rows,
        program,
        semester,
        editing ? state.editingId : null,
        conflictStatus
    );

    let replaceExisting = false;

    if (conflict) {
        const confirmed = window.confirm(
            `A syllabus for ${program} ${fullSemesterLabel(semester)} already exists.\n\n`
            + "Uploading this one will replace the current active syllabus. Continue?"
        );

        if (!confirmed) {
            message(messageId, "Replacement cancelled.", "info");
            return;
        }

        replaceExisting = true;
    }

    const payload = {
        course: program,
        semester,
        title: titleInput?.value.trim() || "",
        file_url: uploaded?.file_url,
        storage_path: uploaded?.cloudinary_public_id,
        file_name: uploaded?.file_name,
        course_id: bundleSelect?.value
            ? Number(bundleSelect.value)
            : null,
        status: requestStatus,
        replace_existing: replaceExisting
    };

    try {
        if (editing) {
            await updateRow(endpoint, state.editingId, payload);
        } else {
            await createRow(endpoint, payload);
        }

        message(
            messageId,
            editing ? "Syllabus updated." : "Syllabus uploaded."
        );

        await onSuccess();
    } catch (error) {
        // The server is the final authority on the one-active rule:
        // if it reports the conflict, ask once and retry with the
        // replacement flag (the PDF has already been uploaded).
        if (error?.status === 409 && !replaceExisting) {
            const confirmed = window.confirm(
                error.message
                + "\n\nReplace the existing syllabus?"
            );

            if (!confirmed) {
                message(messageId, "Replacement cancelled.", "info");
                return;
            }

            try {
                payload.replace_existing = true;

                if (editing) {
                    await updateRow(endpoint, state.editingId, payload);
                } else {
                    await createRow(endpoint, payload);
                }

                message(
                    messageId,
                    editing ? "Syllabus updated." : "Syllabus uploaded."
                );

                await onSuccess();
                return;
            } catch (retryError) {
                error = retryError;
            }
        }

        console.error("Syllabus save error:", error);

        message(
            messageId,
            errorMessage(error, "Could not save this syllabus."),
            "error"
        );
    }
}

function createRow(endpoint, payload) {
    return endpoint === "faculty"
        ? createFacultySyllabus(payload)
        : createSyllabus(payload);
}

function updateRow(endpoint, id, payload) {
    return endpoint === "faculty"
        ? updateFacultySyllabus(id, payload)
        : updateSyllabus(id, payload);
}

function findActiveConflict(rows, program, semester, exceptId, status) {
    if (String(status || "").toLowerCase() !== "active") {
        return null;
    }

    const key = normalizeKey(program);

    return rows.find(row =>
        courseKey(row) === key
        && Number(row.semester) === Number(semester)
        && String(row.status || "").toLowerCase() === "active"
        && (exceptId === null
            || exceptId === undefined
            || String(row.id) !== String(exceptId))
    ) || null;
}

// Fill a semester select with the roman labels for one
// program. `selected` pre-selects a value (edit mode).
function fillSemesterSelect(select, program, selected) {
    if (!select) {
        return;
    }

    const value = programValue(program);

    select.innerHTML =
        '<option value="" selected disabled hidden>Select Semester</option>';

    if (!value) {
        select.disabled = true;
        return;
    }

    const total = programSemesters(value);

    for (let semester = 1; semester <= total; semester++) {
        const option = document.createElement("option");

        option.value = String(semester);
        option.textContent = fullSemesterLabel(semester);

        select.append(option);
    }

    select.disabled = false;

    if (selected !== false && selected !== undefined && selected !== null && selected !== "") {
        select.value = String(selected);
    }
}
