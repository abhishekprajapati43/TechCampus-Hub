


// =====================================================

// TechCampus_Hub

// ui.js

// =====================================================



import {

    $,

    showElement,

    hideElement,

    setSelectValue,

    populateCourses,

    populateBranches,

    populateYears,

    populateSemesters,

    updateRegistrationFields,

    updateNoteFields,

    updatePyqFields,

    updateTimetableFields,

    showTimedMessage

} from "./helpers.js";



import {

    getSession,

    getCurrentUser,

    signOut

} from "./auth.js";



import {

    loadAllData

} from "./data.js";



import {

    getSignupMode,

    setSignupMode,

    getSignupRole,

    currentStudent,

    currentUserRole,

    setCurrentStudent,

    setCurrentUserRole,

    clearUserState

} from "./state.js";






import {

    renderCurrentCategory

} from "./render.js";



import {

    apiGet,

    apiPut,

    getStoredUser,

    setStoredUser,

    normalizeUser

} from "./api.js";





// =====================================================

// Auth Message

// =====================================================



export function showAuthMessage(

    message,

    type = "error"

) {

    const element =

        $("authMessage");



    if (!element) {

        return;

    }



    element.textContent =

        String(message || "");



    element.className =

        "mt-4 rounded-xl px-4 py-3 text-sm";



    if (type === "success") {

        element.classList.add(

            "bg-green-50",

            "border",

            "border-green-200",

            "text-green-700"

        );

    } else {

        element.classList.add(

            "bg-red-50",

            "border",

            "border-red-200",

            "text-red-700"

        );

    }



    element.classList.remove(

        "hidden"

    );

}





// =====================================================

// Reset Auth Form

// =====================================================



export function resetAuthForm() {

    const form =

        $("authForm");



    if (form) {

        form.reset();

    }



    const message =

        $("authMessage");



    if (message) {

        message.textContent = "";



        message.classList.add(

            "hidden"

        );

    }

}





// =====================================================

// Show Auth Section

// =====================================================



// Current route: "auth", "dashboard", "notifications", ...
function currentPage() {
    return document.body?.dataset?.page || "auth";
}

export function showAuthSection() {

    showElement(

        $("authSection")

    );



    hideElement(

        $("dashboardSection")

    );



    hideElement(

        $("adminPanel")

    );

}





// =====================================================

// Show Dashboard

// =====================================================



export function showDashboard() {

    hideElement(

        $("authSection")

    );



    showElement(

        $("dashboardSection")

    );

}





// =====================================================

// Show Admin Panel

// =====================================================



export function showAdminPanel() {

    if (!isAdminRole()) {

        hideElement(

            $("adminPanel")

        );



        return;

    }



    showElement(

        $("adminPanel")

    );

}





// =====================================================

// Hide Admin Panel

// =====================================================



export function hideAdminPanel() {

    hideElement(

        $("adminPanel")

    );

}





// =====================================================

// Admin Role

// =====================================================



function isAdminRole() {

    return currentUserRole === "admin";

}

// =====================================================
// Show Search / Learning Resources only for Students
// =====================================================

function updateSearchVisibility() {

    const searchSection = $("searchFiltersSection");

    if (!searchSection) {
        return;
    }

    if (isAdminRole()) {
        hideElement(searchSection);
    } else {
        showElement(searchSection);
    }

}



// =====================================================

// Update Admin Upload UI

// =====================================================



export function updateAdminUploadUI() {

    const adminPanel =

        $("adminPanel");



    if (!adminPanel) {

        return;

    }



    if (!isAdminRole()) {

        hideElement(

            adminPanel

        );



        return;

    }



    showElement(

        adminPanel

    );



    const typeSelect =

        $("adminUploadType");



    if (!typeSelect) {

        return;

    }



    const type =

        typeSelect.value || "notes";



    const forms = {

        notes: $("uploadNotesForm"),

        tnp: $("uploadTnpForm"),

        pyq: $("uploadPyqForm"),

        timetable:

            $("uploadTimetableForm")

    };



    Object.entries(forms).forEach(

        ([name, form]) => {

            if (!form) {

                return;

            }



            form.classList.toggle(

                "hidden",

                name !== type

            );

        }

    );

}


// =====================================================
// Update Student Profile UI
// =====================================================

//
// Small helper: writes text into an element by id
// when the element exists on the current page.
//

function setTextContent(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value;
    }
}

//
// Renders the backend registration timestamp as a short
// human-readable date ("17 Oct 2026"); missing or
// unreadable values fall back to "-".
//

function formatRegistrationDate(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}

export function updateStudentProfileUI(
    student = currentStudent
) {

    if (!student) {
        return;
    }

    const isFaculty =
        currentUserRole === "faculty" ||
        String(student.role || "").toLowerCase() === "faculty";

    const name =
        student.name ||
        (isFaculty ? "Faculty" : "Student");

    const email =
        student.email ||
        "";

    const course =
        student.course ||
        "";

    const branch =
        student.branch ||
        "";

    const semester =
        student.semester ||
        "";

    const phone =
        student.phone ||
        "";

    const gender =
        student.gender ||
        "";

    const address =
        student.address ||
        "";

    const department =
        student.department ||
        "";

    const qualification =
        student.qualification ||
        "";

    const experience =
        student.experience ||
        "";

    // Roll number from the backend when present; older
    // stored sessions fall back to the legacy id value.
    const enrollment =
        (student.enrollment_number || student.id) ?? "";


    // -------------------------------------------------
    // Dashboard greeting: "Welcome Back <name>"
    // -------------------------------------------------

    setTextContent(
        "profileNameWelcome",
        name
    );


    // -------------------------------------------------
    // -------------------------------------------------
    // Profile Page Section
    // -------------------------------------------------
    //
    // The cards hold the form controls themselves (inline
    // edit mode), so the read-only view is simply the same
    // inputs disabled. The writes are skipped while the
    // user is editing so an unrelated refresh can never
    // discard in-progress changes.
    //

    if (!studentProfileEditing) {
        studentProfileSetValue(
            "studentProfileName",
            name
        );

        studentProfileSetValue(
            "studentProfileEmail",
            email
        );

        studentProfileSetValue(
            "studentProfilePhone",
            phone
        );

        studentProfileSetValue(
            "studentProfileGender",
            gender
        );

        studentProfileSetValue(
            "studentProfileAddress",
            address
        );

        studentProfileSetValue(
            "studentProfileRegistered",
            formatRegistrationDate(student.created_at)
        );

        setStudentProfileCourse(course);

        studentProfileSetValue(
            "studentProfileSemester",
            semester
        );

        studentProfileSetValue(
            "studentProfileEnrollment",
            enrollment
        );
    }

    setTextContent(
        "studentProfilePageDepartment",
        department || "-"
    );

    setTextContent(
        "studentProfilePageQualification",
        qualification || "-"
    );

    setTextContent(
        "studentProfilePageExperience",
        experience || "-"
    );

    //
    // Role specific cards: students only see the academic
    // details, faculty only see the staff details. The
    // profile page is not normally reachable for admins,
    // so they fall back to the student layout.
    //

    applyProfileRoleCards(isFaculty);
}

//
// Shows/hides the "data-profile-role" cards on the
// profile page from one flag: faculty keep only the staff
// details, everyone else keeps the academic layout.
//

function applyProfileRoleCards(isFaculty) {
    document
        .querySelectorAll("[data-profile-role]")
        .forEach(card => {
            const cardRole =
                card.getAttribute("data-profile-role");

            const visible = isFaculty
                ? cardRole === "faculty"
                : cardRole === "student";

            card.classList.toggle(
                "hidden",
                !visible
            );
        });
}

// =====================================================
// Profile page: inline Edit Profile + save
// (PUT /api/auth/profile)
// =====================================================
//
// There is exactly ONE profile section: the cards on the
// page ARE the form. "Edit Profile" simply unlocks the
// editable inputs in place (and swaps the button for
// Save Changes + Cancel); "Save" persists and locks them
// again; "Cancel" restores the values snapshotted on
// entering edit mode. Only the fields the backend accepts
// travel on save (name / phone / course / semester);
// email, gender, address, the registration date and the
// roll number stay read-only, exactly like the faculty
// panel. Wiring is self-guarded, so every page without
// the cards no-ops.
// =====================================================

const STUDENT_PROFILE_READ_ONLY_FIELDS = [
    "studentProfileEmail",
    "studentProfileGender",
    "studentProfileAddress",
    "studentProfileRegistered",
    "studentProfileEnrollment"
];

const STUDENT_PROFILE_EDITABLE_FIELDS = [
    "studentProfileName",
    "studentProfilePhone",
    "studentProfileCourse",
    "studentProfileSemester"
];

let studentProfileEditing = false;

let studentProfileWired = false;

const studentProfileTimers = {};

// Editable values captured on entering edit mode, so
// Cancel can restore them without a server round-trip.
let studentProfileSnapshot = null;

//
// Same look/behaviour as the faculty panel message:
// textContent only, success/error class toggle, auto-hide.
//

function studentProfileMessage(message, type = "success", hideAfter = 5000) {
    showTimedMessage(
        "studentProfileMessage",
        message,
        type,
        hideAfter,
        studentProfileTimers
    );
}

function studentProfileGetValue(id) {
    return String($(id)?.value || "").trim();
}

function studentProfileSetValue(id, value) {
    const element = $(id);

    if (!element) {
        return;
    }

    element.value = value ?? "";
}

function applyStudentProfileEditingState() {
    STUDENT_PROFILE_READ_ONLY_FIELDS.forEach(id => {
        const field = $(id);

        if (field) {
            field.disabled = true;
        }
    });

    STUDENT_PROFILE_EDITABLE_FIELDS.forEach(id => {
        const field = $(id);

        if (field) {
            field.disabled = !studentProfileEditing;
        }
    });

    // Same cards, same position - edit mode simply unlocks
    // the inputs in place. There is no second form.
    $("studentProfileEditBtn")?.classList.toggle(
        "hidden",
        studentProfileEditing
    );

    ["studentProfileSaveBtn", "studentProfileCancelBtn"].forEach(id => {
        $(id)?.classList.toggle(
            "hidden",
            !studentProfileEditing
        );
    });
}

function setStudentProfileEditing(editable) {
    studentProfileEditing = editable;

    applyStudentProfileEditingState();

    if (editable) {
        $("studentProfileName")?.focus();
    }
}

function prefillStudentProfileForm(student) {
    if (!student) {
        return;
    }

    const semester = student.semester || "";

    const enrollment =
        (student.enrollment_number || student.id) ?? "";

    studentProfileSetValue("studentProfileName", student.name || "");
    studentProfileSetValue("studentProfileEmail", student.email || "");
    studentProfileSetValue("studentProfilePhone", student.phone || "");
    studentProfileSetValue("studentProfileGender", student.gender || "");
    studentProfileSetValue("studentProfileAddress", student.address || "");
    studentProfileSetValue(
        "studentProfileRegistered",
        formatRegistrationDate(student.created_at)
    );
    setStudentProfileCourse(student.course || "");
    studentProfileSetValue("studentProfileSemester", semester);
    studentProfileSetValue("studentProfileEnrollment", enrollment);
}

//
// The course field is a dropdown built from courseStructure.
// Older profiles can carry a free-text course that is not in
// the shared list - keep it selectable instead of blanking
// the field (the value round-trips unchanged on save).
//
function setStudentProfileCourse(course) {
    const select = $("studentProfileCourse");

    if (select && course) {
        const exists = Array.from(select.options).some(
            option => option.value === course
        );

        if (!exists) {
            const option = document.createElement("option");
            option.value = course;
            option.textContent = course;
            select.appendChild(option);
        }
    }

    studentProfileSetValue("studentProfileCourse", course);
}

function snapshotStudentProfileFields() {
    studentProfileSnapshot = STUDENT_PROFILE_EDITABLE_FIELDS.reduce(
        (values, id) => {
            values[id] = studentProfileGetValue(id);
            return values;
        },
        {}
    );
}

function restoreStudentProfileSnapshot() {
    if (!studentProfileSnapshot) {
        return;
    }

    Object.entries(studentProfileSnapshot).forEach(([id, value]) => {
        studentProfileSetValue(id, value);
    });

    studentProfileSnapshot = null;
}

function handleStudentProfileCancel() {
    if (!studentProfileEditing) {
        return;
    }

    // Restore the values captured on entering edit mode and
    // lock the fields again - nothing touched the server.
    restoreStudentProfileSnapshot();
    setStudentProfileEditing(false);
}

async function handleStudentProfileSave(event) {
    event.preventDefault();

    // The inputs are only unlocked in edit mode; ignore any
    // stray submit (e.g. Enter) while the fields are locked.
    if (!studentProfileEditing) {
        return;
    }

    const name = studentProfileGetValue("studentProfileName");

    if (!name) {
        studentProfileMessage(
            "Please enter your full name.",
            "error"
        );
        return;
    }

    const button = $("studentProfileSaveBtn");

    if (button) {
        button.disabled = true;
    }

    const semesterRaw =
        studentProfileGetValue("studentProfileSemester");

    // Only the editable fields travel; everything else is
    // validated (or deliberately immutable) server-side.
    const payload = {
        name,
        phone: studentProfileGetValue("studentProfilePhone") || null,
        course: studentProfileGetValue("studentProfileCourse") || null,
        semester: semesterRaw ? Number(semesterRaw) : null
    };

    try {
        const response = await apiPut("/api/auth/profile", payload);

        // Backend payload uses camelCase (createdAt,
        // enrollmentNumber); normalize it to the shape the
        // cards render from.
        const updated = response ? normalizeUser(response) : null;

        const next = updated || currentStudent;

        // Keep the in-memory and stored session copies (header
        // name, cards) in step with the server response.
        setCurrentStudent(next);

        setStoredUser({
            ...(getStoredUser() || {}),
            ...(next || {})
        });

        // Leave edit mode first (relocks the inputs), then
        // re-render the inline fields with the fresh values;
        // the in-edit guard would otherwise skip the writes.
        setStudentProfileEditing(false);

        studentProfileSnapshot = null;

        updateStudentProfileUI(next);

        // Header dropdown name (renderHeaderProfile is not
        // exported and ui.js must not import faculty.js -
        // faculty.js already imports this module).
        const headerName = $("headerProfileName");

        if (headerName) {
            headerName.textContent =
                String(next?.name || "").trim() || "Student";
        }

        studentProfileMessage("Profile updated successfully.");
    } catch (error) {
        console.error("Student profile save error:", error);

        studentProfileMessage(
            error?.message || "Could not update your profile.",
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

export function initStudentProfileEditing() {
    const form = $("studentProfileForm");

    if (!form || studentProfileWired) {
        return;
    }

    studentProfileWired = true;

    // Course dropdown comes from the shared courseStructure
    // (MCA / B.Tech / BCA) so it always matches registration
    // and the admin/faculty forms - no hardcoded list here.
    // initializeApp() may have already filled the field from the
    // loaded student; pass the current value in so rebuilding the
    // options never blanks the selection.
    populateCourses(
        $("studentProfileCourse"),
        currentStudent?.course || getStoredUser()?.course || ""
    );

    $("studentProfileEditBtn")?.addEventListener(
        "click",
        async () => {
            // Refresh from the backend first so the form never
            // prefills from a stale session cache; fall back to
            // the cached copy when the refresh fails (saving
            // still revalidates server-side).
            let source = currentStudent || getStoredUser() || null;

            try {
                const fresh = await apiGet("/api/auth/me");

                if (fresh) {
                    source = normalizeUser(fresh);

                    setCurrentStudent(source);

                    setStoredUser({
                        ...(getStoredUser() || {}),
                        ...source
                    });

                    updateStudentProfileUI(source);
                }
            } catch (error) {
                console.error("Student profile refresh error:", error);
            }

            prefillStudentProfileForm(source);

            // Capture the pre-edit values so Cancel can put
            // them back without hitting the server.
            snapshotStudentProfileFields();

            setStudentProfileEditing(true);
        }
    );

    $("studentProfileCancelBtn")?.addEventListener(
        "click",
        handleStudentProfileCancel
    );

    form.addEventListener(
        "submit",
        handleStudentProfileSave
    );

    // Start in read-only view state (cards only).
    setStudentProfileEditing(false);
}

// =====================================================
// Update Admin Profile UI
// =====================================================

export function updateAdminProfileUI(
    user = null,
    student = null
) {

    // Admins who open the student dashboard (kept reachable
    // by old links) see a generic greeting in the heading.
    setTextContent(
        "profileNameWelcome",
        "Administrator"
    );

    // The profile page (when reached by an admin) keeps the
    // student card layout; no staff cards are shown.
    applyProfileRoleCards(false);
}

// =====================================================

// Admin nav visibility

// =====================================================



export function updateAdminNavVisibility() {
    const admin = isAdminRole();

    //
    // Admin Panel plus its three quick links (Users /
    // Manage Faculty / Payments) - all admin-only, mirroring
    // the panel they open on admin.html.
    //
    [
        "adminNavBtn",
        "adminUsersNavBtn",
        "adminFacultyNavBtn",
        "adminPaymentsNavBtn",
        "adminSettingsNavBtn"
    ].forEach(id => $(id)?.classList.toggle("hidden", !admin));
}





// =====================================================

// Faculty nav visibility

// =====================================================



//
// The sidebar partial is shared by every page, so one
// single pass decides each link's final visibility from
// the signed-in role. Computing every item together keeps
// the admin, faculty and student branches from fighting
// over the same nodes when the role changes on a page.
//
// - Students keep the full learning link set.
// - Faculty keep Dashboard and their own workspace
//   quick-link group (Course / Launch Course / Content
//   Upload / Manage Content); the generic student entries
//   and the plain Faculty entry are gone.
// - Administrators keep Dashboard, Courses, Admin Panel
//   and Logout but lose the Notifications / Favorites /
//   Certificates / Feedback entries and the student
//   Payment History link (payment approval and records
//   live in the admin panel's Payments module; the
//   payment-history.html page itself still works).
//
// The Profile accordion was removed from the sidebar for
// every role; profile access lives in the header profile
// menu (students + faculty) instead.
//
// Every lookup is null-guarded because these ids only
// exist on pages that render the shared sidebar.
//

//
// Community/engagement links that administrators and
// faculty never see (students always do).
//

const ADMIN_HIDDEN_NAV_LINKS = [
    "notificationsBtn",
    "favoritesBtn",
    // Syllabus browsing is the student experience; staff manage
    // syllabus inside their own dashboards.
    "syllabusBtn",
    "certificatesBtn",
    "feedbackBtn",
    // Payment History is a student-facing store page;
    // admins approve and review payments inside
    // admin.html#payments instead.
    "paymentHistoryBtn"
];

//
// Extra student links faculty accounts do not use; the
// faculty workspace group replaces them (its own
// Dashboard link points at faculty.html#dashboard).
//

const FACULTY_HIDDEN_NAV_LINKS = [
    "dashboardHomeBtn",
    "coursesBtn",
    ...ADMIN_HIDDEN_NAV_LINKS
];

export function updateSidebarNavForRole() {
    const admin = isAdminRole();

    const faculty = currentUserRole === "faculty";

    // Always start from the full student set so every role
    // switch ends in a deterministic state.
    [
        "dashboardHomeBtn",
        ...FACULTY_HIDDEN_NAV_LINKS
    ].forEach(id => $(id)?.classList.remove("hidden"));

    // The header profile menu (photo + name + dropdown) is
    // the profile affordance for students and faculty;
    // administrators keep the plain header.
    $("headerProfileMenu")?.classList.toggle("hidden", admin);

    if (faculty) {
        FACULTY_HIDDEN_NAV_LINKS.forEach(
            id => $(id)?.classList.add("hidden")
        );
    }

    if (admin) {
        ADMIN_HIDDEN_NAV_LINKS.forEach(
            id => $(id)?.classList.add("hidden")
        );
    }

    // The quick-link group only exists for faculty; the
    // generic Faculty entry stays hidden for every role
    // now that the group carries the workspace links.
    $("facultyNavGroup")?.classList.toggle(
        "hidden",
        !faculty
    );

    $("facultyNavBtn")?.classList.add("hidden");
}

// =====================================================
// Telegram nav visibility
// =====================================================

//
// The community link is a student-only entry point:
// faculty and administrator accounts never see it.
// The lookup is null-guarded because the link only
// exists on pages that render the shared sidebar.
//

export function updateTelegramNavVisibility() {
    const link = $("telegramJoinLink");

    if (!link) {
        return;
    }

    const isStaff =
        currentUserRole === "faculty" || isAdminRole();

    link.classList.toggle("hidden", isStaff);
}





// =====================================================

// Update Student Filters

// =====================================================



export function updateStudentFilters() {

    if (isAdminRole()) {

        return;

    }



    const student =

        currentStudent;



    if (!student) {

        return;

    }



    // -------------------------------------------------

    // Notes

    // -------------------------------------------------



    setSelectValue(

        $("searchCourse"),

        student.course

    );



    setSelectValue(

        $("searchBranch"),

        student.branch

    );



    // Student Year is NOT selected/used.

    const searchYear =

        $("searchYear");



    if (searchYear) {

        searchYear.value = "";

    }



    // -------------------------------------------------

    // PYQ

    // -------------------------------------------------



    setSelectValue(

        $("pyqSearchCourse"),

        student.course

    );



    const pyqYear =

        $("pyqSearchYear");



    if (pyqYear) {

        pyqYear.value = "";

    }



    // -------------------------------------------------

    // Timetable

    // -------------------------------------------------



    setSelectValue(

        $("timetableSearchCourse"),

        student.course

    );

}





// =====================================================

// Update Student Profile Filter Options

// =====================================================



function populateStudentProfileFilters() {

    const student =

        currentStudent;



    if (!student) {

        return;

    }



    // -------------------------------------------------

    // Notes

    // -------------------------------------------------



    const searchCourse =

        $("searchCourse");



    const searchBranch =

        $("searchBranch");



    if (searchCourse) {

        searchCourse.value =

            student.course;

    }



    if (searchBranch) {

        searchBranch.value =

            student.branch;

    }



    // -------------------------------------------------

    // PYQ

    // -------------------------------------------------



    const pyqCourse =

        $("pyqSearchCourse");



    if (pyqCourse) {

        pyqCourse.value =

            student.course;

    }



    // -------------------------------------------------

    // Timetable

    // -------------------------------------------------



    const timetableCourse =

        $("timetableSearchCourse");



    if (timetableCourse) {

        timetableCourse.value =

            student.course;

    }

}





// =====================================================

// Update Role Based Filter UI

// =====================================================



export function updateStudentRoleUI() {

    const student =

        currentStudent;



    const admin =

        isAdminRole();



    // -------------------------------------------------

    // Notes

    // -------------------------------------------------



    const notesCourse =

        $("searchCourse");



    const notesBranch =

        $("searchBranch");



    const notesYear =

        $("searchYear");



    if (notesCourse) {

        notesCourse.disabled =

            !admin;

    }



    if (notesBranch) {

        notesBranch.disabled =

            !admin;

    }



    if (notesYear) {

        notesYear.disabled =

            !admin;

    }



    // -------------------------------------------------

    // PYQ

    // -------------------------------------------------



    const pyqCourse =

        $("pyqSearchCourse");



    const pyqYear =

        $("pyqSearchYear");



    if (pyqCourse) {

        pyqCourse.disabled =

            !admin;

    }



    if (pyqYear) {

        pyqYear.disabled =

            !admin;

    }



    // -------------------------------------------------

    // Timetable

    // -------------------------------------------------



    const timetableCourse =

        $("timetableSearchCourse");



    if (timetableCourse) {

        timetableCourse.disabled =

            !admin;

    }



    // -------------------------------------------------

    // Student automatic values

    // -------------------------------------------------



    if (!admin && student) {

        populateStudentProfileFilters();

    }

}

// =====================================================
// Update Upload Panel
// =====================================================

export function updateUploadPanel() {
    if (isAdminRole()) {
        updateAdminUploadUI();
    } else {
        hideAdminPanel();
    }
}

// =====================================================

// Apply Role UI

// =====================================================



export function applyRoleUI() {
    const page = currentPage();

    const admin = isAdminRole();

    const faculty = currentUserRole === "faculty";

    // Login page: after a successful login go to the right home.
    if (page === "auth") {
        if (admin) {
            window.location.replace("./admin.html");
        } else if (faculty) {
            window.location.replace("./faculty.html");
        } else {
            window.location.replace("./dashboard.html");
        }
        return;
    }

    // The admin area is only for admins.
    if (page === "admin" && !admin) {
        window.location.replace(
            faculty ? "./faculty.html" : "./dashboard.html"
        );
        return;
    }

    // The faculty area is only for faculty.
    if (page === "faculty" && !faculty) {
        window.location.replace(
            admin ? "./admin.html" : "./dashboard.html"
        );
        return;
    }

    // Faculty always work inside their dedicated dashboard.
    if (page === "dashboard" && faculty) {
        window.location.replace("./faculty.html");
        return;
    }


    if (admin) {

        updateAdminProfileUI(

            null,

            currentStudent

        );



        showDashboard();

        showAdminPanel();



    } else if (faculty) {

        // Faculty share the student shell for the shared UI
        // but keep their own navigation set.
        updateStudentProfileUI(

            currentStudent

        );

        showDashboard();

        hideAdminPanel();

        updateSidebarNavForRole();

        updateTelegramNavVisibility();

    } else {

        updateStudentProfileUI(

            currentStudent

        );

        showDashboard();

        hideAdminPanel();

    }

updateStudentFilters();
updateStudentRoleUI();
updateUploadPanel();

updateSearchVisibility();

    updateAdminNavVisibility();

    // Recompute every sidebar link from the active role so
    // the toggles always end in a consistent state.
    updateSidebarNavForRole();

    // Re-evaluate the student-only Telegram entry too.
    updateTelegramNavVisibility();
}




// =====================================================
// Update Telegram Link UI
// =====================================================

function setTelegramLinkUI(link) {
    const joinLink =
        document.getElementById(
            "telegramJoinLink"
        );

    const input =
        document.getElementById(
            "telegramLinkInput"
        );

    if (joinLink) {
        joinLink.href = link;
    }

    if (input) {
        input.value = link;
    }
}

// =====================================================
// Validate Telegram URL
// =====================================================

function isValidTelegramLink(value) {
    try {
        const url =
            new URL(value);

        const validHost =
            url.hostname === "t.me" ||
            url.hostname === "telegram.me";

        return (
            url.protocol === "https:" &&
            validHost &&
            url.pathname.length > 1
        );

    } catch {
        return false;
    }
}

// =====================================================
// Update Telegram Link
// =====================================================

export async function updateTelegramLink(
    newLink
) {
    const link =
        String(newLink || "").trim();

    if (!isValidTelegramLink(link)) {
        throw new Error(
            "Please enter a valid Telegram link, for example: https://t.me/TechCampus_Hub"
        );
    }

    const { apiPut, normalizeSettings } =
        await import("./api.js");

    const data = await apiPut(
        "/api/settings",
        { telegramLink: link }
    );

    const settings = normalizeSettings(data);

    const savedLink =
        settings?.telegram_link || link;

    setTelegramLinkUI(
        savedLink
    );

    return savedLink;
}



// =====================================================
// Load Current Student Profile
// =====================================================



// IMPORTANT:
// Profile is fetched from the backend instead
// of relying only on cached students[] data.
// =====================================================


export async function loadCurrentStudent(

    userId = null

) {

    const targetUserId =

        userId;



    if (!targetUserId) {

        setCurrentStudent(null);

        return null;

    }



    const {

        data,

        error

    } = await profileQuery(

        targetUserId

    );



    if (error) {

        console.error(

            "Student profile loading error:",

            error

        );



        setCurrentStudent(null);



        return null;

    }



    setCurrentStudent(

        data || null

    );



    return data || null;

}





// =====================================================

// Direct Student Profile Query

// =====================================================

async function profileQuery(

    userId

) {

    // Dynamic import avoids creating another permanent
    // dependency at module initialization.
    //
    // The backend derives the caller from the JWT, so the
    // profile always belongs to the signed-in user (the only
    // user loadCurrentStudent is ever asked about).

    const {

        apiGet,

        normalizeUser

    } = await import("./api.js");



    try {

        const data = await apiGet("/api/auth/me");



        return {

            data: normalizeUser(data),

            error: null

        };

    } catch (error) {

        return {

            data: null,

            error

        };

    }

}





// =====================================================

// Initialize Authenticated User

// =====================================================



export async function initializeAuthenticatedUser(user = null) {

    let authUser =

        user;



    // -------------------------------------------------

    // Get current user if not supplied

    // -------------------------------------------------



    if (!authUser) {

        const result =

            await getCurrentUser();



        if (result.error) {

            console.error(

                "Current user error:",

                result.error

            );



            clearUserState();



            showAuthSection();



            return null;

        }



        authUser =

            result.user;

    }



    if (!authUser) {

        clearUserState();



        showAuthSection();



        return null;

    }



    // -------------------------------------------------

    // Load DB profile

    // -------------------------------------------------



    const student =

        await loadCurrentStudent(

            authUser.id

        );



    if (!student) {

        console.error(

            "Authenticated user profile not found."

        );



        clearUserState();



        await signOut();



        showAuthSection();



        showAuthMessage(

            "Your profile could not be loaded. Please sign up again.",

            "error"

        );



        return null;

    }



    // -------------------------------------------------

    // Role comes from DB profile.

    //

    // Email is NOT the security authority.

    // -------------------------------------------------



    const role =

        student.role === "admin"

            ? "admin"

            : (student.role === "faculty" ? "faculty" : "student");



    setCurrentUserRole(

        role

    );



    // -------------------------------------------------

    // Load application data

    // -------------------------------------------------



    await loadAllData(

        role === "admin"

    );



    // -------------------------------------------------

// Apply UI

// -------------------------------------------------



applyRoleUI();





// =====================================================

// Populate all dynamic dropdowns

// =====================================================



populateCourses($("regCourse"));



if (role === "admin") {

    // Admin Upload Forms

    populateCourses($("noteCourse"));

    populateCourses($("pyqCourse"));

    populateCourses($("timetableCourse"));

}



// Search Filters

populateCourses($("searchCourse"));

populateCourses($("pyqSearchCourse"));

populateCourses($("timetableSearchCourse"));



// Dependent dropdowns

updateRegistrationFields();

updateNoteFields();

updatePyqFields();

updateTimetableFields();



// =====================================================

// Initialize Search Dropdowns

// =====================================================



updateRegistrationFields();

updateNoteFields();

updatePyqFields();

updateTimetableFields();

updateStudentFilters();

updateUploadPanel();



return {

    user: authUser,

    student,

    role

};

}





// =====================================================
// SIGNUP ROLE UI
// Shared by updateAuthRoleUI (events.js) and
// updateAuthModeUI below so both always agree on the
// heading and on which signup field group is visible.
// =====================================================

//
// Segmented Student/Faculty tab state:
// active tab = solid blue, inactive = slate text.
//

export function setRoleTabState(button, active) {
    if (!button) {
        return;
    }

    button.classList.toggle("bg-blue-600", active);
    button.classList.toggle("text-white", active);
    button.classList.toggle("text-slate-600", !active);
    button.classList.toggle("hover:text-slate-900", !active);

    button.setAttribute(
        "aria-selected",
        active ? "true" : "false"
    );
}

//
// Everything that depends on the chosen signup role:
// heading, subtitle, the Student/Faculty field groups
// and the role tab active states. Safe to call in
// login mode (renders the student defaults).
//

export function syncSignupRoleUI() {
    const signup = getSignupMode();

    const isFaculty = signup && getSignupRole() === "faculty";

    const heading = $("authHeading");

    if (heading) {
        heading.textContent = signup
            ? (isFaculty
                ? "Create Faculty Account"
                : "Create Student Account")
            : "Welcome Back";
    }

    const authSubtitle = $("authSubtitle");

    if (authSubtitle) {
        authSubtitle.textContent = signup
            ? (isFaculty
                ? "Register as faculty to publish courses and upload notes."
                : "Create your account to unlock notes, papers and timetables.")
            : "Sign in to access your personalized learning resources.";
    }

    // -------------------------------------------------
    // Student / Faculty field groups (inside #signupFields)
    // -------------------------------------------------

    const studentSignupFields = $("studentSignupFields");

    const facultySignupFields = $("facultySignupFields");

    if (isFaculty) {
        showElement(facultySignupFields);
        hideElement(studentSignupFields);
    } else {
        showElement(studentSignupFields);
        hideElement(facultySignupFields);
    }

    // -------------------------------------------------
    // Segmented role tabs
    // -------------------------------------------------

    setRoleTabState($("roleTabStudent"), !isFaculty);
    setRoleTabState($("roleTabFaculty"), isFaculty);

    // -------------------------------------------------
    // Login mode role tabs (Student / Faculty / Admin)
    // only belong to the sign-in view; signup keeps its
    // own Student/Faculty tabs inside #signupFields.
    // -------------------------------------------------

    const loginRoleTabs = $("loginRoleTabs");

    if (signup) {
        hideElement(loginRoleTabs);
    } else {
        showElement(loginRoleTabs);
    }
}





// =====================================================

// Auth Mode UI

// =====================================================



export function updateAuthModeUI() {

    // Heading, subtitle and Student/Faculty field groups.
    syncSignupRoleUI();

    const submitButton =

        $("authSubmitBtn");



    const signupFields =

        $("signupFields");



    const forgotPassword =

        $("forgotPasswordContainer");



    const toggleButton =

        $("toggleAuthMode");

        

if (getSignupMode()){

        if (submitButton) {

            submitButton.textContent =

                "Create Account";

        }



        showElement(

            signupFields

        );



        hideElement(

            forgotPassword

        );



        if (toggleButton) {

            toggleButton.textContent =

                "Already have an account? Login";

        }



    } else {

        if (submitButton) {

            // Pages may override the login label via a
            // data-login-label attribute; the default is
            // "Login".
            submitButton.textContent =

                submitButton.dataset.loginLabel || "Login";

        }



        hideElement(

            signupFields

        );



        showElement(

            forgotPassword

        );



        if (toggleButton) {

            toggleButton.textContent =

                "Don't have an account? Sign up";

        }

    }

}





// =====================================================

// Initialize Registration Fields

// =====================================================



function initializeRegistrationFields() {

    const courseSelect =

        $("regCourse");



    const branchSelect =

        $("regBranch");



    const yearSelect =

        $("regYear");



    const semesterSelect =

        $("regSemester");



    if (!courseSelect) {

        return;

    }



    const course =

        courseSelect.value;



    if (branchSelect) {

        populateBranches(

            courseSelect,

            branchSelect

        );

    }



    if (yearSelect) {

        populateYears(

            yearSelect,

            course

        );

    }



    if (semesterSelect) {

        populateSemesters(

            semesterSelect,

            course

        );

    }

}





// =====================================================

// Initialize Application

// =====================================================



export async function initializeApp() {

    // The auth screen only exists on the login page.
    if (currentPage() === "auth") {

        showAuthSection();

        updateAuthModeUI();

        initializeRegistrationFields();

        // Arrived here after deleting the profile: confirm it worked.
        if (new URLSearchParams(window.location.search).get("deleted") === "1") {

            showAuthMessage(

                "Your profile has been deleted. You can create a new account.",

                "success"

            );

        }

    }



    const {

        data,

        error

    } = await getSession();



    if (error) {

        console.error(

            "Session loading error:",

            error

        );



        clearUserState();



        return null;

    }



    const session =

        data?.session;



    if (!session?.user) {

        clearUserState();



        return null;

    }



    return await initializeAuthenticatedUser(

        session.user

    );

}





// =====================================================
// Logout
// =====================================================

export async function logoutUser() {
    try {
        const success = await signOut();

        // Local state clear karo
        clearUserState();

        hideElement($("dashboardSection"));
        hideElement($("adminPanel"));
        showAuthSection();

        // Logging out returns the user to the Home page;
        // logging in again happens via the Login page.
        if (currentPage() !== "auth" && currentPage() !== "home") {
            window.location.replace("./index.html");
            return;
        }

        resetAuthForm();
        setSignupMode(false);
        updateAuthModeUI();

        return success;

    } catch (error) {
        console.error("Logout error:", error);

        // UI ko bhi logout state mein rakho
        clearUserState();
        hideElement($("dashboardSection"));
        hideElement($("adminPanel"));
        showAuthSection();

        return false;
    }
}

// =====================================================

// Category Change

// =====================================================



export async function handleCategoryChange(

    category

) {

    const searchCategory =

        $("searchCategory");



    if (searchCategory) {

        searchCategory.value =

            category;

    }



    await renderCurrentCategory(

        category

    );

}

