
// =====================================================

// TechCampus_Hub

// render.js

// =====================================================



import {

    $,

    escapeHtml,

    formatDate,

    formatTime

} from "./helpers.js";



import {

    getFilteredNotes,

    getFilteredTnp,

    getFilteredPyq,

    getFilteredTimetable

} from "./search.js";



import {

    getPdfUrl

} from "./storage.js";



import {

    currentUserRole

} from "./state.js";

import {

    isNoteLocked,

    courseTitleFor

} from "./courses.js";

import {

    favoriteButtonHtml,

    syncFavoriteButtons

} from "./favorites.js";





// =====================================================

// Role Helper

// =====================================================



function isAdmin() {

    return currentUserRole === "admin";

}





// =====================================================

// Get Resource Container

// =====================================================



function getContainer() {

    return $("notesContainer");

}





// =====================================================

// Empty Message

// =====================================================



function emptyMessage(message) {

    return `

        <div class="col-span-full">

            <div class="rounded-2xl border border-dashed

                        border-gray-300 bg-white p-10

                        text-center shadow-sm">



                <div class="mx-auto mb-4 flex h-14 w-14

                            items-center justify-center

                            rounded-full bg-gray-100">



                    <i class="fa-solid fa-folder-open

                              text-xl text-gray-400"></i>

                </div>



                <h3 class="text-lg font-semibold

                           text-gray-800">

                    ${escapeHtml(message)}

                </h3>



                <p class="mt-2 text-sm text-gray-500">

                    Try changing the filters or search

                    for another resource.

                </p>

            </div>

        </div>

    `;

}





// =====================================================

// Get File URL

// =====================================================

//

// Cloudinary assets are public: file_url is preferred,

// with storage_path kept for backward compatibility.

// =====================================================



async function getFileUrl(item) {

    if (!item) {

        return "";

    }



    // Existing public/external URL

    if (item.file_url) {

        return item.file_url;

    }



    // Legacy storage_path records

    if (item.storage_path) {

        return await getPdfUrl(item);

    }



    return "";

}





// =====================================================

// PDF Action Buttons

// =====================================================



function actionButtons(

    fileUrl,

    item,

    category

) {

    const buttons = [];



    // Students never receive the storage URL from the API: their
    // "View" button opens the secure in-app viewer, which pulls the
    // bytes through the authenticated backend relay (PDF.js canvas -
    // no download/print/save UI, right-click and save shortcuts off).

    if (!isAdmin() && item?.id != null) {

        buttons.push(`

            <button

                type="button"

                class="inline-flex items-center gap-2

                       rounded-lg bg-gray-100 px-2.5 py-1.5

                       text-sm font-medium text-gray-700

                       transition hover:bg-gray-200"

                data-pdf-open

                data-pdf-category="${escapeHtml(category)}"

                data-pdf-id="${escapeHtml(item.id)}"

                data-pdf-title="${escapeHtml(item.title || item.subject || item.topic || "Document")}"

            >

                <i class="fa-regular fa-eye"></i>

                View

            </button>

        `);

    } else if (fileUrl) {

        buttons.push(`

            <a

                href="${escapeHtml(fileUrl)}"

                target="_blank"

                rel="noopener noreferrer"

                class="inline-flex items-center gap-2

                       rounded-lg bg-gray-100 px-2.5 py-1.5

                       text-sm font-medium text-gray-700

                       transition hover:bg-gray-200"

            >

                <i class="fa-regular fa-eye"></i>

                View

            </a>

        `);



        // The Download action is kept for administrators -
        // students only ever get the in-app viewer.

        if (isAdmin()) {

            buttons.push(`

            <a

                href="${escapeHtml(fileUrl)}"

                download

                target="_blank"

                rel="noopener noreferrer"

                class="inline-flex items-center gap-2

                       rounded-lg bg-gray-100 px-2.5 py-1.5

                       text-sm font-medium text-gray-700

                       transition hover:bg-gray-200"

            >

                <i class="fa-solid fa-download"></i>

                Download

            </a>

        `);

        }

    }



    // -------------------------------------------------

    // Admin actions

    // -------------------------------------------------



    if (isAdmin() && item?.id !== undefined) {

        buttons.push(`

            <button

                type="button"

                class="edit-resource-btn

                       inline-flex items-center gap-2

                       rounded-lg bg-blue-50 px-2.5 py-1.5

                       text-sm font-medium text-blue-700

                       transition hover:bg-blue-100"

                data-resource-category="${escapeHtml(category)}"

                data-resource-id="${escapeHtml(item.id)}"

            >

                <i class="fa-solid fa-pen"></i>

                Edit

            </button>



            <button

                type="button"

                class="delete-resource-btn

                       inline-flex items-center gap-2

                       rounded-lg bg-red-50 px-2.5 py-1.5

                       text-sm font-medium text-red-700

                       transition hover:bg-red-100"

                data-resource-category="${escapeHtml(category)}"

                data-resource-id="${escapeHtml(item.id)}"

            >

                <i class="fa-solid fa-trash"></i>

                Delete

            </button>

        `);

    }



    if (!buttons.length) {

        return "";

    }



    return `

        <div class="ml-auto flex flex-wrap gap-2">

            ${buttons.join("")}

        </div>

    `;

}





// =====================================================

// Base Resource Card

// =====================================================

// Notes and TNP records can carry related YouTube lectures.
const VIDEO_CATEGORIES = new Set(["notes", "tnp"]);

/**
 * "Videos" pill shown on the title row next to the favourite heart.
 * Only rendered when the list payload reports at least one attached
 * video - the video rows themselves are fetched when the pill is clicked.
 */
function relatedVideosButtonHtml(category, item, locked = false) {
    if (locked || !item || !item.id || !VIDEO_CATEGORIES.has(category)) {
        return "";
    }

    const count = Number(item.video_count || 0);

    if (!Number.isFinite(count) || count < 1) {
        return "";
    }

    const title = item.title || item.subject || "this document";

    return `
        <button
            type="button"
            class="related-videos-btn shrink-0 inline-flex h-9 items-center
                   justify-center gap-1.5 rounded-full bg-red-50 px-2.5
                   text-xs font-semibold text-red-600 transition
                   hover:bg-red-100 sm:px-3"
            data-related-videos
            data-related-category="${escapeHtml(String(category))}"
            data-related-id="${escapeHtml(String(item.id))}"
            data-related-title="${escapeHtml(String(title))}"
            aria-label="Related videos"
            title="Related videos"
        >
            <i class="fa-brands fa-youtube text-sm"></i>
            <span class="hidden sm:inline">Videos</span>
        </button>
    `;
}

function card({
    icon = "fa-file-pdf",
    iconClass = "bg-red-50 text-red-600",
    title = "Untitled",
    subtitle = "",
    meta = "",
    description = "",
    fileUrl = "",
    item = null,
    category = "",
    locked = false
}) {
    return `
        <article
            class="resource-card group rounded-2xl
                   border border-gray-200 bg-white
                   p-2.5 shadow-sm transition
                   hover:-translate-y-0.5
                   hover:shadow-md"
        >
            <div class="flex items-start gap-2.5">

                <div class="flex h-9 w-9 shrink-0
                            items-center justify-center
                            rounded-lg ${iconClass}">
                    <i class="fa-solid ${icon}"></i>
                </div>

                <div class="min-w-0 flex-1">

                    <div class="flex items-start
                                justify-between gap-3">

                        <div class="min-w-0">

                            <h3 class="truncate text-sm
                                       font-semibold text-gray-900"
                                title="${escapeHtml(title)}">

                                ${escapeHtml(
                                    title || "Untitled"
                                )}
                            </h3>
                        </div>

                        <div class="flex items-center gap-1.5 shrink-0">
                            ${relatedVideosButtonHtml(category, item, locked)}
                            ${favoriteButtonHtml(category, item ? item.id : "", title)}
                        </div>
                    </div>

                    ${
                        description
                            ? `
                                <p class="mt-1.5 line-clamp-2
                                          text-xs text-gray-500">

                                    ${escapeHtml(
                                        description
                                    )}
                                </p>
                              `
                            : ""
                    }

                    <div class="mt-1 flex flex-wrap items-center
                                gap-x-1 gap-y-1 text-xs">

                        ${
                            subtitle
                                ? `
                                    <p class="font-medium
                                              text-gray-600">

                                        ${escapeHtml(
                                            subtitle
                                        )}
                                    </p>
                                  `
                                : ""
                        }

                        ${
                            fileUrl
                                ? `
                                    <span
                                        class="shrink-0 rounded-full
                                               bg-red-50 px-2 py-0.5
                                               text-xs font-medium
                                               text-red-600"
                                    >
                                        PDF
                                    </span>
                                  `
                                : ""
                        }
                        ${meta}
                        ${
                            locked
                                ? `
                                    <div class="ml-auto flex flex-wrap items-center
                                                gap-2">
                                        <span class="inline-flex items-center gap-2 rounded-lg
                                               bg-amber-100 px-2.5 py-1.5 text-sm
                                               font-medium text-amber-700">
                                            <i class="fa-solid fa-lock"></i>
                                            Premium note
                                        </span>
                                        <a href="./courses.html"
                                           class="inline-flex items-center gap-2 rounded-lg
                                                  bg-blue-600 px-2.5 py-1.5 text-sm
                                                  font-medium text-white transition
                                                  hover:bg-blue-700">
                                            <i class="fa-solid fa-cart-shopping"></i>
                                            Unlock course
                                        </a>
                                    </div>
                                  `
                                : actionButtons(

                                    fileUrl,

                                    item,

                                    category

                                )
                        }
                    </div>
                </div>
            </div>
        </article>
    `;
}





// =====================================================

// Meta Badge

// =====================================================



function metaBadge(

    label,

    value,

    className = "bg-gray-100 text-gray-600"

) {

    if (

        value === null ||

        value === undefined ||

        String(value).trim() === ""

    ) {

        return "";

    }



    return `

        <span

            class="inline-flex items-center gap-1

                   rounded-full px-2 py-0.5

                   ${className}"

        >

            <span class="font-medium">

                ${escapeHtml(label)}:

            </span>



            <span>

                ${escapeHtml(value)}

            </span>

        </span>

    `;

}





// =====================================================

// Uploader Attribution Badge

// =====================================================

//

// Admin-only: note cards show who uploaded the note. The fields are

// populated solely by GET /api/admin/notes, so student/faculty cards

// (where created_by_name is null) render exactly as before.

// =====================================================



function uploaderBadge(note) {

    if (!isAdmin() || !note.created_by_name) {

        return "";

    }

    const role = String(note.created_by_role || "").toLowerCase();

    const rolePill =

        role === "faculty"

            ? `

                <span

                    class="inline-flex items-center gap-1

                           rounded-full px-2 py-0.5

                           bg-violet-100 text-violet-700"

                >

                    Faculty

                </span>

              `

            : role === "admin"

                ? `

                    <span

                        class="inline-flex items-center gap-1

                               rounded-full px-2 py-0.5

                               bg-slate-100 text-slate-600"

                    >

                        Admin

                    </span>

                  `

                : "";

    return `

        <span

            class="inline-flex items-center gap-1

                   rounded-full px-2 py-0.5

                   bg-gray-100 text-gray-600"

        >

            <span class="font-medium">

                Uploaded by

            </span>

            <span>

                ${escapeHtml(note.created_by_name)}

            </span>

        </span>

        ${rolePill}

    `;

}





// =====================================================

// Render Notes Card

// =====================================================

async function renderNoteCard(note) {

    const locked =

        isNoteLocked(note);



    const meta = [

        metaBadge(

            "Course",

            note.course

        ),



        metaBadge(

            "Branch",

            note.branch

        ),



        metaBadge(

            "Year",

            note.year

        ),



        metaBadge(

            "Semester",

            note.semester

        ),



        metaBadge(

            "Subject",

            note.subject,

            "bg-blue-50 text-blue-700"

        ),

        ...(locked
            ? [metaBadge(
                "Bundle",
                courseTitleFor(note.course_id),
                "bg-amber-50 text-amber-700"
              )]
            : []),

        // "" for non-admin payloads, so those cards are unchanged.
        uploaderBadge(note)

    ].join("");



    // Locked notes never resolve the file URL — the card
    // only advertises the course that unlocks it.
    if (locked) {
        return card({

            icon: "fa-lock",

            iconClass: "bg-amber-50 text-amber-600",

            title:

                note.title ||

                note.subject ||

                "Study Note",



            subtitle:

                note.subject || "",



            meta,

            locked: true,

            item: note,

            category: "notes"

        });
    }

    const fileUrl =

        await getFileUrl(note);



    return card({

        icon: "fa-book-open",

        iconClass:

            "bg-blue-50 text-blue-600",



        title:

            note.title ||

            note.subject ||

            "Study Note",



        subtitle:

            note.subject || "",



        meta,



        fileUrl,



        item: note,

        category: "notes"

    });
}





// =====================================================

// Render TNP Card

// =====================================================



async function renderTnpCard(item) {

    const locked =

        isNoteLocked(item);



    const meta = [

        metaBadge(

            "Subject",

            item.subject,

            "bg-purple-50 text-purple-700"

        ),

        ...(locked
            ? [metaBadge(
                "Bundle",
                courseTitleFor(item.course_id),
                "bg-amber-50 text-amber-700"
              )]
            : [])

    ].join("");



    // Locked TNP teasers never resolve the file URL —
    // the card only advertises the course that unlocks it.
    if (locked) {
        return card({

            icon: "fa-lock",

            iconClass: "bg-amber-50 text-amber-600",

            title:

                item.title ||

                item.subject ||

                "Training & Placement",

            subtitle:

                item.subject || "",

            meta,

            locked: true,

            item,

            category: "tnp"

        });
    }

    const fileUrl =

        await getFileUrl(item);



    return card({

        icon: "fa-briefcase",

        iconClass:

            "bg-purple-50 text-purple-600",



        title:

            item.title ||

            item.subject ||

            "Training & Placement",



        subtitle:

            item.subject || "",



        meta,



        fileUrl,



        item,



        category: "tnp"

    });

}





// =====================================================

// Render PYQ Card

// =====================================================



async function renderPyqCard(item) {

    const fileUrl =

        await getFileUrl(item);



    const meta = [

        metaBadge(

            "Course",

            item.course

        ),



        metaBadge(

            "Year",

            item.year

        ),



        metaBadge(

            "Semester",

            item.semester

        ),



        metaBadge(

            "Subject",

            item.subject,

            "bg-green-50 text-green-700"

        )

    ].join("");



    return card({

        icon: "fa-file-lines",

        iconClass:

            "bg-green-50 text-green-600",



        title:

            item.title ||

            item.subject ||

            "Previous Year Paper",



        subtitle:

            item.subject || "",



        meta,



        fileUrl,



        item,



        category: "pyq"

    });

}





// =====================================================

// Render Timetable Card

// =====================================================



async function renderTimetableCard(item) {

    const fileUrl =

        await getFileUrl(item);



    const examDate =

        formatDate(item.exam_date);



    const startTime =

        formatTime(item.start_time);



    const endTime =

        formatTime(item.end_time);



    const timeText =

        startTime && endTime

            ? `${startTime} - ${endTime}`

            : startTime || endTime;



    const meta = [

        metaBadge(

            "Course",

            item.course

        ),



        metaBadge(

            "Semester",

            item.semester

        ),



        metaBadge(

            "Exam Year",

            item.exam_year

        ),



        metaBadge(

            "Date",

            examDate,

            "bg-orange-50 text-orange-700"

        ),



        metaBadge(

            "Time",

            timeText

        ),



        metaBadge(

            "Type",

            item.exam_type

        ),



        metaBadge(

            "Subject",

            item.subject,

            "bg-indigo-50 text-indigo-700"

        )

    ].join("");



    return card({

        icon: "fa-calendar-days",

        iconClass:

            "bg-orange-50 text-orange-600",



        title:

            item.subject ||

            "Exam Timetable",



        subtitle:

            item.exam_type ||

            "Examination",



        meta,



        fileUrl,



        item,



        category: "timetable"

    });

}





// =====================================================

// Render Notes

// =====================================================



export async function renderNotes(

    items = null

) {

    const container =

        getContainer();



    if (!container) {

        return;

    }



    const data =

        Array.isArray(items)

            ? items

            : getFilteredNotes();



    if (!data.length) {

        container.innerHTML =

            emptyMessage(

                "No notes found"

            );



        return;

    }



    const cards =

        await Promise.all(

            data.map(

                item =>

                    renderNoteCard(item)

            )

        );



    container.innerHTML =

        cards.join("");

}





// =====================================================

// Render TNP

// =====================================================



export async function renderTnp(

    items = null

) {

    const container =

        getContainer();



    if (!container) {

        return;

    }



    const data =

        Array.isArray(items)

            ? items

            : getFilteredTnp();



    if (!data.length) {

        container.innerHTML =

            emptyMessage(

                "No TNP resources found"

            );



        return;

    }



    const cards =

        await Promise.all(

            data.map(

                item =>

                    renderTnpCard(item)

            )

        );



    container.innerHTML =

        cards.join("");

}





// =====================================================

// Render PYQ

// =====================================================



export async function renderPyq(

    items = null

) {

    const container =

        getContainer();



    if (!container) {

        return;

    }



    const data =

        Array.isArray(items)

            ? items

            : getFilteredPyq();



    if (!data.length) {

        container.innerHTML =

            emptyMessage(

                "No previous year papers found"

            );



        return;

    }



    const cards =

        await Promise.all(

            data.map(

                item =>

                    renderPyqCard(item)

            )

        );



    container.innerHTML =

        cards.join("");

}





// =====================================================

// Render Timetable

// =====================================================



export async function renderTimetable(

    items = null

) {

    const container =

        getContainer();



    if (!container) {

        return;

    }



    const data =

        Array.isArray(items)

            ? items

            : getFilteredTimetable();



    if (!data.length) {

        container.innerHTML =

            emptyMessage(

                "No exam timetable found"

            );



        return;

    }



    const cards =

        await Promise.all(

            data.map(

                item =>

                    renderTimetableCard(item)

            )

        );



    container.innerHTML =

        cards.join("");

}





// =====================================================

// Render Current Category

// =====================================================



export async function renderCurrentCategory(

    category = null

) {

    const categorySelect =

        $("searchCategory");



    const selectedCategory =

        category ||

        categorySelect?.value ||

        "notes";



    switch (selectedCategory) {

        case "tnp":

            await renderTnp();

            break;



        case "pyq":

            await renderPyq();

            break;



        case "timetable":

            await renderTimetable();

            break;



        case "notes":

        default:

            await renderNotes();

            break;

    }



    updateCount(

        selectedCategory

    );



    updateCategoryLabel(

        selectedCategory

    );

    // Hearts must reflect the student's favourites
    // after every re-render.
    syncFavoriteButtons();

}





// =====================================================

// Update Count

// =====================================================



export function updateCount(

    category = null

) {

    const countElement =

        $("totalNotesCount");



    if (!countElement) {

        return;

    }



    const categorySelect =

        $("searchCategory");



    const selectedCategory =

        category ||

        categorySelect?.value ||

        "notes";



    let count = 0;



    switch (selectedCategory) {

        case "tnp":

            count =

                getFilteredTnp().length;

            break;



        case "pyq":

            count =

                getFilteredPyq().length;

            break;



        case "timetable":

            count =

                getFilteredTimetable().length;

            break;



        case "notes":

        default:

            count =

                getFilteredNotes().length;

            break;

    }



    countElement.textContent =

        String(count);

}





// =====================================================

// Update Category Label

// =====================================================



export function updateCategoryLabel(

    category = null

) {

    const label =

        $("currentCategoryLabel");



    if (!label) {

        return;

    }



    const categorySelect =

        $("searchCategory");



    const selectedCategory =

        category ||

        categorySelect?.value ||

        "notes";



    const labels = {

        notes: "Study Notes",

        tnp: "Training & Placement",

        pyq: "Previous Year Papers",

        timetable: "Exam Timetable"

    };



    label.textContent =        labels[selectedCategory] ||

        "Resources";

    const resourceTitle = $("resourceListTitle");

    if (resourceTitle) {
        resourceTitle.textContent =
            labels[selectedCategory] ||
            "Resources";
    }
}
// =====================================================

// Setup Render Actions

// =====================================================

//

// Edit/Delete buttons use custom events so render.js

// does not need to directly depend on admin.js.

// This avoids circular imports.

// =====================================================



export function setupRenderActions() {

    const container =

        getContainer();



    if (!container) {

        return;

    }



    if (

        container.dataset.renderActionsReady ===

        "true"

    ) {

        return;

    }



    container.dataset.renderActionsReady =

        "true";



    container.addEventListener(

        "click",

        event => {



            const editButton =

                event.target.closest(

                    ".edit-resource-btn"

                );



            if (editButton) {

                const category =

                    editButton.dataset

                        .resourceCategory;



                const id =

                    editButton.dataset

                        .resourceId;



                window.dispatchEvent(

                    new CustomEvent(

                        "campusnotes:edit-resource",

                        {

                            detail: {

                                category,

                                id

                            }

                        }

                    )

                );



                return;

            }





            const deleteButton =

                event.target.closest(

                    ".delete-resource-btn"

                );



            if (deleteButton) {

                const category =

                    deleteButton.dataset

                        .resourceCategory;



                const id =

                    deleteButton.dataset

                        .resourceId;



                window.dispatchEvent(

                    new CustomEvent(

                        "campusnotes:delete-resource",

                        {

                            detail: {

                                category,

                                id

                            }

                        }

                    )

                );

            }

        }

    );

}


