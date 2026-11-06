
// =====================================================
// TechCampus_Hub
// events.js
// =====================================================

import {
    $,
    updateRegistrationFields,
    updateNoteFields,
    updatePyqFields,
    updateTimetableFields
} from "./helpers.js";

import {
    setSignupMode,
    isSignupMode,
    setSignupRole,
    getSignupRole,
    currentUserRole
} from "./state.js";

import {
    signIn,
    signUpStudent,
    signUpFaculty,
    resetPassword,
    onAuthStateChange
} from "./auth.js";

import {
    initializeAuthenticatedUser,
    updateAuthModeUI,
    syncSignupRoleUI,
    setRoleTabState,
    showAuthMessage,
    resetAuthForm,
    logoutUser,
    handleCategoryChange,
    updateUploadPanel,
    updateStudentFilters,
    updateTelegramLink
} from "./ui.js";

import {
    uploadNotes,
    uploadTnp,
    uploadPyq,
    uploadTimetable,
    setupAdminDynamicActions,
    editRecord
} from "./admin.js";

import {
    renderCurrentCategory,
    setupRenderActions
} from "./render.js";

import {
    collectVideos,
    setupRelatedVideosModal,
    setupVideoManagers
} from "./videos.js";

import {
    setupCommerceEvents
} from "./courses.js";

import {
    setupAdminUsers
} from "./admin-users.js";

import {
    loadAllData
} from "./data.js";

// =====================================================
// Prevent duplicate setup
// =====================================================

let eventsInitialized = false;
let authListenerInitialized = false;

// =====================================================
// Login Role Selection (Student / Faculty / Admin)
// =====================================================

//
// login.html asks which kind of account is signing in;
// the choice is validated against the credentials and the
// backend role decides the post-login redirect.
//

let loginRole = "student";

const LOGIN_ROLE_LABELS = {
    student: "Student",
    faculty: "Faculty",
    admin: "Admin"
};

// =====================================================
// Utility
// =====================================================

function isAdmin() {
    return currentUserRole === "admin";
}

function getErrorMessage(error) {
    const base =
        error?.message ||
        "Something went wrong. Please try again.";

    // Surface per-field validation errors (e.g. "password must be 8-72
    // characters") so the user knows exactly which input to fix.
    const fieldErrors = error?.fieldErrors;

    if (
        fieldErrors &&
        typeof fieldErrors === "object" &&
        Object.keys(fieldErrors).length > 0
    ) {
        const details = Object.entries(fieldErrors)
            .map(([field, message]) => `${message}`)
            .join(". ");

        // Avoid duplicating text the backend already folded into the message.
        const combined = details && !base.includes(details)
            ? `${base}: ${details}`
            : base;

        return combined;
    }

    return base;
}

// =====================================================
// AUTH UI
// One unified login for every role: the Student /
// Faculty / Admin tabs on login.html pick the account
// type checked during sign-in.
// =====================================================

function updateAuthRoleUI() {
    const authMessage = $("authMessage");
    const signupFields = $("signupFields");
    const toggleAuthMode = $("toggleAuthMode");
    const authSubmitBtn = $("authSubmitBtn");
    const forgotPasswordContainer = $("forgotPasswordContainer");

    // -------------------------------------------------
    // Main auth screen = Student (or Faculty while the
    // signup role tabs say so). Heading, subtitle and
    // the role field groups live in syncSignupRoleUI()
    // so updateAuthModeUI() can never overwrite them.
    // -------------------------------------------------

    syncSignupRoleUI();

    if (signupFields) {
        signupFields.classList.toggle(
            "hidden",
            !isSignupMode
        );
    }

    if (toggleAuthMode) {
        toggleAuthMode.classList.remove("hidden");

        toggleAuthMode.textContent = isSignupMode
            ? "Already have an account? Login"
            : "Don't have an account? Sign up";
    }

    if (authSubmitBtn) {
        // Pages may override the login label via a
        // data-login-label attribute; the default is
        // "Login".
        authSubmitBtn.textContent = isSignupMode
            ? "Create Account"
            : (authSubmitBtn.dataset.loginLabel || "Login");
    }

    if (forgotPasswordContainer) {
        forgotPasswordContainer.classList.toggle(
            "hidden",
            isSignupMode
        );
    }

    if (authMessage && !authMessage.textContent) {
        authMessage.textContent = "";
    }
}

// =====================================================
// AUTH FORM
// Unified Login (Student / Faculty / Admin) + Student Signup
// =====================================================

async function handleAuthSubmit(event) {
    event.preventDefault();

    const email =
        $("authEmail")?.value?.trim() || "";

    const password =
        $("authPassword")?.value || "";

    if (!email || !password) {
        showAuthMessage(
            "Please enter email and password.",
            "error"
        );
        return;
    }

    const submitButton =
        $("authSubmitBtn");

    if (submitButton) {
        submitButton.disabled = true;

        submitButton.textContent =
            isSignupMode
                ? "Creating Account..."
                : "Logging in...";
    }

    try {
        // =================================================
        // STUDENT SIGNUP
        // =================================================

        if (isSignupMode) {
            // =================================================
            // FACULTY SIGNUP
            // Validation only — the API is NOT called here.
            // On success the Declaration Form modal opens and
            // its final submit performs the registration.
            // =================================================

            if (getSignupRole() === "faculty") {
                const name =
                    $("regName")?.value?.trim() || "";

                const phone =
                    $("regPhone")?.value?.trim() || "";

                const aadhaarNumber =
                    $("regAadhaar")?.value?.trim() || "";

                const address =
                    $("regAddress")?.value?.trim() || "";

                const confirmPassword =
                    $("regConfirmPassword")?.value || "";

                if (!name) {
                    showAuthMessage(
                        "Please enter your full name.",
                        "error"
                    );

                    return;
                }

                if (!/^\d{10}$/.test(phone)) {
                    showAuthMessage(
                        "Please enter a valid 10-digit mobile number.",
                        "error"
                    );

                    return;
                }

                if (!/^\d{12}$/.test(aadhaarNumber)) {
                    showAuthMessage(
                        "Please enter a valid 12-digit Aadhaar number.",
                        "error"
                    );

                    return;
                }

                if (!address) {
                    showAuthMessage(
                        "Please enter your complete address.",
                        "error"
                    );

                    return;
                }

                if (confirmPassword !== password) {
                    showAuthMessage(
                        "Passwords do not match. Please re-enter the password.",
                        "error"
                    );

                    return;
                }

                openDeclarationModal();

                return;
            }
            const name =
                $("regName")?.value?.trim() || "";

            const course =
                $("regCourse")?.value || "";

            const branch =
                $("regBranch")?.value || "";

            const year =
                $("regYear")?.value || "";

            const semester =
                $("regSemester")?.value || "";

            const studentPhone =
                $("regStudentPhone")?.value?.trim() || "";

            const studentAddress =
                $("regStudentAddress")?.value?.trim() || "";

            const studentGender =
                $("regStudentGender")?.value?.trim() || "";

            const enrollmentNumber =
                $("regEnrollment")?.value?.trim() || "";

            if (
                !name ||
                !course ||
                !branch ||
                !year ||
                !semester
            ) {
                showAuthMessage(
                    "Please fill all registration fields.",
                    "error"
                );

                return;
            }

            const {
                data,
                error
            } = await signUpStudent({
                email,
                password,
                name,
                course,
                branch,
                year,
                semester,
                phone: studentPhone,
                address: studentAddress,
                gender: studentGender,
                enrollmentNumber
            });

            if (error) {
                throw error;
            }

            // -------------------------------------------------
            // Email confirmation required — the backend's own
            // copy (role-aware: verification link for students,
            // pending approval for faculty) wins when present.
            // -------------------------------------------------

            if (
                data?.user &&
                !data?.session
            ) {
                showAuthMessage(
                    data?.message ||
                        "Account created successfully. Please verify your email, then login.",
                    "success"
                );

                setSignupMode(false);
                resetAuthForm();
                updateAuthRoleUI();

                return;
            }

            // -------------------------------------------------
            // Session available immediately
            // -------------------------------------------------

            if (data?.session) {
                await initializeAuthenticatedUser();
                return;
            }

            // -------------------------------------------------
            // Signup successful but no session — registration
            // never returns a token, so the server's confirmation
            // copy is shown as-is (no auto-login).
            // -------------------------------------------------

            showAuthMessage(
                data?.message ||
                    "Account created successfully. Please login.",
                "success"
            );

            setSignupMode(false);
            resetAuthForm();
            updateAuthRoleUI();

            return;
        }

        // =================================================
        // LOGIN
        // =================================================

        const {
            data,
            error
        } = await signIn(
            email,
            password
        );

        if (error) {
            throw error;
        }

        if (!data?.user) {
            throw new Error(
                "Login failed. Please try again."
            );
        }

        // =================================================
        // UNIFIED ROLE CHECK
        // The role tabs on login.html pick the expected
        // account type. A mismatch stops here, BEFORE
        // initializeAuthenticatedUser() fires the
        // role-based redirect to another page.
        // =================================================

        const actualRole =
            String(data.user.role || "").toLowerCase();

        if (
            document.getElementById("loginRoleTabs")
            && actualRole !== loginRole
        ) {
            await logoutUser();

            throw new Error(
                `You selected ${LOGIN_ROLE_LABELS[loginRole] || loginRole}. ` +
                `This account is a ` +
                `${LOGIN_ROLE_LABELS[actualRole] || actualRole} account - ` +
                `please select ` +
                `${LOGIN_ROLE_LABELS[actualRole] || actualRole} and try again.`
            );
        }

        // Load existing profile/role; applyRoleUI then
        // redirects to the matching dashboard
        // (student -> dashboard.html, faculty ->
        // faculty.html, admin -> admin.html).
        await initializeAuthenticatedUser();

        showAuthMessage(
            "Login successful.",
            "success"
        );

    } catch (error) {
        console.error(
            "Authentication error:",
            error
        );

        showAuthMessage(
            getErrorMessage(error),
            "error"
        );

    } finally {
        if (submitButton) {
            submitButton.disabled = false;

            submitButton.textContent =
                isSignupMode
                    ? "Create Account"
                    : (submitButton.dataset.loginLabel || "Login");
        }
    }
}

// =====================================================
// LOGIN / SIGNUP TOGGLE
// =====================================================

function handleAuthModeToggle(event) {
    event.preventDefault();

    const newSignupMode =
        !isSignupMode;

    setSignupMode(
        newSignupMode
    );

    // Modes always come back on the Student tab.
    setSignupRole("student");

    resetAuthForm();

    updateAuthRoleUI();

    if (newSignupMode) {
        updateRegistrationFields();
    }
}

// =====================================================
// SIGNUP ROLE TABS (Student / Faculty)
// =====================================================

// Field ids that belong to only one of the two signup
// forms. Switching tabs clears the other form so a
// hidden input can never fail HTML5 validation.

const STUDENT_SIGNUP_FIELD_IDS = [
    "regCourse",
    "regBranch",
    "regYear",
    "regSemester",
    "regStudentPhone",
    "regStudentAddress",
    "regStudentGender",
    "regEnrollment"
];

const FACULTY_SIGNUP_FIELD_IDS = [
    "regPhone",
    "regAadhaar",
    "regAddress",
    "regConfirmPassword",
    "regFacultyGender",
    "regDepartment",
    "regQualification",
    "regExperience"
];

function clearSignupFields(fieldIds) {
    fieldIds.forEach(id => {
        const field = $(id);

        if (field) {
            field.value = "";
        }
    });
}

function handleSignupRoleTab(event) {
    const role =
        event.currentTarget?.dataset?.signupRole === "faculty"
            ? "faculty"
            : "student";

    setSignupRole(role);

    // -------------------------------------------------
    // Drop stale validation feedback
    // -------------------------------------------------

    const message = $("authMessage");

    if (message) {
        message.textContent = "";
        message.classList.add("hidden");
    }

    // -------------------------------------------------
    // Reset the fields that belong to the other role
    // -------------------------------------------------

    clearSignupFields(
        role === "faculty"
            ? STUDENT_SIGNUP_FIELD_IDS
            : FACULTY_SIGNUP_FIELD_IDS
    );

    // -------------------------------------------------
    // Refresh heading, subtitle, tabs and field groups
    // through both existing auth UI refresh functions
    // -------------------------------------------------

    updateAuthRoleUI();
    updateAuthModeUI();
}

// =====================================================
// LOGIN ROLE TABS (Student / Faculty / Admin)
// =====================================================

//
// One tab is always active: Student/Faculty/Admin on the
// sign-in view. The choice only affects login (signup has
// its own tabs) and is validated against the account role
// in handleAuthSubmit().
//

function handleLoginRoleTab(event) {
    const role =
        event.currentTarget?.dataset?.loginRole || "";

    if (!LOGIN_ROLE_LABELS[role]) {
        return;
    }

    loginRole = role;

    [
        "loginRoleTabStudent",
        "loginRoleTabFaculty",
        "loginRoleTabAdmin"
    ].forEach(tabId => {
        const tab = $(tabId);

        setRoleTabState(
            tab,
            tab?.dataset?.loginRole === loginRole
        );
    });

    // Drop stale feedback from a previous attempt.
    const message = $("authMessage");

    if (message) {
        message.textContent = "";
        message.classList.add("hidden");
    }
}

function setupLoginRoleTabs() {
    $("loginRoleTabStudent")?.addEventListener(
        "click",
        handleLoginRoleTab
    );

    $("loginRoleTabFaculty")?.addEventListener(
        "click",
        handleLoginRoleTab
    );

    $("loginRoleTabAdmin")?.addEventListener(
        "click",
        handleLoginRoleTab
    );
}

// =====================================================
// FACULTY DECLARATION MODAL
// =====================================================

function openDeclarationModal() {
    const modal =
        $("declarationModal");

    const checkbox =
        $("declarationAgreeCheckbox");

    const submitButton =
        $("declarationSubmitBtn");

    const message =
        $("declarationMessage");

    if (modal) {
        modal.classList.remove("hidden");
    }

    if (checkbox) {
        checkbox.checked = false;
    }

    // Final submit stays disabled until the user agrees.
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Submit";
    }

    if (message) {
        message.textContent = "";
    }
}

function closeDeclarationModal() {
    const modal =
        $("declarationModal");

    if (modal) {
        modal.classList.add("hidden");
    }
}

function handleDeclarationAgreement(event) {
    const submitButton =
        $("declarationSubmitBtn");

    if (submitButton) {
        submitButton.disabled =
            !event.currentTarget?.checked;
    }
}

async function handleDeclarationSubmit() {
    const checkbox =
        $("declarationAgreeCheckbox");

    const submitButton =
        $("declarationSubmitBtn");

    const message =
        $("declarationMessage");

    // -------------------------------------------------
    // Consent is mandatory before any API call
    // -------------------------------------------------

    if (!checkbox?.checked) {
        if (message) {
            message.textContent =
                "Please agree to the declaration to continue.";
        }

        return;
    }

    const email =
        $("authEmail")?.value?.trim() || "";

    const password =
        $("authPassword")?.value || "";

    const name =
        $("regName")?.value?.trim() || "";

    const phone =
        $("regPhone")?.value?.trim() || "";

    const aadhaarNumber =
        $("regAadhaar")?.value?.trim() || "";

    const address =
        $("regAddress")?.value?.trim() || "";

    const gender =
        $("regFacultyGender")?.value?.trim() || "";

    const department =
        $("regDepartment")?.value?.trim() || "";

    const qualification =
        $("regQualification")?.value?.trim() || "";

    const experience =
        $("regExperience")?.value?.trim() || "";

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";
        }

        if (message) {
            message.textContent = "";
        }

        const {
            data,
            error
        } = await signUpFaculty({
            email,
            password,
            name,
            phone,
            aadhaarNumber,
            address,
            gender,
            department,
            qualification,
            experience
        });

        if (error) {
            throw error;
        }

        closeDeclarationModal();

        // -------------------------------------------------
        // Registration never returns a token, so no auto-login
        // happens here. The backend's role-aware copy ("pending
        // approval" for faculty) is shown when it is present;
        // resetAuthForm() clears #authMessage, so the
        // confirmation is shown after the form reset.
        // -------------------------------------------------

        setSignupMode(false);
        resetAuthForm();
        updateAuthRoleUI();

        showAuthMessage(
            data?.message ||
                "Account created successfully. Please verify your email, then login.",
            "success"
        );

    } catch (error) {
        console.error(
            "Faculty registration error:",
            error
        );

        const errorMessage =
            getErrorMessage(error);

        showAuthMessage(
            errorMessage,
            "error"
        );

        // The modal covers #authMessage, so repeat it here.
        if (message) {
            message.textContent = errorMessage;
        }

    } finally {
        if (submitButton) {
            submitButton.disabled =
                !checkbox?.checked;

            submitButton.textContent = "Submit";
        }
    }
}

// =====================================================
// FORGOT PASSWORD
// =====================================================

async function handleForgotPassword(event) {
    event.preventDefault();

    const email =
        $("authEmail")?.value?.trim() || "";

    if (!email) {
        showAuthMessage(
            "Please enter your email address first.",
            "error"
        );

        return;
    }

    const button =
        $("forgotPasswordBtn");

    if (button) {
        button.disabled = true;
        button.textContent = "Sending...";
    }

    try {
        const {
            error
        } = await resetPassword(email);

        if (error) {
            throw error;
        }

        showAuthMessage(
            "Password reset link has been sent to your email.",
            "success"
        );

    } catch (error) {
        console.error(
            "Password reset error:",
            error
        );

        showAuthMessage(
            getErrorMessage(error),
            "error"
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "Forgot Password?";
        }
    }
}

// =====================================================
// MODAL KEYBOARD SHORTCUTS
// =====================================================

function setupModalKeyboardShortcuts() {
    document.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Escape") {
                return;
            }

            const declarationModal = $("declarationModal");

            if (declarationModal && !declarationModal.classList.contains("hidden")) {
                closeDeclarationModal();
                return;
            }

            const editModal = $("editResourceModal");

            if (editModal && !editModal.classList.contains("hidden")) {
                editModal.classList.add("hidden");
                $("editResourceForm")?.reset();
                return;
            }
        }
    );
}

// =====================================================
// REGISTRATION COURSE CHANGE
// =====================================================

function handleRegistrationCourseChange() {
    updateRegistrationFields();
}

// =====================================================
// NOTES UPLOAD
// =====================================================

async function handleNotesUpload(event) {
    event.preventDefault();

    if (!isAdmin()) {
        alert(
            "Administrator access required."
        );
        return;
    }

    const form =
        event.currentTarget;

    const button =
        form.querySelector(
            'button[type="submit"]'
        );

    if (button) {
        button.disabled = true;
        button.textContent =
            "Uploading...";
    }

    try {
        const result =
            await uploadNotes(event);

        if (!result) {
            return;
        }

        updateNoteFields();

    } catch (error) {
        console.error(
            "Notes upload error:",
            error
        );

        alert(
            getErrorMessage(error)
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "Upload Notes";
        }
    }
}

// =====================================================
// TNP UPLOAD
// =====================================================

async function handleTnpUpload(event) {
    event.preventDefault();

    if (!isAdmin()) {
        alert(
            "Administrator access required."
        );
        return;
    }

    const form =
        event.currentTarget;

    const button =
        form.querySelector(
            'button[type="submit"]'
        );

    if (button) {
        button.disabled = true;
        button.textContent =
            "Uploading...";
    }

    try {
        const result =
            await uploadTnp(event);

        if (!result) {
            return;
        }

    } catch (error) {
        console.error(
            "TNP upload error:",
            error
        );

        alert(
            getErrorMessage(error)
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "Upload TNP";
        }
    }
}

// =====================================================
// PYQ UPLOAD
// =====================================================

async function handlePyqUpload(event) {
    event.preventDefault();

    if (!isAdmin()) {
        alert(
            "Administrator access required."
        );
        return;
    }

    const form =
        event.currentTarget;

    const button =
        form.querySelector(
            'button[type="submit"]'
        );

    if (button) {
        button.disabled = true;
        button.textContent =
            "Uploading...";
    }

    try {
        const result =
            await uploadPyq(event);

        if (!result) {
            return;
        }

        updatePyqFields();

    } catch (error) {
        console.error(
            "PYQ upload error:",
            error
        );

        alert(
            getErrorMessage(error)
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "Upload PYQ";
        }
    }
}

// =====================================================
// TIMETABLE UPLOAD
// =====================================================

async function handleTimetableUpload(event) {
    event.preventDefault();

    if (!isAdmin()) {
        alert(
            "Administrator access required."
        );
        return;
    }

    const form =
        event.currentTarget;

    const button =
        form.querySelector(
            'button[type="submit"]'
        );

    if (button) {
        button.disabled = true;
        button.textContent =
            "Uploading...";
    }

    try {
        const result =
            await uploadTimetable(event);

        if (!result) {
            return;
        }

        updateTimetableFields();

    } catch (error) {
        console.error(
            "Timetable upload error:",
            error
        );

        alert(
            getErrorMessage(error)
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent =
                "Upload Timetable";
        }
    }
}

// =====================================================
// RELOAD DATA
// =====================================================

async function reloadApplicationData() {
    await loadAllData(
        isAdmin()
    );

    updateStudentFilters();

    await renderCurrentCategory();
}

// =====================================================
// CATEGORY BUTTON
// =====================================================

async function handleCategoryButtonClick(event) {
    const button =
        event.currentTarget;

    const category =
        button.dataset.dashboardCategory;

    if (!category) {
        return;
    }

    document
        .querySelectorAll(
            "[data-dashboard-category]"
        )
        .forEach(item => {
            item.classList.toggle(
                "active",
                item === button
            );
        });

    await handleCategoryChange(
        category
    );

    // Smooth scroll to the section that shows
    // the selected category's content.
    const section =
        document.getElementById("resourceList");

    section?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

// =====================================================
// ADMIN UPLOAD TYPE
// =====================================================
function handleAdminUploadTypeChange() {

    updateUploadPanel();
}
// =====================================================
// DATA REFRESH
// =====================================================

async function handleDataRefresh() {
    try {
        await reloadApplicationData();

    } catch (error) {
        console.error(
            "Data refresh error:",
            error
        );
    }
}

// =====================================================
// LOGOUT
// =====================================================

async function handleLogout() {
    try {
        await logoutUser();

        // Always return to Student Login.
        setSignupMode(false);

        updateAuthRoleUI();

    } catch (error) {
        console.error(
            "Logout error:",
            error
        );

        alert(
            getErrorMessage(error)
        );
    }
}

// =====================================================
// MOBILE SIDEBAR
// =====================================================

function setupMobileSidebar() {
    const openButton =
        $("mobileMenuBtn");

    const closeButton =
        $("closeSidebarBtn");

    const sidebar =
        $("sidebar");

    const overlay =
        $("sidebarOverlay");

    if (!sidebar) {
        return;
    }

    function openSidebar() {
        sidebar.classList.add(
            "mobile-open"
        );

        document.body.classList.add(
            "sidebar-open"
        );

        overlay?.classList.remove(
            "hidden"
        );
    }

    function closeSidebar() {
        sidebar.classList.remove(
            "mobile-open"
        );

        document.body.classList.remove(
            "sidebar-open"
        );

        overlay?.classList.add(
            "hidden"
        );
    }

    openButton?.addEventListener(
        "click",
        openSidebar
    );

    closeButton?.addEventListener(
        "click",
        closeSidebar
    );

    overlay?.addEventListener(
        "click",
        closeSidebar
    );

    // The drawer is mobile-only: selecting any destination closes it
    // before the next page paints, and resizing past the breakpoint
    // returns the page to its normal, unscrolled state.
    sidebar
        .querySelectorAll("a.nav-item, #logoutBtn")
        .forEach(link => {
            link.addEventListener(
                "click",
                () => {
                    if (window.innerWidth <= 767) {
                        closeSidebar();
                    }
                }
            );
        });

    document.addEventListener(
        "keydown",
        event => {
            if (event.key === "Escape") {
                closeSidebar();
            }
        }
    );

    window.addEventListener(
        "resize",
        () => {
            if (window.innerWidth > 767) {
                closeSidebar();
            }
        }
    );

    document
        .querySelectorAll(
            "[data-dashboard-category]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                closeSidebar
            );
        });
}

// =====================================================
// PASSWORD TOGGLE
// =====================================================

function setupPasswordToggle() {
    const button =
        $("togglePasswordBtn");

    const password =
        $("authPassword");

    if (
        !button ||
        !password
    ) {
        return;
    }

    if (
        button.dataset.passwordReady ===
        "true"
    ) {
        return;
    }

    button.dataset.passwordReady =
        "true";

    button.addEventListener(
        "click",
        () => {
            const visible =
                password.type === "text";

            password.type =
                visible
                    ? "password"
                    : "text";

            const icon =
                button.querySelector("i");

            if (icon) {
                icon.classList.toggle(
                    "fa-eye",
                    visible
                );

                icon.classList.toggle(
                    "fa-eye-slash",
                    !visible
                );
            }

            button.setAttribute(
                "aria-label",
                password.type === "text"
                    ? "Hide password"
                    : "Show password"
            );
        }
    );
}

// =====================================================
// REGISTRATION EVENTS
// =====================================================

function setupRegistrationEvents() {
    const course =
        $("regCourse");

    course?.addEventListener(
        "change",
        handleRegistrationCourseChange
    );

    // -------------------------------------------------
    // Student / Faculty signup role tabs
    // -------------------------------------------------

    $("roleTabStudent")?.addEventListener(
        "click",
        handleSignupRoleTab
    );

    $("roleTabFaculty")?.addEventListener(
        "click",
        handleSignupRoleTab
    );

    // -------------------------------------------------
    // Faculty declaration modal
    // -------------------------------------------------

    $("declarationAgreeCheckbox")?.addEventListener(
        "change",
        handleDeclarationAgreement
    );

    $("declarationCancelBtn")?.addEventListener(
        "click",
        closeDeclarationModal
    );

    $("declarationSubmitBtn")?.addEventListener(
        "click",
        handleDeclarationSubmit
    );
}

// =====================================================
// ADMIN FIELD EVENTS
// =====================================================

function setupAdminFieldEvents() {
    const noteCourse =
        $("noteCourse");

    const pyqCourse =
        $("pyqCourse");

    const timetableCourse =
        $("timetableCourse");

    noteCourse?.addEventListener(
        "change",
        updateNoteFields
    );

    pyqCourse?.addEventListener(
        "change",
        updatePyqFields
    );

    timetableCourse?.addEventListener(
        "change",
        updateTimetableFields
    );
}

// =====================================================
// EDIT MODAL
// =====================================================

function setupEditModalEvents() {
    const form =
        $("editResourceForm");

    const modal =
        $("editResourceModal");

    const cancelButton =
        $("cancelEditResourceBtn");

    const closeButton =
        $("closeEditResourceBtn");

    if (!form) {
        return;
    }

    // -------------------------------------------------
    // Close modal
    // -------------------------------------------------

    function closeModal() {
        modal?.classList.add(
            "hidden"
        );

        form.reset();

        if (modal) {
            delete modal.dataset.category;
            delete modal.dataset.recordId;
        }
    }

    cancelButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            closeModal();
        }
    );

    closeButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            closeModal();
        }
    );

    modal?.addEventListener(
        "click",
        event => {
            if (
                event.target ===
                event.currentTarget
            ) {
                closeModal();
            }
        }
    );

    // -------------------------------------------------
    // Save edit
    // -------------------------------------------------

    form.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            if (!isAdmin()) {
                alert(
                    "Administrator access required."
                );

                return;
            }

            const category =
                modal?.dataset?.category ||
                $("editResourceCategory")?.value;

            const id =
                modal?.dataset?.recordId ||
                $("editResourceId")?.value;

            if (!category || !id) {
                alert(
                    "Unable to identify the resource."
                );

                return;
            }

            // -----------------------------------------
            // Common fields
            // -----------------------------------------

            const values = {};

            const subject =
                $("editResourceSubject");

            const title =
                $("editResourceTitle");

            const course =
                $("editResourceCourse");

            const branch =
                $("editResourceBranch");

            const year =
                $("editResourceYear");

            const semester =
                $("editResourceSemester");

            const examYear =
                $("editResourceExamYear");

            if (subject) {
                values.subject =
                    subject.value.trim();
            }

            if (title) {
                values.title =
                    title.value.trim();
            }

            if (course) {
                values.course =
                    course.value;
            }

            if (branch) {
                values.branch =
                    branch.value;
            }

            if (year) {
                values.year =
                    year.value === ""
                        ? null
                        : Number(year.value);
            }

            if (semester) {
                values.semester =
                    semester.value === ""
                        ? null
                        : Number(semester.value);
            }

            if (examYear) {
                values.exam_year =
                    examYear.value === ""
                        ? null
                        : Number(examYear.value);
            }

            // -----------------------------------------
            // Timetable fields
            // -----------------------------------------

            const examDate =
                $("editResourceDate");

            const startTime =
                $("editResourceStartTime");

            const endTime =
                $("editResourceEndTime");

            const examType =
                $("editResourceExamType");

            if (examDate) {
                values.exam_date =
                    examDate.value || null;
            }

            if (startTime) {
                values.start_time =
                    startTime.value || null;
            }

            if (endTime) {
                values.end_time =
                    endTime.value || null;
            }

            if (examType) {
                values.exam_type =
                    examType.value.trim();
            }

            const newFile =
                $("editResourceFile")
                    ?.files?.[0] || null;

            const saveButton =
                $("saveEditResourceBtn") ||
                form.querySelector(
                    'button[type="submit"]'
                );

            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent =
                    "Saving...";
            }

            try {
                // Notes / TNP carry an optional ordered video list.
                // Skip it when the edit form could not load the stored
                // links, so a failed fetch never wipes them.
                if (category === "notes" || category === "tnp") {
                    const videoManager =
                        $("editResourceVideos");

                    if (
                        videoManager?.dataset.videoUnavailable !== "true"
                    ) {
                        values.videos =
                            collectVideos(videoManager);
                    }
                }

                await editRecord(
                    category,
                    id,
                    values,
                    newFile
                );

                closeModal();

                await reloadApplicationData();

                alert(
                    "Resource updated successfully."
                );

            } catch (error) {
                console.error(
                    "Edit resource error:",
                    error
                );

                alert(
                    getErrorMessage(error)
                );

            } finally {
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.textContent =
                        "Save Changes";
                }
            }
        }
    );
}

// =====================================================
// SEARCH EVENTS
// =====================================================

function setupSearchEvents() {
    const searchCategory =
        $("searchCategory");

    // -------------------------------------------------
    // Category dropdown (dashboard category state)
    // -------------------------------------------------

    searchCategory?.addEventListener(
        "change",
        async () => {
            const category =
                searchCategory.value ||
                "notes";

            await handleCategoryChange(
                category
            );
        }
    );
}

// =====================================================
// CATEGORY BUTTONS
// =====================================================

function setupCategoryButtons() {
    document
        .querySelectorAll(
            "[data-dashboard-category]"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                handleCategoryButtonClick
            );
        });
}

// =====================================================
// STUDENT SIDEBAR
// (page navigation is plain links between pages; only
// local preferences are handled here)
// =====================================================

function setupStudentSidebarEvents() {

    // Notification preference (stored locally)
    const notificationToggle = $("notificationSettingToggle");

    if (notificationToggle) {

        const savedPreference = window.localStorage.getItem(
            "campusnotes:notificationsEnabled"
        );

        if (savedPreference !== null) {
            notificationToggle.checked =
                savedPreference === "true";
        }

        notificationToggle.addEventListener(
            "change",
            () => {
                window.localStorage.setItem(
                    "campusnotes:notificationsEnabled",
                    String(notificationToggle.checked)
                );
            }
        );
    }
}
















// =====================================================
// PROFILE EVENTS
// =====================================================

function setupProfileEvents() {
    $("logoutBtn")?.addEventListener(
        "click",
        handleLogout
    );
}

// =====================================================
// ADMIN EVENTS
// =====================================================

function setupAdminEvents() {
    $("adminUploadType")?.addEventListener(
        "change",
        handleAdminUploadTypeChange
    );

    $("uploadNotesForm")?.addEventListener(
        "submit",
        handleNotesUpload
    );

    $("uploadTnpForm")?.addEventListener(
        "submit",
        handleTnpUpload
    );

    $("uploadPyqForm")?.addEventListener(
        "submit",
        handlePyqUpload
    );

    $("uploadTimetableForm")?.addEventListener(
        "submit",
        handleTimetableUpload
    );

    // Telegram Community Settings
    setupTelegramSettingsEvents();
}

// =====================================================
// TELEGRAM COMMUNITY SETTINGS
// =====================================================

async function handleTelegramLinkUpdate() {
    if (!isAdmin()) {
        alert(
            "Administrator access required."
        );

        return;
    }

    const input =
        $("telegramLinkInput");

    const button =
        $("updateTelegramLinkBtn");

    const message =
        $("telegramSettingsMessage");

    const newLink =
        input?.value?.trim() || "";

    if (!newLink) {
        if (message) {
            message.textContent =
                "Please enter a Telegram link.";

            message.className =
                "text-sm mt-3 min-h-5 text-red-600";
        }

        input?.focus();

        return;
    }

    try {
        if (button) {
            button.disabled = true;

            button.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Updating...';
        }

        if (message) {
            message.textContent = "";
        }

        const savedLink =
            await updateTelegramLink(
                newLink
            );

        if (message) {
            message.textContent =
                "Telegram link updated successfully.";

            message.className =
                "text-sm mt-3 min-h-5 text-green-600";
        }

    } catch (error) {
        console.error(
            "Telegram settings error:",
            error
        );

        if (message) {
            message.textContent =
                getErrorMessage(error);

            message.className =
                "text-sm mt-3 min-h-5 text-red-600";
        }

    } finally {
        if (button) {
            button.disabled = false;

            button.innerHTML =
                '<i class="fa-solid fa-rotate mr-2"></i> Update Link';
        }
    }
}

// =====================================================
// TELEGRAM SETTINGS EVENTS
// =====================================================

function setupTelegramSettingsEvents() {
    const button =
        $("updateTelegramLinkBtn");

    const input =
        $("telegramLinkInput");

    button?.addEventListener(
        "click",
        handleTelegramLinkUpdate
    );

    input?.addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                event.preventDefault();

                handleTelegramLinkUpdate();
            }
        }
    );

}



// =====================================================
// CUSTOM EVENTS
// =====================================================

function setupCustomEvents() {
    window.addEventListener(
        "campusnotes:refresh",
        handleDataRefresh
    );

    /*
     * campusnotes:delete-resource
     * is handled inside admin.js.
     *
     * Do NOT register another delete listener here.
     */
}

// =====================================================
// AUTH STATE LISTENER
// =====================================================

function setupAuthStateListener() {
    if (authListenerInitialized) {
        return;
    }

    authListenerInitialized = true;

    onAuthStateChange(
        async (
            event,
            session
        ) => {

            // ---------------------------------------------
            // LOGIN / SIGNUP
            // ---------------------------------------------

            if (
                event === "SIGNED_IN"
            ) {
                try {
                    await initializeAuthenticatedUser();

                } catch (error) {
                    console.error(
                        "Authenticated user initialization error:",
                        error
                    );
                }

                return;
            }

            // ---------------------------------------------
            // TOKEN REFRESH
            // ---------------------------------------------

            if (
                event === "TOKEN_REFRESHED"
            ) {
                return;
            }

            // ---------------------------------------------
            // USER UPDATED
            // ---------------------------------------------

            if (
                event === "USER_UPDATED"
            ) {
                if (session?.user) {
                    try {
                        await initializeAuthenticatedUser();

                    } catch (error) {
                        console.error(
                            "User update initialization error:",
                            error
                        );
                    }
                }

                return;
            }

            // ---------------------------------------------
            // SIGN OUT
            // ---------------------------------------------

            if (
                event === "SIGNED_OUT"
            ) {
                return;
            }
        }
    );
}

// =====================================================
// MAIN EVENT SETUP
// =====================================================

// =====================================================
// Admin/faculty panel switcher
// =====================================================
// Both dashboards stack their modules as [data-admin-panel]
// sections: admin.html keeps them inside #adminPanel,
// faculty.html wraps them in [data-admin-scope] (#facultyPanel).
// Show exactly one panel at a time.
//
// Exported for faculty.js: that page no longer carries a
// horizontal tab bar, so its sidebar hashes drive the panels
// through this function instead of clicking a tab button.
// =====================================================

export function activateAdminPanel(tab) {
    const panels = document.querySelector("[data-admin-scope]")
        ? document.querySelectorAll(
            "[data-admin-scope] [data-admin-panel]"
        )
        : document.querySelectorAll("#adminPanel [data-admin-panel]");

    panels.forEach(panel => {
        panel.classList.toggle(
            "hidden",
            panel.dataset.adminPanel !== tab
        );
    });
}

// =====================================================
// Admin panel tabs (admin.html)
// =====================================================

function setupAdminTabs() {
    const bar = document.querySelector("[data-admin-tabbar]");

    if (!bar) {
        // faculty.html: no tab bar anymore - the sidebar hashes
        // (faculty.js) switch the panels via activateAdminPanel().
        return;
    }

    // admin.html keeps every panel inside #adminPanel; the shared
    // switcher above resolves the scope for both dashboards.
    const activate = tab => {
        bar.querySelectorAll("[data-admin-tab]").forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset.adminTab === tab
            );
        });

        activateAdminPanel(tab);
    };

    bar.addEventListener("click", event => {
        const button = event.target.closest("[data-admin-tab]");

        if (!button) {
            return;
        }

        activate(button.dataset.adminTab);

        // Leaving a deep-linked panel (admin.html#users|#faculty|
        // #payments): drop the sidebar hash so a reload lands on
        // the tab just clicked instead of the linked module.
        if (isAdminPage && window.location.hash) {
            history.replaceState(
                null,
                "",
                window.location.pathname
            );
        }
    });

    // =====================================================
    // DEEP LINKS (admin.html only)
    // =====================================================
    //
    // Users / Manage Faculty / Payments / Settings no longer
    // live in the top tab bar - the sidebar carries them and
    // links to admin.html#users | #faculty | #payments |
    // #settings. Honour those hashes on load and on every hash
    // change (back/forward, clicking another sidebar quick
    // link), activating the matching panel exactly like the
    // old tab click did. faculty.html keeps its own hash
    // engine (faculty.js).
    // =====================================================

    const isAdminPage = document.body?.dataset.page === "admin";

    // Same panel resolution the shared switcher above uses.
    const pagePanels = () => document.querySelector("[data-admin-scope]")
        ? document.querySelectorAll("[data-admin-scope] [data-admin-panel]")
        : document.querySelectorAll("#adminPanel [data-admin-panel]");

    const panelExists = tab => Array.from(pagePanels())
        .some(panel => panel.dataset.adminPanel === tab);

    const tabFromHash = () => {
        const hash = String(window.location.hash || "")
            .replace(/^#/, "");

        return hash && panelExists(hash) ? hash : null;
    };

    // Open the tab marked active in the HTML (Content) unless a
    // sidebar deep link names another panel.
    const initial =
        bar.querySelector("[data-admin-tab].active") ||
        bar.querySelector("[data-admin-tab]");

    let initialTab = initial ? initial.dataset.adminTab : "content";

    if (isAdminPage && tabFromHash()) {
        initialTab = tabFromHash();
    }

    activate(initialTab);

    if (isAdminPage) {
        window.addEventListener("hashchange", () => {
            // The listener outlives admin.html only in theory,
            // but guard anyway once the panel is gone.
            if (!document.getElementById("adminPanel")) {
                return;
            }

            activate(tabFromHash() || "content");
        });
    }
}

export function setupEvents() {
    if (eventsInitialized) {
        return;
    }

    eventsInitialized = true;

    // =================================================
    // INITIAL AUTH UI
    // =================================================

    // Always start on the unified login view (role tabs,
    // not the signup fields).
    setSignupMode(false);

    resetAuthForm();

    updateAuthRoleUI();

    // Keep existing UI auth mode setup if available.
    try {
        updateAuthModeUI();
    } catch (error) {
        console.warn(
            "updateAuthModeUI could not be executed:",
            error
        );
    }

    // =================================================
    // DEEP LINKS
    // login.html?mode=signup        -> open on signup
    // login.html?mode=signup&role=faculty
    //                               -> faculty signup
    // =================================================

    if ($("authForm")) {
        const authParams =
            new URLSearchParams(window.location.search);

        if (authParams.get("mode") === "signup") {
            setSignupMode(true);

            setSignupRole(
                authParams.get("role") === "faculty"
                    ? "faculty"
                    : "student"
            );

            resetAuthForm();
            updateAuthRoleUI();
            updateRegistrationFields();
        }
    }

    // =================================================
    // AUTH
    // =================================================

    $("authForm")?.addEventListener(
        "submit",
        handleAuthSubmit
    );

    $("toggleAuthMode")?.addEventListener(
        "click",
        handleAuthModeToggle
    );

    $("toggleAuthMode")?.addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleAuthModeToggle(event);
            }
        }
    );

    $("forgotPasswordBtn")?.addEventListener(
        "click",
        handleForgotPassword
    );

    // =================================================
    // LOGIN ROLE TABS (Student / Faculty / Admin)
    // =================================================

    setupLoginRoleTabs();

    // =================================================
    // ESCAPE CLOSES OPEN OVERLAYS
    // =================================================

    setupModalKeyboardShortcuts();

    // =================================================
    // FIELDS
    // =================================================

    setupPasswordToggle();

    setupRegistrationEvents();

    setupAdminFieldEvents();

    // =================================================
    // SEARCH
    // =================================================

    setupSearchEvents();

    // =================================================
    // CATEGORY NAVIGATION
    // =================================================

    setupCategoryButtons();

    // =================================================
    // PROFILE
    // =================================================

    setupProfileEvents();

    // =================================================
// STUDENT SIDEBAR
// =================================================

setupStudentSidebarEvents();

    // =================================================
    // ADMIN
    // =================================================

    setupAdminEvents();

    // Related Video Links managers (admin + faculty Notes/TNP forms).
    // Idempotent and self-guarded: no-ops on pages without them.
    setupVideoManagers();

    // Student "Videos" pill -> on-demand related-videos modal.
    setupRelatedVideosModal();

    // =================================================
    // COMMERCE (courses page + payment approvals)
    // =================================================

    setupCommerceEvents();

    // =================================================
    // ADMIN TABS + USERS
    // =================================================

    setupAdminTabs();

    setupAdminUsers();

    // =================================================
    // EDIT MODAL
    // =================================================

    setupEditModalEvents();

    // =================================================
    // MOBILE
    // =================================================

    setupMobileSidebar();

    // =================================================
    // CUSTOM EVENTS
    // =================================================

    setupCustomEvents();

    // =================================================
    // RENDER ACTIONS
    // =================================================

    setupRenderActions();

    // =================================================
    // ADMIN DYNAMIC ACTIONS
    // =================================================

    setupAdminDynamicActions();

    // =================================================
    // AUTH STATE
    // =================================================

    setupAuthStateListener();
}


