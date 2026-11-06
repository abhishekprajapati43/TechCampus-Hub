
// =====================================================
// TechCampus_Hub
// admin.js
// Cloudinary-compatible Admin Management
// =====================================================

import { $, showTimedMessage } from "./helpers.js";
import { courseStructure } from "./config.js";

import {
    apiPost,
    apiPut,
    apiDelete,
    noteToRequest,
    pyqToRequest,
    tnpToRequest,
    timetableToRequest,
    normalizeNote,
    normalizePyq,
    normalizeTnp,
    normalizeTimetable
} from "./api.js";

import {
    notes,
    tnpItems,
    pyqItems,
    timetableItems
} from "./data.js";

import {
    uploadOptionalPdf,
    removeStorage,
    preparePdfReplacement,
    resolveResourceType
} from "./storage.js";

import {
    currentUserRole
} from "./state.js";

import {
    notifyContentUpload
} from "./notifications.js";


// =====================================================
// Admin Check
// =====================================================

function isAdmin() {
    return currentUserRole === "admin";
}


// =====================================================
// Ensure Admin
// =====================================================

function ensureAdmin() {
    if (!isAdmin()) {
        throw new Error(
            "Administrator access is required."
        );
    }
}


// =====================================================
// Value Helpers
// =====================================================

function getValue(id) {
    const element = $(id);

    return element
        ? String(element.value || "").trim()
        : "";
}


function getNumber(id) {
    const value = getValue(id);

    if (value === "") {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}


function getFile(id) {
    const element = $(id);

    return element?.files?.[0] || null;
}


// =====================================================
// Admin Message
// =====================================================

const adminMessageTimers = {};

export function showAdminMessage(
    message,
    type = "success"
) {
    showTimedMessage(
        "adminMessage",
        message,
        type,
        4000,
        adminMessageTimers
    );
}


// =====================================================
// Refresh Application
// =====================================================

function dispatchRefresh() {
    window.dispatchEvent(
        new CustomEvent(
            "campusnotes:refresh"
        )
    );
}


// =====================================================
// Cloudinary Upload Result Helper
// =====================================================
//
// Cloudinary returns:
// {
//     file_url,
//     cloudinary_public_id,
//     file_name,
//     resource_type,
//     version
// }
//
// We save:
// file_url      -> actual Cloudinary URL
// storage_path  -> Cloudinary public_id
//
// This keeps compatibility with existing DB/code.
// =====================================================

function getUploadedFileUrl(uploaded) {
    return (
        uploaded?.file_url ||
        null
    );
}


function getUploadedPublicId(uploaded) {
    return (
        uploaded?.cloudinary_public_id ||
        uploaded?.storage_path ||
        null
    );
}


// =====================================================
// Notes Upload
// =====================================================

export async function uploadNotes(event) {
    event?.preventDefault();

    try {
        ensureAdmin();

        const subject =
            getValue("noteSubject");

        const title =
            getValue("noteTitle");

        const course =
            getValue("noteCourse");

        const branch =
            getValue("noteBranch");

        const year =
            getNumber("noteYear");

        const semester =
            getNumber("noteSemester");

        // Paid bundle this note belongs to ("" = free note).
        const bundleId =
            getValue("noteCourseBundle");

        const file =
            getFile("noteFile");


        // -------------------------------------------------
        // Validation
        // -------------------------------------------------

        if (!subject) {
            throw new Error(
                "Please enter the subject."
            );
        }

        if (!course) {
            throw new Error(
                "Please select the course."
            );
        }

        if (!branch) {
            throw new Error(
                "Please select the branch."
            );
        }

        if (!year) {
            throw new Error(
                "Please select the year."
            );
        }

        if (!semester) {
            throw new Error(
                "Please select the semester."
            );
        }

        if (!file) {
            throw new Error(
                "Please select a PDF file."
            );
        }


        // -------------------------------------------------
        // Upload PDF to Cloudinary
        // -------------------------------------------------

        const uploaded =
            await uploadOptionalPdf(
                file,
                "notes"
            );


        const fileUrl =
            getUploadedFileUrl(uploaded);

        const publicId =
            getUploadedPublicId(uploaded);


        if (!fileUrl) {
            throw new Error(
                "Cloudinary upload succeeded, but no file URL was returned."
            );
        }


        // -------------------------------------------------
        // Save Database Record
        // -------------------------------------------------

        try {

            const data = await apiPost(
                "/api/admin/notes",
                noteToRequest({
                    subject,
                    title: title || null,

                    course,
                    branch,
                    year,
                    semester,

                    // Paid bundle (only sent when a bundle is
                    // selected).
                    course_id: bundleId || null,

                    // Cloudinary URL
                    file_url: fileUrl,

                    // Cloudinary public ID
                    storage_path: publicId
                })
            );

            const record = normalizeNote(data);


            showAdminMessage(
                "Note uploaded successfully."
            );

            notifyContentUpload("notes", getValue("noteTitle"));

            event?.target?.reset();

            dispatchRefresh();

            return record;

        } catch (error) {

            // Cloudinary frontend cannot securely
            // delete assets without API secret.
            // removeStorage() handles this safely.
            if (publicId) {
                try {
                    // Delete with the SAME resource type Cloudinary
                    // stored the PDF under (unsigned presets may put
                    // it under "image", not "raw"). Passing the wrong
                    // type leaves the asset orphaned in Cloudinary
                    // even though the database row was never saved.
                    await removeStorage(
                        publicId,
                        resolveResourceType({ file_url: fileUrl })
                    );
                } catch (cleanupError) {
                    console.error(
                        "Notes upload cleanup error:",
                        cleanupError
                    );
                }
            }

            throw error;
        }

    } catch (error) {

        console.error(
            "Upload notes error:",
            error
        );

        showAdminMessage(
            error.message ||
                "Unable to upload note.",
            "error"
        );

        return null;
    }
}


// =====================================================
// TNP Upload
// =====================================================

export async function uploadTnp(event) {
    event?.preventDefault();

    try {
        ensureAdmin();

        const subject =
            getValue("tnpSubject");

        const title =
            getValue("tnpTitle");

        const file =
            getFile("tnpFile");


        // -------------------------------------------------
        // Validation
        // -------------------------------------------------

        if (!subject) {
            throw new Error(
                "Please enter the subject."
            );
        }

        if (!file) {
            throw new Error(
                "Please select a PDF file."
            );
        }


        // -------------------------------------------------
        // Upload to Cloudinary
        // -------------------------------------------------

        const uploaded =
            await uploadOptionalPdf(
                file,
                "tnp"
            );


        const fileUrl =
            getUploadedFileUrl(uploaded);

        const publicId =
            getUploadedPublicId(uploaded);


        if (!fileUrl) {
            throw new Error(
                "Cloudinary upload succeeded, but no file URL was returned."
            );
        }


        // -------------------------------------------------
        // Save TNP Record
        // -------------------------------------------------

        try {

            const data = await apiPost(
                "/api/admin/tnp-notes",
                tnpToRequest({
                    subject,

                    title:
                        title || null,

                    // IMPORTANT:
                    // Save Cloudinary URL
                    file_url: fileUrl,

                    // Save Cloudinary public ID
                    storage_path: publicId
                })
            );

            const record = normalizeTnp(data);


            showAdminMessage(
                "TNP resource uploaded successfully."
            );

            notifyContentUpload("tnp", getValue("tnpTitle"));

            event?.target?.reset();

            dispatchRefresh();

            return record;

        } catch (error) {

            if (publicId) {
                try {
                    // Delete with the SAME resource type Cloudinary
                    // stored the PDF under (unsigned presets may put
                    // it under "image", not "raw"). Passing the wrong
                    // type leaves the asset orphaned in Cloudinary
                    // even though the database row was never saved.
                    await removeStorage(
                        publicId,
                        resolveResourceType({ file_url: fileUrl })
                    );
                } catch (cleanupError) {
                    console.error(
                        "TNP upload cleanup error:",
                        cleanupError
                    );
                }
            }

            throw error;
        }

    } catch (error) {

        console.error(
            "Upload TNP error:",
            error
        );

        showAdminMessage(
            error.message ||
                "Unable to upload TNP resource.",
            "error"
        );

        return null;
    }
}


// =====================================================
// PYQ Upload
// =====================================================

export async function uploadPyq(event) {
    event?.preventDefault();

    try {
        ensureAdmin();

        const course =
            getValue("pyqCourse");

        const year =
            getNumber("pyqYear");

        const semester =
            getNumber("pyqSemester");

        const subject =
            getValue("pyqSubject");

        const title =
            getValue("pyqTitle");

        const file =
            getFile("pyqFile");


        // -------------------------------------------------
        // Validation
        // -------------------------------------------------

        if (!course) {
            throw new Error(
                "Please select the course."
            );
        }

        if (!year) {
            throw new Error(
                "Please select the previous year."
            );
        }

        if (!semester) {
            throw new Error(
                "Please select the semester."
            );
        }

        if (!subject) {
            throw new Error(
                "Please enter the subject."
            );
        }

        if (!file) {
            throw new Error(
                "Please select a PDF file."
            );
        }


        // -------------------------------------------------
        // Upload to Cloudinary
        // -------------------------------------------------

        const uploaded =
            await uploadOptionalPdf(
                file,
                "pyq"
            );


        const fileUrl =
            getUploadedFileUrl(uploaded);

        const publicId =
            getUploadedPublicId(uploaded);


        if (!fileUrl) {
            throw new Error(
                "Cloudinary upload succeeded, but no file URL was returned."
            );
        }


        // -------------------------------------------------
        // Save PYQ Record
        // -------------------------------------------------

        try {

            const data = await apiPost(
                "/api/admin/pyqs",
                pyqToRequest({
                    course,
                    year,
                    semester,
                    subject,

                    // PYQ title
                    title:
                        title || null,

                    // Cloudinary URL
                    file_url: fileUrl,

                    // Cloudinary public ID
                    storage_path: publicId
                })
            );

            const record = normalizePyq(data);


            showAdminMessage(
                "Previous year paper uploaded successfully."
            );

            notifyContentUpload("pyq", getValue("pyqTitle"));

            event?.target?.reset();

            dispatchRefresh();

            return record;

        } catch (error) {

            if (publicId) {
                try {
                    // Delete with the SAME resource type Cloudinary
                    // stored the PDF under (unsigned presets may put
                    // it under "image", not "raw"). Passing the wrong
                    // type leaves the asset orphaned in Cloudinary
                    // even though the database row was never saved.
                    await removeStorage(
                        publicId,
                        resolveResourceType({ file_url: fileUrl })
                    );
                } catch (cleanupError) {
                    console.error(
                        "PYQ upload cleanup error:",
                        cleanupError
                    );
                }
            }

            throw error;
        }

    } catch (error) {

        console.error(
            "Upload PYQ error:",
            error
        );

        showAdminMessage(
            error.message ||
                "Unable to upload previous year paper.",
            "error"
        );

        return null;
    }
}

// =====================================================
// Timetable Upload
// =====================================================

export async function uploadTimetable(event) {
    event?.preventDefault();

    let publicId = null;

    try {
        ensureAdmin();

        const course =
            getValue("timetableCourse");

        const semester =
            getNumber("timetableSemester");

        const examYear =
            getNumber("timetableExamYear");

        const examType =
            getValue("timetableExamType");

        const file =
            getFile("timetableFile");


        // -------------------------------------------------
        // Validation
        // -------------------------------------------------

        if (!course) {
            throw new Error(
                "Please select the course."
            );
        }

        if (!semester) {
            throw new Error(
                "Please select the semester."
            );
        }

        if (!examYear) {
            throw new Error(
                "Please enter the exam year."
            );
        }

        if (!examType) {
            throw new Error(
                "Please select the exam type."
            );
        }

        if (!file) {
            throw new Error(
                "Please select a timetable file."
            );
        }


        // -------------------------------------------------
        // Upload Timetable File to Cloudinary
        // -------------------------------------------------

        const uploaded =
            await uploadOptionalPdf(
                file,
                "timetable"
            );


        const fileUrl =
            getUploadedFileUrl(uploaded);

        publicId =
            getUploadedPublicId(uploaded);


        if (!fileUrl) {
            throw new Error(
                "Cloudinary upload succeeded, but no file URL was returned."
            );
        }


        // -------------------------------------------------
        // Save Timetable Record
        // -------------------------------------------------

        try {

            const data = await apiPost(
                "/api/admin/timetables",
                timetableToRequest({
                    course:
                        course,

                    semester:
                        semester,

                    exam_year:
                        examYear,

                    exam_type:
                        examType,

                    file_url:
                        fileUrl,

                    cloudinary_public_id:
                        publicId,

                    file_name:
                        file.name
                })
            );

            const record = normalizeTimetable(data);


            // -------------------------------------------------
            // Success
            // -------------------------------------------------

            showAdminMessage(
                "Exam timetable uploaded successfully."
            );

            notifyContentUpload(
                "timetable",
                `${course} ${examType}`.trim()
            );

            event?.target?.reset();

            dispatchRefresh();

            return record;

        } catch (databaseError) {

            // Database insert failed.
            // Try safe cleanup through storage.js.
            if (publicId) {
                try {
                    // Delete with the SAME resource type Cloudinary
                    // stored the PDF under (unsigned presets may put
                    // it under "image", not "raw"). Passing the wrong
                    // type leaves the asset orphaned in Cloudinary
                    // even though the database row was never saved.
                    await removeStorage(
                        publicId,
                        resolveResourceType({ file_url: fileUrl })
                    );
                } catch (cleanupError) {
                    console.error(
                        "Timetable upload cleanup error:",
                        cleanupError
                    );
                }
            }

            throw databaseError;
        }


    } catch (error) {

        console.error(
            "Upload timetable error:",
            error
        );

        showAdminMessage(
            error.message ||
                "Unable to upload timetable.",
            "error"
        );

        return null;
    }
}

// =====================================================
// Find Record
// =====================================================

export function findRecord(
    category,
    id
) {
    const targetId =
        String(id);

    let source = [];

    switch (category) {

        case "tnp":
            source = tnpItems;
            break;

        case "pyq":
            source = pyqItems;
            break;

        case "timetable":
            source = timetableItems;
            break;

        case "notes":
        default:
            source = notes;
            break;
    }

    return (
        source.find(
            item =>
                String(item.id) === targetId
        ) || null
    );
}


// =====================================================
// Edit Notes
// =====================================================

async function editNotes(
    id,
    values = {}
) {
    ensureAdmin();

    const record =
        findRecord(
            "notes",
            id
        );

    if (!record) {
        throw new Error(
            "Note not found."
        );
    }

    const payload = {
        subject:
            values.subject ??
            record.subject,

        title:
            values.title ??
            record.title,

        course:
            values.course ??
            record.course,

        branch:
            values.branch ??
            record.branch,

        year:
            values.year ??
            record.year,

        semester:
            values.semester ??
            record.semester
    };

    const data = await apiPut(
        `/api/admin/notes/${id}`,
        noteToRequest(payload)
    );

    return normalizeNote(data);
}


// =====================================================
// Edit TNP
// =====================================================

async function editTnp(
    id,
    values = {}
) {
    ensureAdmin();

    const record =
        findRecord(
            "tnp",
            id
        );

    if (!record) {
        throw new Error(
            "TNP resource not found."
        );
    }

    const payload = {
        subject:
            values.subject ??
            record.subject,

        title:
            values.title ??
            record.title
    };

    const data = await apiPut(
        `/api/admin/tnp-notes/${id}`,
        tnpToRequest(payload)
    );

    return normalizeTnp(data);
}


// =====================================================
// Edit PYQ
// =====================================================

async function editPyq(
    id,
    values = {}
) {
    ensureAdmin();

    const record =
        findRecord(
            "pyq",
            id
        );

    if (!record) {
        throw new Error(
            "Previous year paper not found."
        );
    }

    const payload = {
        course:
            values.course ??
            record.course,

        year:
            values.year ??
            record.year,

        semester:
            values.semester ??
            record.semester,

        subject:
            values.subject ??
            record.subject,

        title:
            values.title ??
            record.title
    };

    const data = await apiPut(
        `/api/admin/pyqs/${id}`,
        pyqToRequest(payload)
    );

    return normalizePyq(data);
}

// =====================================================
// Edit Timetable
// =====================================================

async function editTimetable(
    id,
    values = {}
) {
    ensureAdmin();

    const record =
        findRecord(
            "timetable",
            id
        );

    if (!record) {
        throw new Error(
            "Timetable record not found."
        );
    }


    const payload = {

        course:
            values.course ??
            record.course,

        semester:
            values.semester ??
            record.semester,

        exam_year:
            values.exam_year ??
            record.exam_year,

        exam_type:
            values.exam_type ??
            record.exam_type
    };


    const data = await apiPut(
        `/api/admin/timetables/${id}`,
        timetableToRequest(payload)
    );


    return normalizeTimetable(data);
}

// =====================================================
// Get Admin API Path
// =====================================================
//
// Maps an admin panel category to its backend REST
// resource path (used for PUT/DELETE on a record).
// =====================================================

function getContentPath(category) {
    switch (category) {

        case "tnp":
            return "/api/admin/tnp-notes";

        case "pyq":
            return "/api/admin/pyqs";

        case "timetable":
            return "/api/admin/timetables";

        case "notes":
        default:
            return "/api/admin/notes";
    }
}


// =====================================================
// Normalize record by category
// =====================================================

function normalizeRecord(category, data) {
    switch (category) {

        case "tnp":
            return normalizeTnp(data);

        case "pyq":
            return normalizePyq(data);

        case "timetable":
            return normalizeTimetable(data);

        case "notes":
        default:
            return normalizeNote(data);
    }
}


// =====================================================
// Replace PDF
// =====================================================
//
// Cloudinary version:
//
// 1. Upload new PDF
// 2. Get new Cloudinary URL
// 3. Get new Cloudinary public ID
// 4. Update backend record
//
// IMPORTANT:
// Cloudinary deletion requires API secret.
// Frontend must NOT contain Cloudinary API secret.
// Therefore removeStorage() safely handles cleanup.
// =====================================================

async function replaceRecordPdf(
    category,
    id,
    newFile
) {
    ensureAdmin();

    if (!newFile) {
        return null;
    }


    const record =
        findRecord(
            category,
            id
        );

    if (!record) {
        throw new Error(
            "Resource not found."
        );
    }


    // -------------------------------------------------
    // Upload replacement to Cloudinary
    // -------------------------------------------------

    const replacement =
        await preparePdfReplacement(
            newFile,
            category
        );


    const newFileUrl =
        replacement?.file_url ||
        null;


    const newPublicId =
        replacement?.cloudinary_public_id ||
        replacement?.storage_path ||
        null;


    if (!newFileUrl) {
        try {
            await replacement?.cleanup?.();
        } catch (cleanupError) {
            console.error(
                "Replacement cleanup error:",
                cleanupError
            );
        }

        throw new Error(
            "New PDF uploaded but Cloudinary URL was not returned."
        );
    }


    if (!newPublicId) {
        try {
            await replacement?.cleanup?.();
        } catch (cleanupError) {
            console.error(
                "Replacement cleanup error:",
                cleanupError
            );
        }

        throw new Error(
            "New PDF uploaded but Cloudinary public ID was not returned."
        );
    }


    const oldPublicId =
        record.storage_path ||
        null;


    // Cloudinary stores this PDF under a specific resource
    // type (image OR raw). Deleting with the wrong type
    // silently fails, so resolve the type from the record's
    // own file_url.
    const oldResourceType =
        resolveResourceType(record);


    try {

        const path =
            getContentPath(category);


        // -------------------------------------------------
        // Update backend record (partial PUT: only the
        // file fields change)
        // -------------------------------------------------

        const data = await apiPut(
            `${path}/${id}`,
            {
                fileUrl: newFileUrl,
                storagePath: newPublicId
            }
        );


        // Tell storage.js that upload is now committed
        if (
            typeof replacement.markCommitted ===
            "function"
        ) {
            replacement.markCommitted();
        }


        // -------------------------------------------------
        // Try to clean old Cloudinary asset
        // -------------------------------------------------

        if (
    oldPublicId &&
    oldPublicId !== newPublicId
) {

    try {

        await removeStorage(
            oldPublicId,
            oldResourceType
        );

    } catch (storageError) {

        console.error(
            "Old Cloudinary PDF deletion error:",
            storageError
        );

        showAdminMessage(
            "Resource updated, but old PDF could not be deleted.",
            "error"
        );
    }
}

        return normalizeRecord(category, data);

    } catch (error) {

        // If DB update failed, clean the new upload
        // when possible.
        try {

            if (
                typeof replacement.cleanup ===
                "function"
            ) {
                await replacement.cleanup();
            }

        } catch (cleanupError) {

            console.error(
                "Replacement cleanup error:",
                cleanupError
            );
        }


        throw error;
    }
}


// =====================================================
// Edit Complete Record
// =====================================================

export async function editRecord(
    category,
    id,
    values = {},
    newFile = null
) {
    ensureAdmin();

    let updatedRecord;


    switch (category) {

        case "tnp":

            updatedRecord =
                await editTnp(
                    id,
                    values
                );

            break;


        case "pyq":

            updatedRecord =
                await editPyq(
                    id,
                    values
                );

            break;


        case "timetable":

            updatedRecord =
                await editTimetable(
                    id,
                    values
                );

            break;


        case "notes":
        default:

            updatedRecord =
                await editNotes(
                    id,
                    values
                );

            break;
    }


    // -------------------------------------------------
    // Replace PDF if new file selected
    // -------------------------------------------------

    if (newFile) {

        updatedRecord =
            await replaceRecordPdf(
                category,
                id,
                newFile
            );
    }


    showAdminMessage(
        "Resource updated successfully."
    );


    dispatchRefresh();

    return updatedRecord;
}


// =====================================================
// Delete Record
// =====================================================

export async function deleteRecord(
    category,
    id
) {
    ensureAdmin();


    const record =
        findRecord(
            category,
            id
        );

    if (!record) {
        throw new Error(
            "Resource not found."
        );
    }


    const path =
        getContentPath(category);


    // -------------------------------------------------
    // Delete backend record
    // -------------------------------------------------

    await apiDelete(
        `${path}/${id}`
    );


    // -------------------------------------------------
    // Cloudinary cleanup
    // -------------------------------------------------
    //
    // Frontend cannot securely delete Cloudinary
    // assets because API Secret must remain private.
    //
    // removeStorage() safely handles this.
    // -------------------------------------------------

    if (record.storage_path) {

        try {

            await removeStorage(
                record.storage_path,
                resolveResourceType(record)
            );

        } catch (storageError) {

            console.error(
                "Storage cleanup error:",
                storageError
            );

            showAdminMessage(
                "Record deleted, but the Cloudinary PDF could not be removed.",
                "error"
            );
        }
    }


    showAdminMessage(
        "Resource deleted successfully."
    );


    dispatchRefresh();

    return true;
}


// =====================================================
// Edit Modal Helpers
// =====================================================

function setFieldValue(
    id,
    value
) {
    const element =
        $(id);


    if (!element) {
        return;
    }


    element.value =
        value === null ||
        value === undefined
            ? ""
            : String(value);
}


function showEditField(
    id,
    visible
) {
    const element =
        $(id);


    if (!element) {
        return;
    }


    const group =
        element.closest(
            ".edit-field-group"
        ) ||
        element.closest(
            ".filter-group"
        ) ||
        element.parentElement;


    if (group) {

        group.classList.toggle(
            "hidden",
            !visible
        );
    }
}


function clearEditFileInput() {

    const input =
        $("editResourceFile");


    if (input) {
        input.value = "";
    }
}

// =====================================================
// TIMETABLE SEMESTER OPTIONS
// Driven by courseStructure in config.js, e.g.
// MCA = 4, B.Tech = 8, BCA = 6 semesters. Labels are
// matched like the backend's ProgramFilter, so legacy
// values such as "BTech" still resolve correctly.
// =====================================================

// Same comparison the backend uses: lowercase and strip
// every non-alphanumeric character ("B.Tech" -> "btech").
function normalizeCourseLabel(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function updateTimetableSemesterOptions(
    course,
    semesterSelectId
) {
    const semesterSelect =
        $(semesterSelectId);

    if (!semesterSelect) {
        return;
    }

    const selectedSemester =
        semesterSelect.value;

    semesterSelect.innerHTML = `
        <option value="">
            Select Semester
        </option>
    `;

    const structure = Object.entries(courseStructure)
        .find(
            ([key]) =>
                normalizeCourseLabel(key) ===
                normalizeCourseLabel(course)
        )?.[1];

    const totalSemesters = structure?.semesters || 0;

    for (
        let semester = 1;
        semester <= totalSemesters;
        semester++
    ) {
        const option =
            document.createElement("option");

        option.value =
            String(semester);

        option.textContent =
            `Semester ${semester}`;

        semesterSelect.appendChild(
            option
        );
    }

    // Keep previous value if valid
    if (
        selectedSemester &&
        Number(selectedSemester) <=
            totalSemesters
    ) {
        semesterSelect.value =
            selectedSemester;
    }
}

// =====================================================
// Populate Edit Modal
// ====================================================
function populateEditModal(
    category,
    record
) {
    setFieldValue(
        "editResourceId",
        record.id
    );

    setFieldValue(
        "editResourceCategory",
        category
    );

    const isNotes =
        category === "notes";

    const isTnp =
        category === "tnp";

    const isPyq =
        category === "pyq";

    const isTimetable =
        category === "timetable";


    // =====================================================
    // Make sure SELECT has the current value as an option
    // =====================================================

    function ensureSelectOption(
        fieldId,
        value,
        label = value
    ) {
        const select = $(fieldId);

        if (!select || value === undefined || value === null || value === "") {
            return;
        }

        const stringValue = String(value);

        const exists = Array.from(
            select.options
        ).some(
            option =>
                String(option.value) === stringValue
        );

        if (!exists) {
            const option =
                document.createElement("option");

            option.value = stringValue;
            option.textContent = label;

            select.appendChild(option);
        }

        select.value = stringValue;
    }


    // =====================================================
    // Normal Fields
    // =====================================================

    setFieldValue(
        "editResourceSubject",
        record.subject || ""
    );

    setFieldValue(
        "editResourceTitle",
        record.title || ""
    );

    setFieldValue(
        "editResourceCourse",
        record.course || ""
    );

    setFieldValue(
        "editResourceBranch",
        record.branch || ""
    );

    setFieldValue(
        "editResourceYear",
        record.year || ""
    );

    setFieldValue(
        "editResourceSemester",
        record.semester || ""
    );

    setFieldValue(
        "editResourceExamYear",
        record.exam_year || ""
    );


    // =====================================================
    // TIMETABLE
    // =====================================================
if (isTimetable) {

    // -------------------------------------------------
    // Course
    // -------------------------------------------------

    ensureSelectOption(
        "editResourceCourse",
        record.course
    );


    // -------------------------------------------------
    // Semester according to Course
    // -------------------------------------------------

    updateTimetableSemesterOptions(
        record.course,
        "editResourceSemester"
    );


    const editSemester =
        $("editResourceSemester");

    if (editSemester) {

        editSemester.value =
            String(record.semester || "");
    }


    // -------------------------------------------------
    // Exam Year
    // Admin manually enters the year
    // -------------------------------------------------

    setFieldValue(
        "editResourceExamYear",
        record.exam_year || ""
    );


    // -------------------------------------------------
    // Exam Type
    // -------------------------------------------------

    const examTypeSelect =
        $("editResourceExamType");

    if (examTypeSelect) {

        examTypeSelect.value =
            record.exam_type || "";
    }
}

    // =====================================================
    // Clear New File
    // =====================================================

    clearEditFileInput();

    // =====================================================
    // Show / Hide Fields
    // =====================================================

    // Subject
    // Timetable me subject nahi chahiye.

    showEditField(
        "editResourceSubject",
        isNotes ||
        isTnp ||
        isPyq
    );


    // Title
    showEditField(
        "editResourceTitle",
        isNotes ||
        isTnp ||
        isPyq
    );


    // Course
    showEditField(
        "editResourceCourse",
        isNotes ||
        isPyq ||
        isTimetable
    );


    // Branch
    showEditField(
        "editResourceBranch",
        isNotes
    );


    // Year
    showEditField(
        "editResourceYear",
        isNotes
    );


    // Semester
    showEditField(
        "editResourceSemester",
        isNotes ||
        isPyq ||
        isTimetable
    );


    // Exam Year
    showEditField(
        "editResourceExamYear",
        isTimetable
    );


    // Exam Type
    showEditField(
        "editResourceExamType",
        isTimetable
    );
}

// =====================================================
// Open Edit Dialog
// =====================================================

export function openEditDialog(
    category,
    id
) {
    ensureAdmin();


    const record =
        findRecord(
            category,
            id
        );


    if (!record) {

        showAdminMessage(
            "Resource not found.",
            "error"
        );

        return null;
    }


    window.dispatchEvent(
        new CustomEvent(
            "campusnotes:open-edit",
            {
                detail: {
                    category,
                    record
                }
            }
        )
    );


    return record;
}


// =====================================================
// Setup Admin Dynamic Actions
// =====================================================

export function setupAdminDynamicActions() {

    if (
        document.body.dataset
            .adminActionsReady === "true"
    ) {
        return;
    }


    document.body.dataset
        .adminActionsReady = "true";


    // -------------------------------------------------
    // Edit Button
    // -------------------------------------------------

    window.addEventListener(
        "campusnotes:edit-resource",
        event => {

            if (!isAdmin()) {
                return;
            }


            const {
                category,
                id
            } = event.detail || {};


            if (!category || !id) {
                return;
            }


            openEditDialog(
                category,
                id
            );
        }
    );


    // -------------------------------------------------
    // Delete Button
    // -------------------------------------------------

    window.addEventListener(
        "campusnotes:delete-resource",
        async event => {

            if (!isAdmin()) {
                return;
            }


            const {
                category,
                id
            } = event.detail || {};


            if (!category || !id) {
                return;
            }


            const record =
                findRecord(
                    category,
                    id
                );


            if (!record) {

                showAdminMessage(
                    "Resource not found.",
                    "error"
                );

                return;
            }


            const title =
                record.title ||
                record.subject ||
                "this resource";


            const confirmed =
                window.confirm(
                    `Are you sure you want to delete "${title}"?`
                );


            if (!confirmed) {
                return;
            }


            try {

                await deleteRecord(
                    category,
                    id
                );

            } catch (error) {

                console.error(
                    "Delete resource error:",
                    error
                );


                showAdminMessage(
                    error.message ||
                        "Unable to delete resource.",
                    "error"
                );
            }
        }
    );


    // -------------------------------------------------
    // Open Edit Modal
    // -------------------------------------------------

    window.addEventListener(
        "campusnotes:open-edit",
        event => {

            if (!isAdmin()) {
                return;
            }


            const {
                category,
                record
            } = event.detail || {};


            if (!category || !record) {
                return;
            }


            const editModal =
                $("editResourceModal");


            if (!editModal) {

                showAdminMessage(
                    "Edit form is not available.",
                    "error"
                );

                return;
            }


            editModal.dataset.category =
                category;


            editModal.dataset.recordId =
                String(record.id);


            populateEditModal(
                category,
                record
            );


            editModal.classList.remove(
                "hidden"
            );
        }
    );
}

