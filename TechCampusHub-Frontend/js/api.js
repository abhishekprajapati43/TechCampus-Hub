// =====================================================
// TechCampus_Hub
// api.js
//
// Shared REST client for the Spring Boot backend.
//
// - Talks to the backend at API_BASE_URL (js/config.js).
// - Keeps the JWT in localStorage and sends it as
//   "Authorization: Bearer <token>".
// - Unwraps the backend envelope { success, message, data }
//   so callers get plain data; failures throw an Error whose
//   message is the backend's message.
// - Normalizers convert the backend's camelCase DTOs into
//   the snake_case row shapes the render/search code reads
//   (file_url, created_at, course_id, ...). Inverse
//   converters turn those row shapes back into camelCase
//   request bodies.
// =====================================================

import { API_BASE_URL } from "./config.js";

// =====================================================
// Token / user persistence
// =====================================================

const TOKEN_KEY = "campusnotes:authToken";
const USER_KEY = "campusnotes:authUser";

export function getAuthToken() {
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch (error) {
        return null;
    }
}

export function setAuthToken(token) {
    try {
        if (token) {
            window.localStorage.setItem(TOKEN_KEY, token);
        } else {
            window.localStorage.removeItem(TOKEN_KEY);
        }
    } catch (error) {
        console.warn("Auth token storage failed:", error);
    }
}

export function getStoredUser() {
    try {
        const raw = window.localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

export function setStoredUser(user) {
    try {
        if (user) {
            window.localStorage.setItem(USER_KEY, JSON.stringify(user));
        } else {
            window.localStorage.removeItem(USER_KEY);
        }
    } catch (error) {
        console.warn("Auth user storage failed:", error);
    }
}

export function clearAuth() {
    setAuthToken(null);
    setStoredUser(null);
}

// =====================================================
// apiFetch — one call for every backend endpoint
// =====================================================
//
// options.body is JSON-serialized when present.
// Returns the envelope's `data` (or null).
// Throws Error(message) when the server says failure.
// =====================================================

export async function apiFetch(path, options = {}) {
    const payload = await apiFetchEnvelope(path, options);

    return payload ? payload.data : null;
}

// =====================================================
// apiFetchEnvelope — same request, whole envelope
// =====================================================
//
// Same request, auth and error handling as apiFetch, but it
// resolves with the FULL { success, message, data } envelope so
// callers can show the server's human-readable copy — e.g. the
// role-aware registration confirmation from
// POST /api/auth/register or the moderation confirmation from
// PATCH /api/admin/users/{id}/registration-status.
// =====================================================

export async function apiFetchEnvelope(path, options = {}) {
    const {
        method = "GET",
        body,
        auth = true
    } = options;

    const headers = {};

    if (body !== undefined && body !== null) {
        headers["Content-Type"] = "application/json";
    }

    const token = getAuthToken();

    if (auth && token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body !== undefined && body !== null
                ? JSON.stringify(body)
                : undefined
        });
    } catch (error) {
        throw new Error(
            "Could not reach the server. Please check your connection."
        );
    }

    let payload = null;

    try {
        payload = await response.json();
    } catch (error) {
        // 204 responses and proxy errors carry no JSON body.
    }

    if (!response.ok || payload?.success === false) {
        const message =
            payload?.message ||
            `Request failed (${response.status})`;

        const failure = new Error(message);

        failure.status = response.status;
        failure.fieldErrors = payload?.fieldErrors || null;

        throw failure;
    }

    return payload;
}

// =====================================================
// Small verb helpers
// =====================================================

export function apiGet(path, auth = true) {
    return apiFetch(path, { method: "GET", auth });
}

export function apiPost(path, body, auth = true) {
    return apiFetch(path, { method: "POST", body, auth });
}

export function apiPut(path, body, auth = true) {
    return apiFetch(path, { method: "PUT", body, auth });
}

export function apiPatch(path, body, auth = true) {
    return apiFetch(path, { method: "PATCH", body, auth });
}

/**
 * PATCH variant that resolves with the full envelope instead of
 * just `data` — for endpoints whose `message` must be echoed to
 * the user (faculty approve/reject).
 */
export function apiPatchEnvelope(path, body, auth = true) {
    return apiFetchEnvelope(path, { method: "PATCH", body, auth });
}

export function apiDelete(path, auth = true) {
    return apiFetch(path, { method: "DELETE", auth });
}

// =====================================================
// Normalizers: backend DTO -> frontend snake_case row
// =====================================================

/** notes: fileUrl -> file_url, storagePath -> storage_path, ... */
export function normalizeNote(note) {
    if (!note) {
        return null;
    }

    return {
        id: note.id,
        title: note.title,
        subject: note.subject,
        course: note.course,
        branch: note.branch,
        year: note.year,
        semester: note.semester,
        description: note.description,
        file_url: note.fileUrl,
        storage_path: note.storagePath,
        course_id: note.courseId ?? null,
        course_title: note.courseTitle ?? null,
        // Uploader attribution — only present on the admin list
        // (GET /api/admin/notes); student payloads carry null.
        created_by_name: note.createdByName ?? null,
        created_by_role: note.createdByRole ?? null,
        created_at: note.createdAt
    };
}

/**
 * PYQs: the paper's year lives in examYear on the backend;
 * the frontend reads both `year` (admin edit form) and
 * `exam_year` (search/render), so expose both.
 */
export function normalizePyq(pyq) {
    if (!pyq) {
        return null;
    }

    return {
        id: pyq.id,
        title: pyq.title,
        subject: pyq.subject,
        course: pyq.course,
        branch: pyq.branch,
        semester: pyq.semester,
        year: pyq.examYear,
        exam_year: pyq.examYear,
        description: pyq.description,
        file_url: pyq.fileUrl,
        storage_path: pyq.storagePath,
        course_id: pyq.courseId ?? null,
        course_title: pyq.courseTitle ?? null,
        created_at: pyq.createdAt
    };
}

/** TNP: the backend calls the subject-area label `topic`. */
export function normalizeTnp(tnp) {
    if (!tnp) {
        return null;
    }

    return {
        id: tnp.id,
        title: tnp.title,
        subject: tnp.topic,
        topic: tnp.topic,
        description: tnp.description,
        file_url: tnp.fileUrl,
        storage_path: tnp.storagePath,
        course_id: tnp.courseId ?? null,
        course_title: tnp.courseTitle ?? null,
        created_at: tnp.createdAt
    };
}

/**
 * Timetables: the Cloudinary public id is exposed as BOTH
 * storage_path and cloudinary_public_id so the admin delete
 * and replace flows (which read storage_path) and the upload
 * flow (which wrote cloudinary_public_id) agree.
 */
export function normalizeTimetable(timetable) {
    if (!timetable) {
        return null;
    }

    const publicId = timetable.storagePath || null;

    return {
        id: timetable.id,
        title: timetable.title,
        course: timetable.course,
        semester: timetable.semester,
        exam_type: timetable.examType,
        exam_year: timetable.examYear,
        day_of_week: timetable.dayOfWeek,
        effective_from: timetable.effectiveFrom,
        file_url: timetable.fileUrl,
        storage_path: publicId,
        cloudinary_public_id: publicId,
        file_name: timetable.fileName,
        course_id: timetable.courseId ?? null,
        course_title: timetable.courseTitle ?? null,
        created_at: timetable.createdAt
    };
}

/**
 * Syllabus: one active PDF per program + semester. The backend exposes
 * fileUrl/storagePath only to staff; student payloads carry the same fields
 * as null, so the UI never has a direct PDF link to leak. `upload_date` keeps
 * the original createdAt so the admin list can show "Uploaded on" even after
 * the PDF is replaced.
 */
export function normalizeSyllabus(syllabus) {
    if (!syllabus) {
        return null;
    }

    const publicId = syllabus.storagePath || null;
    const uploadDate =
        syllabus.uploadDate || syllabus.createdAt || null;

    return {
        id: syllabus.id,
        title: syllabus.title,
        course: syllabus.course,
        semester: Number(syllabus.semester) || 0,
        file_url: syllabus.fileUrl,
        storage_path: publicId,
        cloudinary_public_id: publicId,
        file_name: syllabus.fileName,
        course_id: syllabus.courseId ?? null,
        course_title: syllabus.courseTitle ?? null,
        uploaded_by: syllabus.uploadedBy ?? null,
        uploaded_by_name: syllabus.uploadedByName || "",
        uploader_role: syllabus.uploaderRole || "",
        status: syllabus.status || "Active",
        upload_date: uploadDate,
        updated_at: syllabus.updatedAt || null,
        created_at: syllabus.createdAt || uploadDate
    };
}

/** courses: price_inr / mrp_inr / validity_days / sort_order / is_active. */
export function normalizeCourse(course) {
    if (!course) {
        return null;
    }

    return {
        id: course.id,
        title: course.title,
        code: course.code,
        category: course.category,
        description: course.description,
        price_inr: Number(course.priceInr) || 0,
        // Compare-at (MRP) price. null when the course has no discount so
        // the admin edit form shows a blank field instead of "0"; home.js
        // reads it through Number(...) || 0 and hides the strike-through.
        mrp_inr: course.mrpInr == null ? null : Number(course.mrpInr),
        thumbnail_url: course.thumbnailUrl,
        validity_days: course.validityDays,
        slug: course.slug,
        highlights: Array.isArray(course.highlights)
            ? course.highlights
            : [],
        sort_order: course.sortOrder,
        is_active: course.active,
        // Ratings come back as averageRating/ratingCount (0 when unrated).
        rating_avg: Number(course.averageRating) || 0,
        rating_count: Number(course.ratingCount) || 0,
        created_at: course.createdAt
    };
}

/**
 * purchases: status is upper-case on the backend but the
 * frontend compares against "approved"/"pending"/"rejected",
 * and the expiry window is called expires_at client-side
 * (validUntil server-side).
 */
export function normalizePurchase(purchase) {
    if (!purchase) {
        return null;
    }

    return {
        id: purchase.id,
        course_id: purchase.courseId,
        course_title: purchase.courseTitle,
        user_id: purchase.userId,
        user_name: purchase.userName,
        user_email: purchase.userEmail,
        amount_inr: Number(purchase.amountInr) || 0,
        // 1+1 second-course offer: list price before the discount and the
        // discount granted (0 on legacy full-price rows).
        original_amount_inr: Number(purchase.originalAmountInr) || 0,
        discount_amount_inr: Number(purchase.discountAmountInr) || 0,
        utr: purchase.utr,
        status: String(purchase.status || "").toLowerCase(),
        valid_from: purchase.validFrom,
        expires_at: purchase.validUntil,
        reviewed_at: purchase.reviewedAt,
        rejection_reason: purchase.rejectionReason,
        created_at: purchase.createdAt
    };
}

/** users/students: role is "ADMIN"/"STUDENT" -> "admin"/"student". */
export function normalizeUser(user) {
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        course: user.course,
        branch: user.branch,
        year: user.year,
        semester: user.semester,
        role: String(user.role || "student").toLowerCase(),
        email_verified: user.emailVerified,
        // False while an admin has suspended the account.
        enabled: user.enabled !== false,
        // Faculty sign-up declaration (always false for students).
        declaration_accepted: user.declarationAccepted === true,
        // Moderation state of the registration ("PENDING" while an
        // admin still has to review a faculty sign-up). Legacy or
        // partial payloads may only carry the snake_case key, and
        // anything without a status predates moderation -> APPROVED.
        registration_status:
            user.registrationStatus ||
            user.registration_status ||
            "APPROVED",
        // Optional registration details. They are null when the
        // payload predates these fields (older stored sessions),
        // so lookups stay tolerant instead of throwing.
        address: user.address ?? null,
        gender: user.gender ?? null,
        // Roll number for students; camelCase on the backend,
        // snake_case on older payloads.
        enrollment_number:
            user.enrollmentNumber ??
            user.enrollment_number ??
            null,
        department: user.department ?? null,
        qualification: user.qualification ?? null,
        experience: user.experience ?? null,
        created_at: user.createdAt
    };
}

const FAVORITE_TYPE_TO_CATEGORY = {
    COURSE: "course",
    NOTE: "notes",
    PYQ: "pyq",
    TNP_NOTE: "tnp",
    TIMETABLE: "timetable",
    CERTIFICATE: "certificate"
};

export const FAVORITE_CATEGORY_TO_TYPE = {
    course: "COURSE",
    notes: "NOTE",
    pyq: "PYQ",
    tnp: "TNP_NOTE",
    timetable: "TIMETABLE",
    certificate: "CERTIFICATE"
};

/** favorites: itemType (NOTE) -> category ("notes"), itemId -> item_id. */
export function normalizeFavorite(favorite) {
    if (!favorite) {
        return null;
    }

    return {
        id: favorite.id,
        category:
            FAVORITE_TYPE_TO_CATEGORY[favorite.itemType] || "notes",
        item_id: String(favorite.itemId ?? ""),
        item_title: favorite.itemTitle || "Untitled",
        created_at: favorite.createdAt
    };
}

/** feedback: camelCase mirrors of the same field names. */
export function normalizeFeedback(feedback) {
    if (!feedback) {
        return null;
    }

    return {
        id: feedback.id,
        user_id: feedback.userId,
        user_name: feedback.userName,
        user_email: feedback.userEmail,
        course_id: feedback.courseId,
        course_title: feedback.courseTitle,
        rating: feedback.rating,
        message: feedback.message,
        target_type: feedback.targetType || "website",
        target_label: feedback.targetLabel || "Website",
        created_at: feedback.createdAt
    };
}

/**
 * notifications: the frontend's `body` is the backend's
 * message; the frontend's `kind` (general/timetable/course/
 * notes/pyq/tnp) is the backend's `category`.
 */
export function normalizeNotification(notification) {
    if (!notification) {
        return null;
    }

    return {
        id: notification.id,
        title: notification.title,
        body: notification.message || "",
        message: notification.message || "",
        kind: notification.category || "general",
        category: notification.category || "general",
        audience: notification.audience || "all",
        created_by: notification.createdBy || "",
        user_id: notification.userId,
        broadcast: notification.broadcast,
        created_at: notification.createdAt
    };
}

/** certificate links: sort_order / is_active. */
export function normalizeCertificateLink(link) {
    if (!link) {
        return null;
    }

    return {
        id: link.id,
        title: link.title,
        url: link.url,
        description: link.description,
        sort_order: link.sortOrder,
        is_active: link.isActive,
        created_at: link.createdAt
    };
}

/** site settings: upi_id / gemini_url / telegram_link. */
export function normalizeSettings(settings) {
    if (!settings) {
        return null;
    }

    return {
        id: settings.id,
        upi_id: settings.upiId,
        gemini_url: settings.geminiUrl,
        telegram_link: settings.telegramLink,
        updated_at: settings.updatedAt
    };
}

// =====================================================
// Inverse converters: frontend row -> backend request
// =====================================================
//
// Keys whose value is undefined or an empty string are
// dropped so partial updates (PUT) only touch fields the
// user actually filled in. This keeps existing backend
// values (e.g. course/branch) intact when an edit form
// leaves a dropdown blank.
// =====================================================

function compact(record) {
    const out = {};

    Object.entries(record).forEach(([key, value]) => {
        if (value === undefined) {
            return;
        }

        // Treat empty strings as "not provided" so they never
        // overwrite stored backend values on a partial PUT.
        if (typeof value === "string" && value.trim() === "") {
            return;
        }

        out[key] = value;
    });

    return out;
}

export function noteToRequest(row = {}) {
    return compact({
        title: row.title ?? null,
        subject: row.subject,
        course: row.course,
        branch: row.branch,
        year: row.year,
        semester: row.semester,
        description: row.description,
        fileUrl: row.file_url,
        storagePath: row.storage_path,
        courseId: row.course_id
    });
}

export function pyqToRequest(row = {}) {
    return compact({
        title: row.title ?? null,
        subject: row.subject,
        course: row.course,
        branch: row.branch,
        semester: row.semester,
        examYear: row.year ?? row.exam_year,
        description: row.description,
        fileUrl: row.file_url,
        storagePath: row.storage_path,
        courseId: row.course_id
    });
}

export function tnpToRequest(row = {}) {
    return compact({
        title: row.title ?? null,
        topic: row.subject ?? row.topic,
        description: row.description,
        fileUrl: row.file_url,
        storagePath: row.storage_path,
        courseId: row.course_id
    });
}

export function timetableToRequest(row = {}) {
    const publicId =
        row.storage_path ?? row.cloudinary_public_id;

    return compact({
        title: row.title ?? null,
        course: row.course,
        semester: row.semester,
        examType: row.exam_type,
        examYear: row.exam_year,
        dayOfWeek: row.day_of_week,
        effectiveFrom: row.effective_from,
        fileUrl: row.file_url,
        storagePath: publicId,
        fileName: row.file_name,
        courseId: row.course_id
    });
}

export function courseToRequest(row = {}) {
    return compact({
        title: row.title,
        description: row.description,
        priceInr: row.price_inr,
        // Blank/absent input means "no discount": send an explicit null
        // (never "") so Jackson can bind it to the BigDecimal field.
        mrpInr:
            row.mrp_inr === "" || row.mrp_inr === undefined ||
                row.mrp_inr === null
                ? null
                : Number(row.mrp_inr),
        validityDays: row.validity_days,
        slug: row.slug,
        highlights: row.highlights,
        sortOrder: row.sort_order,
        active: row.is_active
    });
}

export function settingsToRequest(row = {}) {
    return compact({
        upiId: row.upi_id,
        geminiUrl: row.gemini_url,
        telegramLink: row.telegram_link
    });
}

// =====================================================
// Account / admin user management
// =====================================================

/**
 * Admin: suspend (enabled=false) or restore (enabled=true) an account.
 * A suspended account keeps its data but cannot log in.
 */
export function setUserEnabled(userId, enabled) {
    return apiPatch(`/api/admin/users/${userId}/enabled`, { enabled });
}

/**
 * Admin: moderate a faculty sign-up — status is "APPROVED" or
 * "REJECTED" (the backend answers 400 for any other value and
 * for non-faculty targets). Rejecting also kills the account's
 * live JWT server-side.
 *
 * Resolves with the full envelope so the caller can show the
 * server's confirmation copy ("Faculty member approved" /
 * "Faculty application rejected").
 */
export function setUserRegistrationStatus(userId, status) {
    return apiPatchEnvelope(`/api/admin/users/${userId}/registration-status`, { status });
}

/** Admin: permanently delete an account and all of its data. */
export function adminDeleteUser(userId) {
    return apiDelete(`/api/admin/users/${userId}`);
}

// =====================================================
// 1+1 second-course offer
// =====================================================

/**
 * Snapshot of the 1+1 offer for the caller:
 * { eligible, discountPercent, ownedCourseCount, ownedCourseIds }.
 * Display only - the backend recomputes the real discount when a
 * purchase is actually created, so the client never sets the price.
 */
export function getSecondCourseOffer() {
    return apiGet("/api/purchases/offer");
}

// =====================================================
// Course validity (admin)
// =====================================================

/**
 * Approve a purchase with a custom validity window.
 * @param {object} validity - { validityDays: 30|90|180|365 } or
 *                            { validUntil: "2027-01-01T00:00:00" };
 *                            omit to use the course default.
 */
export function approvePurchaseWithValidity(purchaseId, validity = {}) {
    return apiPost(`/api/admin/purchases/${purchaseId}/approve`, compact(validity));
}

/** Replace an approved purchase's expiry with an exact date. */
export function setPurchaseValidity(purchaseId, validUntil) {
    return apiPut(`/api/admin/purchases/${purchaseId}/validity`, { validUntil });
}

// =====================================================
// Ratings & reviews
// =====================================================

/** Platform-wide average + total review count (public). */
export function getOverallRating() {
    return apiGet("/api/ratings/overall", false);
}

/** Average + count for one course (public). */
export function getCourseRating(courseId) {
    return apiGet(`/api/courses/${courseId}/rating`, false);
}

/** Reviews left on a course, newest first (public). */
export function getCourseReviews(courseId) {
    return apiGet(`/api/courses/${courseId}/reviews`, false);
}

/**
 * Submit (or update) the signed-in student's review. Only verified
 * purchasers may rate — the backend enforces that.
 */
export function submitCourseReview(courseId, rating, comment) {
    return apiPost(`/api/courses/${courseId}/reviews`, {
        rating: Number(rating),
        comment: comment || ""
    });
}

// =====================================================
// Smart search (content search inside uploaded PDFs)
// =====================================================

/**
 * Full-text search across the pre-built PDF page index. Returns ranked
 * hits: [{ category, contentId, title, subject, courseTitle, pageNumber,
 * preview, keyword }]. The backend enforces access (free content +
 * purchased courses only for students) inside the same query.
 */
export function smartSearch(query, limit = 20) {
    return apiGet(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

/** Autocomplete for the smart search box (subjects + document titles). */
export function smartSearchSuggestions(query) {
    return apiGet(`/api/search/suggest?q=${encodeURIComponent(query)}`);
}

/**
 * Availability counts for the four dashboard cards, resolved once per load
 * from a single request. Shape: { notes, tnp, pyq, timetable, syllabus }. The
 * backend scopes them to the caller: free content plus active purchases for a
 * student, everything the app would list for staff.
 */
export function dashboardSummary() {
    return apiGet("/api/dashboard/summary");
}

// =====================================================
// Syllabus
// =====================================================

/** Student: active syllabus of the caller's program + accessible bundles. */
export function getSyllabus() {
    return apiGet("/api/syllabus");
}

/** Admin: every syllabus row, inactive history included. */
export function getAdminSyllabus() {
    return apiGet("/api/admin/syllabus");
}

/** Faculty: own uploads plus syllabus linked to courses the caller launched. */
export function getFacultySyllabus() {
    return apiGet("/api/faculty/syllabus");
}

/**
 * Request body for create/update. `replaceExisting: true` confirms replacing
 * the active syllabus of the same course + semester (the backend answers 409
 * until the caller confirms).
 */
export function syllabusToRequest(row = {}) {
    return compact({
        title: row.title ?? null,
        course: row.course,
        semester: row.semester,
        fileUrl: row.file_url,
        storagePath: row.storage_path ?? row.cloudinary_public_id,
        fileName: row.file_name,
        courseId: row.course_id,
        status: row.status,
        replaceExisting: row.replace_existing
    });
}

export function createSyllabus(row = {}) {
    return apiPost("/api/admin/syllabus", syllabusToRequest(row));
}

export function updateSyllabus(id, row = {}) {
    return apiPut(`/api/admin/syllabus/${id}`, syllabusToRequest(row));
}

export function deleteSyllabus(id) {
    return apiDelete(`/api/admin/syllabus/${id}`);
}

export function createFacultySyllabus(row = {}) {
    return apiPost("/api/faculty/syllabus", syllabusToRequest(row));
}

export function updateFacultySyllabus(id, row = {}) {
    return apiPut(`/api/faculty/syllabus/${id}`, syllabusToRequest(row));
}

export function deleteFacultySyllabus(id) {
    return apiDelete(`/api/faculty/syllabus/${id}`);
}
