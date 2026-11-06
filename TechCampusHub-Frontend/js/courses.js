// =====================================================
// TechCampus_Hub
// courses.js
//
// Course catalog, manual UPI purchases (admin approval),
// note-bundle gating and the shared commerce UI wiring.
//
// Storage: Spring Boot backend (/api/courses, /api/purchases,
// /api/settings). When the backend is unreachable the module
// falls back to the bundled catalog data (read-only) so the
// storefront still renders.
// =====================================================

import { $, escapeHtml, formatDate, getIdentity, updateNoticeBox } from "./helpers.js";
import { currentUserRole, currentStudent } from "./state.js";

import {
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    getStoredUser,
    normalizeCourse,
    normalizePurchase,
    normalizeSettings,
    courseToRequest,
    settingsToRequest,
    approvePurchaseWithValidity,
    setPurchaseValidity,
    getCourseRating,
    getCourseReviews,
    submitCourseReview,
    getSecondCourseOffer
} from "./api.js";

// =====================================================
// Constants
// =====================================================

export const DEFAULT_UPi_ID = "techcampushub@upi";

const UPi_STORAGE_KEY = "campusnotes:upiId";
const PURCHASES_STORAGE_KEY = "campusnotes:purchases";
const COURSES_LOCAL_KEY = "campusnotes:courses";

// 1+1 second-course offer: display fallback for the backend's
// discountPercent (the server value always wins when present).
const SECOND_COURSE_DISCOUNT_PERCENT = 50;

// Catalog used when the courses table does not exist yet.
const FALLBACK_COURSES = [
    {
        id: "local-mca-notes",
        slug: "mca-notes-bundle",
        title: "MCA Complete Notes Bundle",
        description: "Every semester's subject notes for MCA — organized by semester and subject, PDF downloads.",
        price_inr: 499,
        mrp_inr: 1499,
        highlights: [
            "All MCA semesters",
            "Subject-wise PDF notes",
            "Lifetime access after approval",
            "New notes added regularly"
        ]
    },
    {
        id: "local-btech-notes",
        slug: "btech-cse-notes-bundle",
        title: "B.Tech CSE Notes Bundle",
        description: "Semester notes for Computer Science & Engineering — core subjects, units and topic notes.",
        price_inr: 599,
        mrp_inr: 1999,
        highlights: [
            "All CSE semesters",
            "Unit-wise notes",
            "Lifetime access after approval",
            "New notes added regularly"
        ]
    },
    {
        id: "local-bca-notes",
        slug: "bca-notes-bundle",
        title: "BCA Complete Notes Bundle",
        description: "Every semester's subject notes for BCA — organized by semester and subject, PDF downloads.",
        price_inr: 499,
        mrp_inr: 1499,
        highlights: [
            "All BCA semesters",
            "Subject-wise PDF notes",
            "Lifetime access after approval",
            "New notes added regularly"
        ]
    },
    {
        id: "local-pyq-pack",
        slug: "pyq-mastery-pack",
        title: "Previous Year Papers (PYQ) Pack",
        description: "Previous year question papers with solutions — sorted by course, year and semester.",
        price_inr: 199,
        mrp_inr: 699,
        highlights: [
            "Years of question papers",
            "Course + semester sorted",
            "One-time payment",
            "Lifetime access"
        ]
    }
];

// =====================================================
// Module state
// =====================================================

let coursesCache = null;
let adminCoursesCache = null;     // every course, hidden ones included
let coursesMode = "cloud";        // "cloud" | "fallback"
let purchasesCache = [];          // current user's purchases
let ownershipLoaded = false;
let offerCache = null;            // 1+1 second-course offer snapshot
let offerLoaded = false;

// refreshOwnership() is fanned out by several independent boot-time
// renders (dashboard access line, purchase table, notification
// filtering) that all need the same snapshot - coalesce concurrent
// callers into ONE request and skip redundant refetches while the
// snapshot is fresh. Purchase mutations pass { force: true }.
let ownershipInFlight = null;
let ownershipLastLoadedAt = 0;
const OWNERSHIP_FRESH_MS = 10000;

// =====================================================
// Helpers
// =====================================================

export function formatPrice(value) {
    const amount = Number(value) || 0;

    if (amount <= 0) {
        return "Free";
    }

    return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * Like formatPrice but keeps paise for discounted amounts
 * (₹249.50); whole rupees stay compact (₹499).
 */
export function formatAmount(value) {
    const amount = Number(value) || 0;

    if (amount <= 0) {
        return "Free";
    }

    const hasFraction = amount % 1 !== 0;

    return `₹${amount.toLocaleString("en-IN", hasFraction
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : {})}`;
}

// =====================================================
// 1+1 second-course offer
// =====================================================
//
// Cached snapshot from GET /api/purchases/offer. Invalidated
// by refreshOwnership() whenever the student's purchases
// change, and falls back to "no offer" when the backend is
// unreachable so the storefront still renders.
// =====================================================

async function loadOffer(force = false) {
    if (offerLoaded && !force) {
        return offerCache;
    }

    try {
        const data = await getSecondCourseOffer();

        offerCache = data && typeof data === "object" ? data : null;
    } catch (error) {
        console.error("Offer loading error:", error);

        offerCache = null;
    }

    offerLoaded = true;

    return offerCache;
}

/**
 * Discounted price for a course (card or checkout), or null when
 * the 1+1 offer does not apply: not at the second-course stage,
 * the course is already owned, or the course is free. Display
 * only - the backend recomputes the real discount on submit.
 */
function offerPriceFor(course) {
    const offer = offerCache;

    if (!offer?.eligible || !course) {
        return null;
    }

    const original = Number(course.price_inr) || 0;

    if (original <= 0) {
        return null;
    }

    const owned = Array.isArray(offer.ownedCourseIds)
        ? offer.ownedCourseIds.map(Number)
        : [];

    if (owned.includes(Number(course.id))) {
        return null;
    }

    const percent = Number(offer.discountPercent) || SECOND_COURSE_DISCOUNT_PERCENT;
    const discounted = original * (1 - percent / 100);

    return discounted > 0 ? Math.round(discounted * 100) / 100 : null;
}

// =====================================================
// 1+1 offer announcement banner
// =====================================================
//
// Awareness strip above the course grid. Tells every signed-in
// student the offer rule up front ("buy one course, your second
// one is 50% off"), flips to a highlighted live state while they
// are at the second-course stage, and stays visible afterwards
// as a plain program announcement. Hidden for faculty/admin and
// whenever the offer snapshot is unavailable (logged out,
// backend down). Display only - eligibility comes from the
// backend and the server re-checks it on every purchase.
// =====================================================

function renderOfferBanner() {
    const banner = $("courseOfferBanner");

    if (!banner) {
        return;
    }

    // Role comes from the live state binding when auth init has
    // finished, or from the stored session otherwise (render can
    // race the async /me call). Casing varies between the two.
    const role = String(
        currentUserRole || getStoredUser()?.role || ""
    ).toLowerCase();

    if (!offerCache || role === "faculty" || role === "admin") {
        banner.classList.add("hidden");

        return;
    }

    const title = $("courseOfferBannerTitle");
    const text = $("courseOfferBannerText");
    const pill = $("courseOfferBannerPill");
    const eligible = offerCache.eligible === true;

    if (eligible) {
        title.textContent =
            "Your 50% OFF second-course offer is ready to use!";
        text.textContent =
            "You already own one course - every other course below that " +
            "you have not bought yet is half price, applied automatically " +
            "at checkout.";
        pill.classList.remove("hidden");
    } else {
        title.textContent =
            "1+1 Offer - buy one course, get 50% OFF on your second";
        text.textContent =
            "Purchase your first course and get it approved. Your next " +
            "different course then automatically costs half price at " +
            "checkout - no coupon needed.";

        pill.classList.add("hidden");
    }

    banner.classList.remove("hidden");
}

function localRead(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.warn("Local storage read failed:", error);
        return fallback;
    }
}

function localWrite(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error("Local storage write failed:", error);
        return false;
    }
}

// =====================================================
// Course catalog
// =====================================================

export async function loadCourses(force = false) {
    if (coursesCache && !force) {
        return coursesCache;
    }

    try {
        const rows = await apiGet("/api/courses", false);

        // A successful response is authoritative even when it is
        // empty: an empty catalog means "no courses published yet",
        // not "backend offline". Falling back to the bundled demo
        // catalog here used to show fake courses whose string ids
        // could never be purchased. Only a real request failure
        // switches to the offline catalog below.
        coursesMode = "cloud";
        coursesCache = (Array.isArray(rows) ? rows : []).map(normalizeCourse);
    } catch (error) {
        console.error("Courses loading error:", error);

        coursesMode = "fallback";
        coursesCache = loadLocalCourses();
    }

    return coursesCache;
}

/**
 * Admin catalog: GET /api/admin/courses returns EVERY course, including
 * hidden/inactive ones. The public /api/courses list only carries active
 * courses, so using it on admin.html made a hidden course impossible to
 * find, edit or re-activate. Falls back to the public list when the admin
 * endpoint is unavailable (e.g. the caller is not an admin).
 */
export async function loadAdminCourses(force = false) {
    if (adminCoursesCache && !force) {
        return adminCoursesCache;
    }

    try {
        const rows = await apiGet("/api/admin/courses");

        adminCoursesCache = (Array.isArray(rows) ? rows : [])
            .map(normalizeCourse);
    } catch (error) {
        console.error("Admin courses loading error:", error);

        adminCoursesCache = await loadCourses(force);
    }

    return adminCoursesCache;
}

/**
 * Drop both catalogs and refetch them. A create/update/delete can change
 * the public list (a course was hidden/shown) and the admin list at the
 * same time, and leaving either cache stale makes the UI disagree with
 * the backend until a full reload.
 */
async function refreshCourseCaches() {
    coursesCache = null;
    adminCoursesCache = null;

    await Promise.all([
        loadCourses(true),
        loadAdminCourses(true)
    ]);
}

/** Admin-side lookup that also finds hidden/inactive courses. */
async function findCourseForAdmin(courseId) {
    const courses = await loadAdminCourses();

    return courses.find(
        course => String(course.id) === String(courseId)
    ) || courseById(courseId);
}

// Local (offline) catalog: reads any browser-stored catalog
// first, then falls back to the bundled demo courses.
function loadLocalCourses() {
    const stored = localRead(COURSES_LOCAL_KEY, null);

    if (Array.isArray(stored) && stored.length) {
        return stored.map(course => ({ ...course }));
    }

    return FALLBACK_COURSES.map(course => ({ ...course }));
}

export function courseById(courseId) {
    if (!courseId) {
        return null;
    }

    const list = coursesCache || [];

    const found = list.find(
        course => String(course.id) === String(courseId)
    );

    if (found) {
        return found;
    }

    // A hidden course is absent from the public catalog but still needs a
    // readable title (purchases table, bundle dropdown, admin edit form).
    return (adminCoursesCache || []).find(
        course => String(course.id) === String(courseId)
    ) || null;
}

export function courseTitleFor(courseId) {
    const course = courseById(courseId);

    return course ? course.title : "Paid course bundle";
}

// =====================================================
// Course management (admin)
// Launch, edit, delete, price and validity.
// =====================================================

function slugify(value) {
    return (
        String(value || "")
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "course"
    );
}

function uniqueSlug(base, existing) {
    const taken = new Set(
        existing.map(course => String(course.slug || ""))
    );

    let slug = base;
    let counter = 2;

    while (taken.has(slug)) {
        slug = `${base}-${counter}`;
        counter += 1;
    }

    return slug;
}

/**
 * Optional compare-at (MRP) price: blank, 0 or unusable input all mean
 * "no discount", which the backend stores as a NULL mrp_inr.
 */
function optionalMrp(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }

    const amount = Math.max(0, Number(value) || 0);

    return amount > 0 ? amount : null;
}

export async function createCourse(fields) {
    const title = String(fields.title || "").trim();

    if (!title) {
        throw new Error("Course title is required.");
    }

    const courses = await loadAdminCourses(true);

    const row = {
        slug: uniqueSlug(
            slugify(fields.slug || title),
            courses
        ),
        title,
        description: String(fields.description || "").trim(),
        price_inr: Math.max(0, Number(fields.price_inr) || 0),
        mrp_inr: optionalMrp(fields.mrp_inr),
        validity_days: Math.max(1, Number(fields.validity_days) || 365),
        highlights: Array.isArray(fields.highlights)
            ? fields.highlights.filter(Boolean)
            : [],
        sort_order: Number(fields.sort_order) || courses.length + 1,
        is_active: fields.is_active !== false
    };

    const created = await apiPost(
        "/api/admin/courses",
        courseToRequest(row)
    );

    await refreshCourseCaches();

    await notifyCourseLaunch(title, row.description);

    return normalizeCourse(created);
}

// "New course launched" alert for every student.
async function notifyCourseLaunch(title, detail) {
    try {
        const { notifyContentUpload } = await import("./notifications.js");

        await notifyContentUpload("course", title, detail);
    } catch (alertError) {
        console.warn("Course notification failed:", alertError);
    }
}

export async function updateCourse(courseId, fields) {
    const patch = {};

    if (fields.title !== undefined) {
        const title = String(fields.title || "").trim();

        if (!title) {
            throw new Error("Course title is required.");
        }

        patch.title = title;
    }

    if (fields.description !== undefined) {
        patch.description = String(fields.description || "").trim();
    }

    if (fields.price_inr !== undefined) {
        patch.price_inr = Math.max(0, Number(fields.price_inr) || 0);
    }

    // Sent even when blank so clearing the MRP field clears the stored
    // discount (the backend applies an explicit null unconditionally).
    if (fields.mrp_inr !== undefined) {
        patch.mrp_inr = optionalMrp(fields.mrp_inr);
    }

    if (fields.validity_days !== undefined) {
        patch.validity_days = Math.max(1, Number(fields.validity_days) || 365);
    }

    if (fields.highlights !== undefined) {
        patch.highlights = Array.isArray(fields.highlights)
            ? fields.highlights.filter(Boolean)
            : [];
    }

    if (fields.is_active !== undefined) {
        patch.is_active = Boolean(fields.is_active);
    }

    // The backend PUT needs the required fields (title, price), so the
    // patch is merged onto the current course before sending. The lookup
    // goes through the admin catalog so hidden/inactive courses (missing
    // from the public list) can be edited and re-activated.
    const existing = await findCourseForAdmin(courseId);

    if (!existing) {
        throw new Error("Course not found.");
    }

    const updated = await apiPut(
        `/api/admin/courses/${courseId}`,
        courseToRequest({ ...existing, ...patch })
    );

    await refreshCourseCaches();

    return normalizeCourse(updated);
}

export async function deleteCourse(courseId) {
    await apiDelete(
        `/api/admin/courses/${courseId}`
    );

    await refreshCourseCaches();
}

// =====================================================
// Purchases — current user
// =====================================================

async function fetchOwnership() {
    ownershipLoaded = true;
    purchasesCache = [];
    // Purchases drive the 1+1 offer eligibility; re-fetch it on
    // the next ask instead of serving a stale snapshot.
    offerLoaded = false;

    const identity = await getIdentity();

    if (!identity.id) {
        ownershipLastLoadedAt = Date.now();
        return purchasesCache;
    }

    try {
        const rows = await apiGet("/api/purchases/mine");

        purchasesCache = (Array.isArray(rows) ? rows : [])
            .map(normalizePurchase);
    } catch (error) {
        console.error("Purchases loading error:", error);

        const all = localRead(PURCHASES_STORAGE_KEY, []);
        purchasesCache = all.filter(
            row => String(row.user_id) === String(identity.id)
        );
    }

    ownershipLastLoadedAt = Date.now();
    return purchasesCache;
}

export async function refreshOwnership({ force = false } = {}) {
    // Concurrent callers share ONE in-flight request; a snapshot
    // younger than OWNERSHIP_FRESH_MS is served without refetching.
    if (ownershipInFlight) {
        return ownershipInFlight;
    }

    if (
        !force
        && ownershipLastLoadedAt
        && Date.now() - ownershipLastLoadedAt < OWNERSHIP_FRESH_MS
    ) {
        return purchasesCache;
    }

    ownershipInFlight = fetchOwnership().finally(() => {
        ownershipInFlight = null;
    });

    return ownershipInFlight;
}

export function getPurchaseFor(courseId) {
    if (!courseId) {
        return null;
    }

    return purchasesCache.find(
        row => String(row.course_id) === String(courseId)
    ) || null;
}

export function purchaseStatusFor(courseId) {
    const purchase = getPurchaseFor(courseId);

    return purchase ? purchase.status : null;
}

// A purchase stops unlocking content once the course
// validity (expires_at) has passed.
export function purchaseExpired(purchase) {
    if (!purchase || !purchase.expires_at) {
        return false;
    }

    return new Date(purchase.expires_at).getTime() <= Date.now();
}

// True while the student holds at least one approved,
// unexpired purchase (premium-only notifications).
export function hasActivePremium() {
    return purchasesCache.some(
        row => row.status === "approved" && !purchaseExpired(row)
    );
}

// A note is locked when it belongs to a paid bundle the
// student has not purchased or the purchase expired
// (admins always see everything).
export function isNoteLocked(note) {
    if (!note || !note.course_id) {
        return false;
    }

    if (currentUserRole === "admin") {
        return false;
    }

    const purchase = getPurchaseFor(note.course_id);

    return !(
        purchase &&
        purchase.status === "approved" &&
        !purchaseExpired(purchase)
    );
}

export async function submitPurchase({ course, utr }) {
    const identity = await getIdentity();

    if (!identity.id) {
        throw new Error("Please log in before purchasing a course.");
    }

    const trimmedUtr = String(utr || "").trim();

    if (trimmedUtr.length < 6) {
        throw new Error(
            "Please enter the transaction reference (UTR) with at least 6 characters."
        );
    }

    // The backend stores courses with numeric ids. The offline
    // fallback catalog uses string ids (e.g. "local-mca-notes")
    // which cannot be purchased. Catch that here for a clear
    // message instead of a confusing backend 400.
    const courseId = Number(course.id);

    if (!courseId) {
        throw new Error(
            "This course is not available for purchase right now. Please refresh the page and try again."
        );
    }

    const data = await apiPost(
        "/api/purchases",
        {
            courseId,
            utr: trimmedUtr
        }
    );

    const row = normalizePurchase(data);

    // A new purchase changes ownership - bypass the freshness window.
    await refreshOwnership({ force: true });

    return row;
}

// =====================================================
// Purchases — admin
// =====================================================

export async function loadAllPurchases() {
    try {
        const rows = await apiGet("/api/admin/purchases");

        return {
            rows: (Array.isArray(rows) ? rows : []).map(normalizePurchase),
            mode: "cloud"
        };
    } catch (error) {
        console.error("Admin purchases loading error:", error);

        return {
            rows: localRead(PURCHASES_STORAGE_KEY, []),
            mode: "local"
        };
    }
}

export async function setPurchaseStatus(purchaseId, status) {
    const normalized = status === "approved" ? "approved" : "rejected";

    // The backend computes the expiry window (course validity) on approval.
    const data = normalized === "approved"
        ? await apiPost(`/api/admin/purchases/${purchaseId}/approve`)
        : await apiPost(`/api/admin/purchases/${purchaseId}/reject`, {});

    return normalizePurchase(data);
}

// Admin: push the expiry further out (extend course expiry).
export async function extendPurchaseExpiry(purchaseId, days = 30) {
    const amount = Number(days) > 0 ? Number(days) : 30;

    const data = await apiPost(
        `/api/admin/purchases/${purchaseId}/extend-validity`,
        { days: amount }
    );

    return normalizePurchase(data);
}

// Admin: remove a purchase record entirely.
export async function deletePurchase(purchaseId) {
    await apiDelete(
        `/api/admin/purchases/${purchaseId}`
    );
}

// =====================================================
// UPI ID (site settings, localStorage fallback)
// =====================================================

export async function getUpiId() {
    try {
        const settings = normalizeSettings(
            await apiGet("/api/settings", false)
        );

        if (settings?.upi_id) {
            return settings.upi_id;
        }
    } catch (error) {
        console.error("Settings loading error:", error);
    }

    const localValue = localRead(UPi_STORAGE_KEY, null);

    return localValue || DEFAULT_UPi_ID;
}

export async function saveUpiId(value) {
    const trimmed = String(value || "").trim();

    if (!trimmed) {
        throw new Error("UPI ID cannot be empty.");
    }

    const settings = normalizeSettings(
        await apiPut(
            "/api/settings",
            settingsToRequest({ upi_id: trimmed })
        )
    );

    localWrite(UPi_STORAGE_KEY, trimmed);

    return { mode: "cloud", upiId: settings?.upi_id || trimmed };
}

export function buildUpiLink({ upiId, amount, title }) {
    const params = new URLSearchParams({
        pa: upiId,
        pn: "TechCampus_Hub",
        am: String(Number(amount) || 0),
        cu: "INR",
        tn: String(title || "Course purchase")
    });

    return `upi://pay?${params.toString()}`;
}

// =====================================================
// Admin upload form: assign notes to a paid bundle
// =====================================================

export async function populateBundleSelect(selectElement) {
    if (!selectElement || selectElement.dataset.loaded === "1") {
        return;
    }

    // Admin upload form: the dropdown must also offer hidden bundles so
    // content can be attached before a course is made visible.
    const courses = await loadAdminCourses();

    const placeholder = selectElement.querySelector("option[value='']");

    if (placeholder) {
        placeholder.textContent = "Free — no bundle";
    }

    if (coursesMode !== "cloud") {
        selectElement.disabled = true;
        selectElement.dataset.loaded = "1";

        const option = document.createElement("option");
        option.textContent = "Available when the backend is offline";
        selectElement.append(option);

        return;
    }

    courses.forEach(course => {
        const option = document.createElement("option");
        option.value = course.id;
        option.textContent = `${course.title} (${formatPrice(course.price_inr)})`;
        selectElement.append(option);
    });

    selectElement.dataset.loaded = "1";
}

// =====================================================
// Page rendering — courses.html
// =====================================================

function statusBadge(courseId) {
    const status = purchaseStatusFor(courseId);

    if (status === "approved") {
        const purchase = getPurchaseFor(courseId);

        if (purchaseExpired(purchase)) {
            return `
                <span class="inline-flex items-center gap-2 rounded-lg bg-red-50
                         px-3 py-1.5 text-sm font-bold text-red-600">
                    <i class="fa-solid fa-hourglass-end"></i>
                    Expired
                </span>
            `;
        }

        return `
            <span class="inline-flex items-center gap-2 rounded-lg bg-emerald-50
                         px-3 py-1.5 text-sm font-bold text-emerald-700">
                <i class="fa-solid fa-circle-check"></i>
                Purchased
            </span>
        `;
    }

    if (status === "pending") {
        return `
            <span class="inline-flex items-center gap-2 rounded-lg bg-amber-50
                         px-3 py-1.5 text-sm font-bold text-amber-700">
                <i class="fa-regular fa-clock"></i>
                Awaiting approval
            </span>
        `;
    }

    return "";
}

// =====================================================
// Course validity (pre-purchase visibility)
// =====================================================

/**
 * "30 Days" / "365 Days" / "Lifetime Access" straight from the
 * course row - admins and faculty set validity_days per course,
 * so nothing here is hardcoded. A missing/zero value only occurs
 * on legacy or local-fallback courses and reads as lifetime.
 */
export function courseValidityLabel(course) {
    const days = Number(course?.validity_days);

    if (!Number.isFinite(days) || days <= 0) {
        return "Lifetime Access";
    }

    return `${days} Day${days === 1 ? "" : "s"}`;
}

async function renderCourseGrid() {
    const grid = $("courseGrid");

    if (!grid) {
        return;
    }

    const courses = await loadCourses();

    // 1+1 second-course offer snapshot (cached; no-ops offline).
    await loadOffer();

    // Offer awareness strip above the grid (states follow offerCache).
    renderOfferBanner();

    if (!courses.length) {
        grid.innerHTML = `
            <p class="text-slate-500">No courses available yet.</p>
        `;
        return;
    }

    grid.innerHTML = courses.map(course => {
        const status = purchaseStatusFor(course.id);

        // 1+1 offer: struck-through list price + discounted price on
        // the card while the student is at the second-course stage.
        const offerPrice = offerPriceFor(course);
        const price = offerPrice != null
            ? formatAmount(offerPrice)
            : formatPrice(course.price_inr);
        const purchase = getPurchaseFor(course.id);
        const expired = purchase ? purchaseExpired(purchase) : false;

        let action = `
            <button
                type="button"
                class="buy-course-btn w-full rounded-xl bg-blue-600 hover:bg-blue-700
                       text-white font-bold py-3 transition"
                data-course-id="${escapeHtml(String(course.id))}"
            >
                Buy now — ${escapeHtml(price)}
            </button>
        `;

        if (expired) {
            action = `
                <button
                    type="button"
                    class="buy-course-btn w-full rounded-xl bg-blue-600 hover:bg-blue-700
                           text-white font-bold py-3 transition"
                    data-course-id="${escapeHtml(String(course.id))}"
                >
                    Renew — ${escapeHtml(price)}
                </button>
            `;
        } else if (status === "approved") {
            action = `
                <a href="./dashboard.html?category=notes"
                   class="block w-full text-center rounded-xl bg-emerald-600 hover:bg-emerald-700
                          text-white font-bold py-3 transition">
                    <i class="fa-solid fa-book-open mr-2"></i>Browse my notes
                </a>
            `;
        } else if (status === "pending") {
            action = `
                <button type="button" disabled
                    class="w-full rounded-xl bg-amber-100 text-amber-700
                           font-bold py-3 cursor-not-allowed">
                    <i class="fa-regular fa-clock mr-2"></i>Waiting for approval
                </button>
            `;
        }

        const highlights = (course.highlights || [])
            .map(item => `
                <li class="flex items-start gap-2 text-sm text-slate-600">
                    <i class="fa-solid fa-check text-emerald-500 mt-1"></i>
                    <span>${escapeHtml(item)}</span>
                </li>
            `)
            .join("");

        // Purchase expiry shown right on the student's course card.
        let expiryLine = "";

        if (status === "approved" && purchase?.expires_at) {
            expiryLine = `
                <p class="mt-3 text-xs font-semibold
                          ${expired ? "text-red-600" : "text-emerald-600"}">
                    <i class="fa-regular fa-clock mr-1"></i>
                    ${expired ? "Expired on" : "Valid until"}
                    ${escapeHtml(formatExpiryDateTime(purchase.expires_at))}
                </p>
            `;
        }

        const ratingHtml = ratingBadgeHtml(course);

        const offerBadge = offerPrice != null
            ? `
                <div class="mt-4 rounded-xl bg-orange-50 border border-orange-200
                           px-3 py-2 text-center text-xs font-extrabold text-orange-700">
                    <i class="fa-solid fa-tag mr-1"></i>50% OFF — Second Course Offer
                </div>
            `
            : "";

        return `
            <article class="card p-6 flex flex-col">
                <div class="flex items-start justify-between gap-3">
                    <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600
                                flex items-center justify-center text-xl shrink-0">
                        <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                    ${statusBadge(course.id)}
                </div>
                <h3 class="mt-4 text-lg font-extrabold text-slate-900">
                    ${escapeHtml(course.title)}
                </h3>
                ${ratingHtml}
                <p class="mt-2 text-sm text-slate-500">
                    ${escapeHtml(course.description || "")}
                </p>
                <ul class="mt-4 space-y-2 flex-1">
                    ${highlights}
                </ul>
                ${offerBadge}
                <div class="mt-5 flex items-end justify-between gap-3">
                    <div>
                        <p class="text-xs uppercase tracking-wide text-slate-400 font-bold">
                            One-time${offerPrice != null
                                ? ` · <span class="text-orange-600">50% OFF</span>`
                                : ""}
                        </p>
                        <p class="text-2xl font-extrabold text-slate-900">
                            ${offerPrice != null
                                ? `<span class="text-sm font-bold text-slate-400
                                            line-through mr-2">${escapeHtml(formatAmount(course.price_inr))}</span>`
                                : ""}${escapeHtml(price)}
                        </p>
                        <p class="mt-1 text-xs font-bold text-slate-500">
                            <i class="fa-regular fa-clock mr-1"></i>Validity: ${escapeHtml(courseValidityLabel(course))}
                        </p>
                    </div>
                    <button type="button"
                        class="reviews-trigger-btn text-xs font-bold text-slate-500
                               hover:text-blue-600 underline underline-offset-2"
                        data-course-id="${escapeHtml(String(course.id))}"
                        data-course-title="${escapeHtml(course.title)}">
                        Reviews
                    </button>
                </div>
                <div class="mt-4">
                    ${action}
                </div>
                ${expiryLine}
            </article>
        `;
    }).join("");
}

// =====================================================
// Rating badge shared by the course cards
// =====================================================

/** "⭐ 4.5 · 12 reviews" (or "No reviews yet") from course.rating_*. */
export function ratingBadgeHtml(course) {
    const count = Number(course?.rating_count) || 0;
    const average = Number(course?.rating_avg) || 0;

    if (!count) {
        return `
            <p class="mt-1 text-xs text-slate-400 font-semibold">
                <i class="fa-regular fa-star mr-1"></i>No reviews yet
            </p>
        `;
    }

    return `
        <p class="mt-1 text-xs text-slate-600 font-bold"
           title="${average.toFixed(1)} out of 5 from ${count} review${count === 1 ? "" : "s"}">
            <i class="fa-solid fa-star text-amber-400 mr-1"></i>${average.toFixed(1)}
            <span class="text-slate-400 font-semibold">
                · ${count} review${count === 1 ? "" : "s"}
            </span>
        </p>
    `;
}

// Full date + time for a purchase expiry (timestamptz).
export function formatExpiryDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value || "");
    }

    return `${date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    })}, ${date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
    })}`;
}

function validityText(row) {
    if (row.status !== "approved") {
        return "—";
    }

    if (!row.expires_at) {
        return "Lifetime Access";
    }

    const expired = purchaseExpired(row);

    return formatExpiryDateTime(row.expires_at) +
        (expired ? " (expired)" : "");
}

/**
 * Paid amount for the purchase tables: the plain paid price, or the
 * struck-through list price + paid amount + offer tag when the 1+1
 * second-course discount applied.
 */
function amountCellHtml(row) {
    const paid = formatAmount(row.amount_inr);
    const discount = Number(row.discount_amount_inr) || 0;

    if (discount <= 0) {
        return escapeHtml(paid);
    }

    return `
        <span class="text-slate-400 line-through text-xs
                     mr-1">${escapeHtml(formatAmount(row.original_amount_inr))}</span>${escapeHtml(paid)}
        <span class="ml-1 rounded bg-orange-50 px-1.5 py-0.5
                     text-xs font-bold text-orange-600">50% OFF</span>
    `;
}

async function renderPurchasesTable(containerId = "myPurchasesList") {
    const container = $(containerId);

    if (!container) {
        return;
    }

    await refreshOwnership();

    if (!purchasesCache.length) {
        container.innerHTML = `
            <p class="text-sm text-slate-500">
                You have not purchased any course yet.
            </p>
        `;
        return;
    }

    const statusLabel = {
        pending: `<span class="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Pending</span>`,
        approved: `<span class="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Approved</span>`,
        rejected: `<span class="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Rejected</span>`
    };

    container.innerHTML = `
        <div class="table-scroll">
            <table class="w-full min-w-[720px] text-sm text-left">
                <thead>
                    <tr class="text-xs uppercase tracking-wide text-slate-400 border-b">
                        <th class="py-2 pr-4">Course</th>
                        <th class="py-2 pr-4">Amount</th>
                        <th class="py-2 pr-4">UTR</th>
                        <th class="py-2 pr-4">Date</th>
                        <th class="py-2 pr-4">Valid until</th>
                        <th class="py-2">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${purchasesCache.map(row => `
                        <tr class="border-b last:border-0">
                            <td class="py-3 pr-4 font-semibold text-slate-800">
                                ${escapeHtml(row.course_title || courseTitleFor(row.course_id))}
                            </td>
                            <td class="py-3 pr-4">${amountCellHtml(row)}</td>
                            <td class="py-3 pr-4 font-mono text-xs">${escapeHtml(row.utr || "-")}</td>
                            <td class="py-3 pr-4">${escapeHtml(formatDate(row.created_at))}</td>
                            <td class="py-3 pr-4 ${purchaseExpired(row)
                                ? "text-red-600 font-semibold"
                                : ""}">
                                ${escapeHtml(validityText(row))}
                            </td>
                            <td class="py-3">${statusLabel[row.status] || escapeHtml(row.status || "-")}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function renderMyPurchases() {
    await renderPurchasesTable("myPurchasesList");
}

/**
 * Dashboard header: shows the nearest course expiry so students always
 * know how long their access lasts ("Course access valid until …").
 */
async function renderDashboardAccessLine() {
    const line = $("dashboardAccessLine");

    if (!line) {
        return;
    }

    await refreshOwnership();

    const activePurchases = purchasesCache.filter(
        row => row.status === "approved" && !purchaseExpired(row)
    );

    if (!activePurchases.length) {
        const expired = purchasesCache.some(
            row => row.status === "approved" && purchaseExpired(row)
        );

        line.textContent = expired
            ? "Course access expired — renew a course to keep learning."
            : "No active course access yet.";
        line.className = "text-xs font-bold mt-2 text-slate-400";
        return;
    }

    // An approved purchase without an expiry is lifetime access (the
    // backend's active-purchase queries treat a NULL validUntil the same
    // way). It has no date to show, so it must not fall through to the
    // "no active access" branch.
    const expiries = activePurchases
        .map(row => row.expires_at)
        .filter(Boolean)
        .sort();

    if (!expiries.length) {
        line.innerHTML = `
            <i class="fa-solid fa-infinity mr-1"></i>
            Course access:
            <span class="text-emerald-600">Lifetime Access</span>
        `;
        line.className = "text-xs font-bold mt-2 text-emerald-600";
        return;
    }

    const nearest = expiries[0];

    line.innerHTML = `
        <i class="fa-regular fa-clock mr-1"></i>
        Course access valid until
        <span class="text-emerald-600">${escapeHtml(formatExpiryDateTime(nearest))}</span>
    `;
}

// payment-history.html reuses the same table.
export async function renderPaymentHistory() {
    await renderPurchasesTable("paymentHistoryList");
}

function coursesMessage(text, type = "info") {
    updateNoticeBox("coursesPageMessage", text, type, {
        baseClasses: "text-sm min-h-5 mb-4 px-4 py-3 rounded-xl"
    });
}

// =====================================================
// Buy modal
// =====================================================

let activeCourse = null;
let upiId = DEFAULT_UPi_ID;

async function openBuyModal(course) {
    const modal = $("buyModal");

    if (!modal) {
        return;
    }

    activeCourse = course;

    // Fresh offer snapshot so the checkout shows the price the
    // student actually has to pay right now.
    await loadOffer();

    const offerPrice = offerPriceFor(course);

    $("buyCourseTitle").textContent = course.title;
    $("buyCoursePrice").textContent = offerPrice != null
        ? formatAmount(offerPrice)
        : formatPrice(course.price_inr);
    $("buyUpiIdText").textContent = upiId;

    // 1+1 second-course offer breakdown on the payment step.
    const originalSpan = $("buyCourseOriginalPrice");
    const offerRow = $("buyOfferRow");

    if (offerPrice != null) {
        const saved = Math.round(
            (Number(course.price_inr) - offerPrice) * 100
        ) / 100;

        if (originalSpan) {
            originalSpan.textContent = formatAmount(course.price_inr);
            originalSpan.classList.remove("hidden");
        }

        if (offerRow) {
            $("buyOfferText").textContent =
                `50% OFF — Second Course Offer applied. You save ${formatAmount(saved)}.`;
            offerRow.classList.remove("hidden");
        }
    } else {
        originalSpan?.classList.add("hidden");
        offerRow?.classList.add("hidden");
    }

    // Average rating of this course (details/checkout view).
    const ratingBox = $("buyCourseRating");
    if (ratingBox) {
        ratingBox.innerHTML = ratingBadgeHtml(course);
    }

    const upiLink = $("buyUpiLink");

    // The UPI deep link pre-fills the final payable amount -
    // discounted while the 1+1 offer applies.
    upiLink.href = buildUpiLink({
        upiId,
        amount: offerPrice ?? course.price_inr,
        title: course.title
    });

    $("buyUtrInput").value = "";
    coursesMessage("");

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeBuyModal() {
    const modal = $("buyModal");

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");
    activeCourse = null;
}

async function handleBuySubmit(event) {
    event.preventDefault();

    if (!activeCourse) {
        return;
    }

    const submitBtn = $("submitPurchaseBtn");
    const utr = $("buyUtrInput").value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
        await submitPurchase({ course: activeCourse, utr });

        coursesMessage(
            "Request submitted! Your purchase will be unlocked after admin approval.",
            "success"
        );

        $("buyUtrInput").value = "";

        await renderCourseGrid();
        await renderMyPurchases();

        setTimeout(closeBuyModal, 1400);
    } catch (error) {
        console.error("Purchase error:", error);

        coursesMessage(
            error?.message || "Could not submit the purchase request.",
            "error"
        );
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML =
            `<i class="fa-solid fa-paper-plane mr-2"></i>Submit request`;
    }
}

function setupBuyModalEvents() {
    const modal = $("buyModal");

    if (!modal || modal.dataset.wired === "1") {
        return;
    }

    modal.dataset.wired = "1";

    $("closeBuyModalBtn")?.addEventListener("click", closeBuyModal);
    $("cancelBuyBtn")?.addEventListener("click", closeBuyModal);

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeBuyModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) {
            closeBuyModal();
        }
    });

    $("buyForm")?.addEventListener("submit", handleBuySubmit);
}

// =====================================================
// Admin — payment approvals panel
// =====================================================

function purchasesAdminMessage(text, type = "info") {
    updateNoticeBox("purchaseAdminMessage", text, type, {
        infoClasses: ["bg-emerald-50", "text-emerald-700"]
    });
}

async function renderAdminPurchases() {
    const list = $("purchaseRequestsList");
    const modeNote = $("purchaseModeNote");

    if (!list) {
        return;
    }

    const { rows, mode } = await loadAllPurchases();

    if (modeNote) {
        modeNote.textContent = mode === "local"
            ? "Storage: this browser only — the backend is unreachable."
            : "Storage: TechCampus Hub backend";
    }

    if (!rows.length) {
        list.innerHTML = `
            <p class="text-sm text-slate-500">No purchase requests yet.</p>
        `;
        return;
    }

    const statusBadgeHtml = {
        pending: `<span class="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Pending</span>`,
        approved: `<span class="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Approved</span>`,
        rejected: `<span class="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Rejected</span>`
    };

    list.innerHTML = rows.map(row => {
        let actions = "";

        if (row.status === "pending") {
            actions = `
                <div class="flex gap-2">
                    <button type="button"
                        class="approve-purchase-btn rounded-lg bg-emerald-600 hover:bg-emerald-700
                               text-white text-xs font-bold px-3 py-2"
                        title="Approve and choose the course validity"
                        data-purchase-id="${escapeHtml(String(row.id))}">
                        Approve
                    </button>
                    <button type="button"
                        class="reject-purchase-btn rounded-lg bg-red-50 hover:bg-red-100
                               text-red-600 text-xs font-bold px-3 py-2"
                        data-purchase-id="${escapeHtml(String(row.id))}">
                        Reject
                    </button>
                </div>
            `;
        } else if (row.status === "approved") {
            actions = `
                <div class="flex gap-2">
                    <button type="button"
                        class="extend-purchase-btn rounded-lg bg-blue-50 hover:bg-blue-100
                               text-blue-700 text-xs font-bold px-3 py-2"
                        title="Extend course expiry by 30 days"
                        data-purchase-id="${escapeHtml(String(row.id))}">
                        <i class="fa-solid fa-calendar-plus mr-1"></i>+30 days
                    </button>
                    <button type="button"
                        class="delete-purchase-btn rounded-lg bg-red-50 hover:bg-red-100
                               text-red-600 text-xs font-bold px-3 py-2"
                        data-purchase-id="${escapeHtml(String(row.id))}">
                        Remove
                    </button>
                </div>
            `;
        } else {
            actions = `
                <div class="flex gap-2">
                    <button type="button"
                        class="approve-purchase-btn rounded-lg bg-emerald-600 hover:bg-emerald-700
                               text-white text-xs font-bold px-3 py-2"
                        data-purchase-id="${escapeHtml(String(row.id))}">
                        Approve
                    </button>
                    <button type="button"
                        class="delete-purchase-btn rounded-lg bg-red-50 hover:bg-red-100
                               text-red-600 text-xs font-bold px-3 py-2"
                        data-purchase-id="${escapeHtml(String(row.id))}">
                        Remove
                    </button>
                </div>
            `;
        }

        return `
            <div class="border rounded-xl p-4 flex flex-wrap items-center gap-4 justify-between">
                <div class="min-w-0">
                    <p class="font-bold text-slate-800 truncate">
                        ${escapeHtml(row.course_title || "Course")} — ${amountCellHtml(row)}
                    </p>
                    <p class="text-sm text-slate-500 truncate">
                        ${escapeHtml(row.user_name || "Student")} · ${escapeHtml(row.user_email || "-")}
                    </p>
                    <p class="text-xs text-slate-400 mt-1 font-mono">
                        UTR: ${escapeHtml(row.utr || "-")} · ${escapeHtml(formatDate(row.created_at))}
                    </p>
                    ${row.status === "approved"
                        ? `<p class="text-xs mt-1 font-semibold ${purchaseExpired(row)
                            ? "text-red-600"
                            : "text-emerald-600"}">
                               <i class="fa-regular fa-clock mr-1"></i>
                               Valid until: ${escapeHtml(validityText(row))}
                           </p>`
                        : ""}
                </div>
                <div class="flex items-center gap-3">
                    ${statusBadgeHtml[row.status] || ""}
                    ${actions}
                </div>
            </div>
        `;
    }).join("");
}

async function handlePurchaseAction(event) {
    const button = event.target.closest(
        ".approve-purchase-btn, .reject-purchase-btn, " +
        ".extend-purchase-btn, .delete-purchase-btn, " +
        ".validity-purchase-btn"
    );

    if (!button) {
        return;
    }

    const purchaseId = button.dataset.purchaseId;
    const approved = button.classList.contains("approve-purchase-btn");
    const extended = button.classList.contains("extend-purchase-btn");
    const removed = button.classList.contains("delete-purchase-btn");
    const validityEdit = button.classList.contains("validity-purchase-btn");

    // Approve / edit validity: ask the admin how long access should last.
    if (approved || validityEdit) {
        openValidityModal(purchaseId, approved ? "approve" : "edit");
        return;
    }

    button.disabled = true;

    try {
        if (extended) {
            await extendPurchaseExpiry(purchaseId, 30);

            purchasesAdminMessage(
                "Course expiry extended by 30 days.",
                "success"
            );
        } else if (removed) {
            await deletePurchase(purchaseId);

            purchasesAdminMessage("Purchase removed.", "success");
        } else {
            await setPurchaseStatus(
                purchaseId,
                approved ? "approved" : "rejected"
            );

            purchasesAdminMessage(
                approved
                    ? "Purchase approved — course unlocked for the student."
                    : "Purchase rejected.",
                approved ? "success" : "info"
            );
        }

        await renderAdminPurchases();
    } catch (error) {
        console.error("Purchase review error:", error);

        purchasesAdminMessage(
            error?.message || "Could not update the purchase.",
            "error"
        );

        button.disabled = false;
    }
}

// =====================================================
// Validity modal (admin): 30/90/180/365 days or a
// custom expiry date, used on approve and when editing
// the validity of an already approved purchase.
// =====================================================

let validityModalState = { purchaseId: null, mode: "approve" };

function openValidityModal(purchaseId, mode) {
    const modal = $("purchaseValidityModal");

    if (!modal) {
        return;
    }

    validityModalState = { purchaseId, mode };

    const title = $("validityModalTitle");
    const context = $("validityModalContext");
    const dateInput = $("validityDateInput");

    if (title) {
        title.textContent = mode === "approve"
            ? "Approve & set validity"
            : "Modify course validity";
    }

    if (context) {
        context.textContent = mode === "approve"
            ? "Choose how long the student keeps access to this course."
            : "Replace the current expiry with a new preset or exact date.";
    }

    if (dateInput) {
        dateInput.value = "";
    }

    document
        .querySelectorAll("#purchaseValidityModal .validity-preset-btn")
        .forEach(btn => {
            btn.classList.remove("bg-blue-600", "text-white", "border-blue-600");
        });

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeValidityModal() {
    const modal = $("purchaseValidityModal");

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");
    validityModalState = { purchaseId: null, mode: "approve" };
}

function selectedPresetDays() {
    const active = document.querySelector(
        "#purchaseValidityModal .validity-preset-btn.bg-blue-600"
    );

    return active ? Number(active.dataset.days) : 0;
}

async function handleValidityConfirm() {
    const { purchaseId, mode } = validityModalState;

    if (!purchaseId) {
        return;
    }

    const confirmButton = $("confirmValidityBtn");
    const dateInput = $("validityDateInput");
    const customDate = dateInput?.value
        ? `${dateInput.value}T23:59:59`
        : "";
    const presetDays = selectedPresetDays();

    if (!customDate && !presetDays && mode === "edit") {
        purchasesAdminMessage(
            "Pick a validity preset or a custom expiry date first.",
            "error"
        );
        return;
    }

    if (confirmButton) {
        confirmButton.disabled = true;
    }

    try {
        if (mode === "approve") {
            // Approve: exact date wins over preset; neither = course default.
            const validity = customDate
                ? { validUntil: customDate }
                : presetDays
                    ? { validityDays: presetDays }
                    : {};

            await approvePurchaseWithValidity(purchaseId, validity);

            purchasesAdminMessage(
                customDate
                    ? `Purchase approved — valid until ${customDate.slice(0, 10)}.`
                    : presetDays
                        ? `Purchase approved — ${presetDays} days of access.`
                        : "Purchase approved — course default validity applied.",
                "success"
            );
        } else {
            const validUntil = customDate || daysFromToday(presetDays);

            await setPurchaseValidity(purchaseId, validUntil);

            purchasesAdminMessage(
                `Expiry updated — valid until ${validUntil.slice(0, 10)}.`,
                "success"
            );
        }

        closeValidityModal();
        await renderAdminPurchases();
    } catch (error) {
        console.error("Validity update error:", error);

        purchasesAdminMessage(
            error?.message || "Could not update the validity.",
            "error"
        );
    } finally {
        if (confirmButton) {
            confirmButton.disabled = false;
        }
    }
}

function daysFromToday(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 0));
    date.setHours(23, 59, 59, 0);

    const pad = value => String(value).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function setupValidityModal() {
    const modal = $("purchaseValidityModal");

    if (!modal) {
        return;
    }

    // Preset buttons only select; Confirm applies the choice.
    modal.querySelectorAll(".validity-preset-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            modal
                .querySelectorAll(".validity-preset-btn")
                .forEach(other => {
                    other.classList.remove(
                        "bg-blue-600", "text-white", "border-blue-600"
                    );
                });

            btn.classList.add("bg-blue-600", "text-white", "border-blue-600");

            // An explicit preset clears a conflicting custom date.
            const dateInput = $("validityDateInput");
            if (dateInput) {
                dateInput.value = "";
            }
        });
    });

    // Choosing a date clears the preset selection.
    $("validityDateInput")?.addEventListener("change", () => {
        modal
            .querySelectorAll(".validity-preset-btn")
            .forEach(other => {
                other.classList.remove(
                    "bg-blue-600", "text-white", "border-blue-600"
                );
            });
    });

    $("confirmValidityBtn")?.addEventListener("click", handleValidityConfirm);
    $("cancelValidityBtn")?.addEventListener("click", closeValidityModal);
    $("closeValidityModalBtn")?.addEventListener("click", closeValidityModal);

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeValidityModal();
        }
    });
}

// =====================================================
// Reviews modal: average + review list, and the rating
// form (verified purchasers only — enforced server-side).
// =====================================================

let reviewsModalState = {
    courseId: null,
    rating: 0,
    canReview: false
};

function closeReviewsModal() {
    const modal = $("courseReviewsModal");

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");
    reviewsModalState = { courseId: null, rating: 0, canReview: false };
}

function setStarPicker(rating) {
    reviewsModalState.rating = Number(rating) || 0;

    document.querySelectorAll("#reviewStarPicker .review-star-btn")
        .forEach(btn => {
            const active = Number(btn.dataset.rating) <= reviewsModalState.rating;
            btn.classList.toggle("text-amber-400", active);
            btn.classList.toggle("text-slate-300", !active);
        });

    const label = $("reviewRatingLabel");

    if (label) {
        const names = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
        label.textContent = reviewsModalState.rating
            ? `${reviewsModalState.rating}/5 — ${names[reviewsModalState.rating]}`
            : "Select 1-5 stars";
    }
}

function starRow(rating) {
    let html = "";

    for (let i = 1; i <= 5; i++) {
        html += `<i class="fa-${i <= rating ? "solid" : "regular"} fa-star
                    ${i <= rating ? "text-amber-400" : "text-slate-300"}"></i>`;
    }

    return html;
}

function summaryHtml(summary) {
    const count = Number(summary?.count) || 0;
    const average = Number(summary?.average) || 0;

    if (!count) {
        return `
            <div class="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 font-semibold">
                No reviews yet — your rating will be the first.
            </div>
        `;
    }

    return `
        <div class="rounded-xl bg-slate-50 p-4 flex items-center gap-4">
            <div class="text-center">
                <p class="text-3xl font-extrabold text-slate-900">${average.toFixed(1)}</p>
                <p class="text-xs text-amber-400">${starRow(Math.round(average))}</p>
            </div>
            <div class="text-sm text-slate-600 font-semibold">
                ${count} review${count === 1 ? "" : "s"} from verified purchasers
            </div>
        </div>
    `;
}

function reviewItemHtml(review) {
    const rating = Number(review.rating) || 0;
    const name = review.userName || "Student";
    const when = review.createdAt
        ? formatDate(review.createdAt)
        : "";

    return `
        <div class="border border-slate-200 rounded-xl p-3">
            <div class="flex items-center justify-between gap-2">
                <p class="font-bold text-slate-800 text-sm truncate">
                    ${escapeHtml(name)}
                </p>
                <span class="text-amber-400 text-xs shrink-0">${starRow(rating)}</span>
            </div>
            ${review.comment
                ? `<p class="text-sm text-slate-600 mt-1">${escapeHtml(review.comment)}</p>`
                : ""}
            ${when
                ? `<p class="text-xs text-slate-400 mt-1">${escapeHtml(when)}</p>`
                : ""}
        </div>
    `;
}

async function openReviewsModal(courseId, courseTitle) {
    const modal = $("courseReviewsModal");

    if (!modal) {
        return;
    }

    reviewsModalState = { courseId, rating: 0, canReview: false };

    const title = $("reviewsModalTitle");
    const summaryBox = $("reviewsModalSummary");
    const list = $("reviewList");
    const note = $("reviewListNote");

    if (title) {
        title.textContent = courseTitle || "Course";
    }

    if (summaryBox) {
        summaryBox.innerHTML = `<p class="text-sm text-slate-500">Loading…</p>`;
    }

    if (list) {
        list.innerHTML = `<p class="text-sm text-slate-500">Loading reviews…</p>`;
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    // Make sure the purchase cache is fresh before deciding whether the
    // visitor may rate this course.
    await refreshOwnership();

    try {
        const [summary, reviews] = await Promise.all([
            getCourseRating(courseId),
            getCourseReviews(courseId)
        ]);

        if (summaryBox) {
            summaryBox.innerHTML = summaryHtml(summary);
        }

        const rows = Array.isArray(reviews) ? reviews : [];

        if (list) {
            list.innerHTML = rows.length
                ? rows.map(reviewItemHtml).join("")
                : `<p class="text-sm text-slate-500">No reviews yet.</p>`;
        }

        // The signed-in student may rate only their own approved course.
        const status = purchaseStatusFor(courseId);
        const owned = status === "approved";
        const myReview = rows.find(
            review => String(review.userId) === String(getStoredUser()?.id)
        );

        const formBox = $("reviewFormBox");

        if (formBox) {
            formBox.classList.toggle("hidden", !owned);

            if (owned) {
                reviewsModalState.canReview = true;

                const heading = $("reviewFormHeading");
                const comment = $("reviewCommentInput");

                if (heading) {
                    heading.textContent = myReview
                        ? "Update your review"
                        : "Rate this course";
                }

                if (comment) {
                    comment.value = myReview?.comment || "";
                }

                setStarPicker(myReview?.rating || 0);
            }
        }

        if (note) {
            note.textContent = owned
                ? "Reviews from students who purchased this course."
                : "Buy this course to leave a rating and review.";
        }
    } catch (error) {
        console.error("Reviews loading error:", error);

        if (summaryBox) {
            summaryBox.innerHTML = "";
        }

        if (list) {
            list.innerHTML = `
                <p class="text-sm text-red-600">
                    ${escapeHtml(error.message || "Could not load reviews.")}
                </p>
            `;
        }
    }
}

async function handleReviewSubmit() {
    const { courseId, rating, canReview } = reviewsModalState;
    const message = $("reviewFormMessage");
    const button = $("submitReviewBtn");

    const setNote = (text, isError = false) => {
        if (message) {
            message.textContent = text || "";
            message.className = `text-xs flex-1 ${
                isError ? "text-red-600 font-semibold" : "text-slate-500"
            }`;
        }
    };

    if (!courseId || !canReview) {
        return;
    }

    if (!rating) {
        setNote("Please select a star rating first.", true);
        return;
    }

    if (button) {
        button.disabled = true;
    }

    try {
        const comment = $("reviewCommentInput")?.value || "";

        await submitCourseReview(courseId, rating, comment);

        setNote("Thanks! Your review has been saved.");

        // Refresh the average + list in place.
        const [summary, reviews] = await Promise.all([
            getCourseRating(courseId),
            getCourseReviews(courseId)
        ]);

        const summaryBox = $("reviewsModalSummary");
        const list = $("reviewList");

        if (summaryBox) {
            summaryBox.innerHTML = summaryHtml(summary);
        }

        if (list) {
            const rows = Array.isArray(reviews) ? reviews : [];
            list.innerHTML = rows.length
                ? rows.map(reviewItemHtml).join("")
                : `<p class="text-sm text-slate-500">No reviews yet.</p>`;
        }

        const heading = $("reviewFormHeading");
        if (heading) {
            heading.textContent = "Update your review";
        }

        // Cards show the live average — bust the catalog cache first so the
        // refreshed ratingCount/averageRating reach the grid.
        loadCourses(true)
            .then(() => renderCourseGrid())
            .catch(() => {});
    } catch (error) {
        console.error("Review submit error:", error);
        setNote(error.message || "Could not save your review.", true);
    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}

function setupReviewsModal() {
    const modal = $("courseReviewsModal");

    if (!modal) {
        return;
    }

    $("closeReviewsModalBtn")?.addEventListener("click", closeReviewsModal);
    $("submitReviewBtn")?.addEventListener("click", handleReviewSubmit);

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeReviewsModal();
        }
    });

    document.querySelectorAll("#reviewStarPicker .review-star-btn")
        .forEach(btn => {
            btn.addEventListener("click", () => {
                setStarPicker(btn.dataset.rating);
            });
        });
}

async function handleUpiSave() {
    const input = $("upiIdInput");

    if (!input) {
        return;
    }

    try {
        const result = await saveUpiId(input.value);

        purchasesAdminMessage(
            result.mode === "local"
                ? "UPI ID saved (also cached locally — the backend is unreachable)."
                : "UPI ID saved.",
            "success"
        );
    } catch (error) {
        console.error("UPI ID save error:", error);

        purchasesAdminMessage(
            error?.message || "Could not save the UPI ID.",
            "error"
        );
    }
}

// =====================================================
// Admin — course management (admin.html)
// Launch, edit, delete, price and validity.
// =====================================================

function courseAdminMessage(text, type = "info") {
    updateNoticeBox("courseAdminMessage", text, type, {
        infoClasses: ["bg-emerald-50", "text-emerald-700"]
    });
}

async function renderAdminCourseList() {
    const list = $("adminCoursesList");

    if (!list) {
        return;
    }

    const courses = await loadAdminCourses();

    if (!courses.length) {
        list.innerHTML = `
            <p class="text-sm text-slate-500">No courses yet — launch your first course.</p>
        `;
        return;
    }

    list.innerHTML = courses.map(course => {
        const validity = Number(course.validity_days) > 0
            ? `${Number(course.validity_days)} days`
            : "365 days";

        return `
            <div class="border rounded-xl p-4 flex flex-wrap items-center gap-4 justify-between">
                <div class="min-w-0">
                    <p class="font-bold text-slate-800 truncate">
                        ${escapeHtml(course.title || "Untitled course")}
                    </p>
                    <p class="text-sm text-slate-500 truncate">
                        ${escapeHtml(course.description || "")}
                    </p>
                    <p class="text-xs text-slate-400 mt-1">
                        ${escapeHtml(formatPrice(course.price_inr))} ·
                        Validity ${escapeHtml(validity)} ·
                        ${course.is_active === false ? "Hidden" : "Active"}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button type="button"
                        class="edit-course-btn rounded-lg bg-blue-50 hover:bg-blue-100
                               text-blue-700 text-xs font-bold px-3 py-2"
                        data-course-id="${escapeHtml(String(course.id))}">
                        Edit
                    </button>
                    <button type="button"
                        class="delete-course-btn rounded-lg bg-red-50 hover:bg-red-100
                               text-red-600 text-xs font-bold px-3 py-2"
                        data-course-id="${escapeHtml(String(course.id))}">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function setCourseFieldValue(id, value) {
    const element = $(id);

    if (element) {
        element.value =
            value === null || value === undefined ? "" : String(value);
    }
}

function resetCourseForm() {
    const form = $("courseAdminForm");

    if (!form) {
        return;
    }

    delete form.dataset.editingId;
    form.reset();

    const saveBtn = $("saveCourseBtn");

    if (saveBtn) {
        saveBtn.innerHTML =
            `<i class="fa-solid fa-rocket mr-2"></i>Launch course`;
    }

    $("cancelCourseEditBtn")?.classList.add("hidden");
}

async function handleCourseFormSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const editingId = form.dataset.editingId || null;

    const fields = {
        title: $("courseTitleInput")?.value,
        description: $("courseDescriptionInput")?.value,
        price_inr: $("coursePriceInput")?.value,
        // Optional compare-at price; "" (blank) means no discount.
        mrp_inr: $("courseMrpInput")?.value,
        validity_days: $("courseValidityInput")?.value,
        is_active: $("courseActiveInput")
            ? Boolean($("courseActiveInput").checked)
            : true,
        highlights: String($("courseHighlightsInput")?.value || "")
            .split(",")
            .map(part => part.trim())
            .filter(Boolean)
    };

    try {
        if (editingId) {
            await updateCourse(editingId, fields);
            courseAdminMessage("Course updated.", "success");
        } else {
            await createCourse(fields);
            courseAdminMessage(
                "Course launched — students have been notified.",
                "success"
            );
        }

        resetCourseForm();

        await renderAdminCourseList();
        await renderCourseGrid();
    } catch (error) {
        console.error("Course save error:", error);

        courseAdminMessage(
            error?.message || "Could not save the course.",
            "error"
        );
    }
}

async function handleCourseListClick(event) {
    const editButton = event.target.closest(".edit-course-btn");
    const deleteButton = event.target.closest(".delete-course-btn");

    if (!editButton && !deleteButton) {
        return;
    }

    const courses = await loadAdminCourses();

    const course = courses.find(
        item => String(item.id) === String(
            (editButton || deleteButton).dataset.courseId
        )
    );

    if (!course) {
        courseAdminMessage("Course not found.", "error");
        return;
    }

    if (editButton) {
        const form = $("courseAdminForm");

        if (form) {
            form.dataset.editingId = String(course.id);
        }

        setCourseFieldValue("courseTitleInput", course.title);
        setCourseFieldValue(
            "courseDescriptionInput",
            course.description
        );
        setCourseFieldValue("coursePriceInput", course.price_inr);
        // null (no discount) populates as a blank field.
        setCourseFieldValue("courseMrpInput", course.mrp_inr);
        setCourseFieldValue(
            "courseValidityInput",
            course.validity_days ?? 365
        );
        setCourseFieldValue(
            "courseHighlightsInput",
            (course.highlights || []).join(", ")
        );

        const activeInput = $("courseActiveInput");

        if (activeInput) {
            activeInput.checked = course.is_active !== false;
        }

        const saveBtn = $("saveCourseBtn");

        if (saveBtn) {
            saveBtn.innerHTML =
                `<i class="fa-solid fa-check mr-2"></i>Save changes`;
        }

        $("cancelCourseEditBtn")?.classList.remove("hidden");

        courseAdminMessage(`Editing "${course.title}".`, "info");

        form?.scrollIntoView({ behavior: "smooth", block: "center" });

        return;
    }

    const confirmed = window.confirm(
        `Delete course "${course.title}"? Its notes will become free.`
    );

    if (!confirmed) {
        return;
    }

    try {
        await deleteCourse(course.id);

        courseAdminMessage("Course deleted.", "success");

        await renderAdminCourseList();
        await renderCourseGrid();
    } catch (error) {
        console.error("Course delete error:", error);

        courseAdminMessage(
            error?.message || "Could not delete the course.",
            "error"
        );
    }
}

export function setupCourseAdmin() {
    // Idempotent: never attach the form handlers twice.
    if (setupCourseAdmin.wired) {
        return;
    }

    const form = $("courseAdminForm");

    if (!form) {
        return;
    }

    setupCourseAdmin.wired = true;

    form.addEventListener("submit", handleCourseFormSubmit);

    $("cancelCourseEditBtn")?.addEventListener("click", () => {
        resetCourseForm();
        courseAdminMessage("");
    });

    $("adminCoursesList")?.addEventListener(
        "click",
        handleCourseListClick
    );

    $("refreshCoursesBtn")?.addEventListener("click", async () => {
        try {
            await loadAdminCourses(true);
            await loadCourses(true);
            await renderAdminCourseList();
        } catch (error) {
            console.error("Courses refresh error:", error);
        }
    });

    renderAdminCourseList().catch(error => {
        console.error("Admin course list render error:", error);
    });
}

// =====================================================
// Wiring (called from events.js setupEvents)
// =====================================================

export function setupCommerceEvents() {
    // ---------------------------------------------
    // dashboard.html — course access / expiry line
    // ---------------------------------------------
    renderDashboardAccessLine().catch(error => {
        console.error("Dashboard access line error:", error);
    });

    // ---------------------------------------------
    // courses.html
    // ---------------------------------------------
    if ($("courseGrid")) {
        upiId = DEFAULT_UPi_ID;

        getUpiId().then(value => {
            upiId = value;
        }).catch(error => {
            console.error("UPI ID load error:", error);
        });

        renderCourseGrid().catch(error => {
            console.error("Course grid render error:", error);
        });

        renderMyPurchases().catch(error => {
            console.error("Purchases render error:", error);
        });

        $("courseGrid").addEventListener("click", event => {
            const reviewsBtn = event.target.closest(".reviews-trigger-btn");

            if (reviewsBtn) {
                openReviewsModal(
                    reviewsBtn.dataset.courseId,
                    reviewsBtn.dataset.courseTitle
                );
                return;
            }

            const button = event.target.closest(".buy-course-btn");

            if (!button) {
                return;
            }

            loadCourses().then(courses => {
                const course = courses.find(
                    item => String(item.id) === button.dataset.courseId
                );

                if (course) {
                    openBuyModal(course).catch(error => {
                        console.error("Buy modal error:", error);
                    });
                }
            });
        });

        setupBuyModalEvents();
        setupReviewsModal();
    }

    // ---------------------------------------------
    // admin.html — payment approvals
    // ---------------------------------------------
    if ($("purchaseRequestsList")) {
        renderAdminPurchases().catch(error => {
            console.error("Admin purchases render error:", error);
        });

        setupValidityModal();

        getUpiId().then(value => {
            const input = $("upiIdInput");

            if (input && !input.value) {
                input.value = value;
            }
        }).catch(error => {
            console.error("UPI ID load error:", error);
        });

        $("purchaseRequestsList").addEventListener(
            "click",
            handlePurchaseAction
        );

        $("refreshPurchasesBtn")?.addEventListener("click", () => {
            renderAdminPurchases().catch(error => {
                console.error("Admin purchases render error:", error);
            });
        });

        $("updateUpiIdBtn")?.addEventListener("click", handleUpiSave);
    }

    // ---------------------------------------------
    // payment-history.html
    // ---------------------------------------------
    if ($("paymentHistoryList")) {
        renderPaymentHistory().catch(error => {
            console.error("Payment history render error:", error);
        });
    }

    // ---------------------------------------------
    // admin.html — course management
    // ---------------------------------------------
    setupCourseAdmin();

    // ---------------------------------------------
    // admin upload form: bundle selectors
    //         (notes + paid TNP notes)
    // ---------------------------------------------
    ["noteCourseBundle", "tnpCourseBundle"].forEach(id => {
        const select = $(id);

        if (select) {
            populateBundleSelect(select).catch(error => {
                console.error("Bundle select populate error:", error);
            });
        }
    });
}
