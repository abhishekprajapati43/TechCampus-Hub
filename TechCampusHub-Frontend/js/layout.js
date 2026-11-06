// =====================================================
// TechCampus_Hub
// layout.js
//
// Renders the shared page chrome (sidebar, header,
// modals) on every protected page and marks the
// active navigation item for the current page.
// =====================================================

const NAV_ID_BY_PAGE = {
    dashboard: "dashboardHomeBtn",
    notifications: "notificationsBtn",
    favorites: "favoritesBtn",
    courses: "coursesBtn",
    syllabus: "syllabusBtn",
    admin: "adminNavBtn",
    // faculty.html lives inside the faculty workspace group,
    // so the Dashboard quick link carries the active state.
    faculty: "facultyDashboardNavBtn",
    paymentHistory: "paymentHistoryBtn",
    certificates: "certificatesBtn",
    feedback: "feedbackBtn"
};

async function fetchPartial(path) {
    const response = await fetch(path);

    if (!response.ok) {
        throw new Error(
            `Could not load ${path} (${response.status})`
        );
    }

    return await response.text();
}

export async function renderLayout(page) {
    const chrome = document.getElementById("pageChrome");
    const headerSlot = document.getElementById("pageHeader");

    if (!chrome || !headerSlot) {
        return;
    }

    const [sidebarHtml, modalsHtml, headerHtml] =
        await Promise.all([
            fetchPartial("./partials/sidebar.html"),
            fetchPartial("./partials/modals.html"),
            fetchPartial("./partials/header.html")
        ]);

    chrome.innerHTML =
        `${sidebarHtml}\n${modalsHtml}`;

    headerSlot.innerHTML = headerHtml;

    applyHeaderBranding(page);

    markActiveNav(page);
}

// =====================================================
// Header Branding
// =====================================================

//
// Every page keeps the default TechCampus_Hub brand;
// only the admin dashboard greets the signed-in admin.
// Lookups are null-guarded so shared chrome that was
// trimmed down cannot break the render.
//

function applyHeaderBranding(page) {
    if (page !== "admin") {
        return;
    }

    const headerTitle =
        document.getElementById("headerTitle");

    const headerSubtitle =
        document.getElementById("headerSubtitle");

    if (headerTitle) {
        headerTitle.textContent = "Welcome Admin";
    }

    if (headerSubtitle) {
        headerSubtitle.textContent = "Admin Dashboard";
    }
}

function markActiveNav(page) {
    document
        .querySelectorAll("#sidebar .nav-item")
        .forEach(item => {
            item.classList.remove("active");
        });

    const activeId = NAV_ID_BY_PAGE[page];

    if (activeId) {
        document
            .getElementById(activeId)
            ?.classList.add("active");
    }
}
