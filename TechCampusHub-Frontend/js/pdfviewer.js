// =====================================================
// TechCampus_Hub
// pdfviewer.js
// =====================================================
// Secure in-app PDF reader used by the student resource
// cards (notes, PYQs, TNP resources, timetables).
//
// The document NEVER arrives as a direct storage URL: its
// bytes are fetched from the authenticated backend relay
// (GET /api/content/{category}/{id}/pdf - JWT travels in
// the Authorization header) and handed to PDF.js as an
// in-memory buffer. Consequences:
//   - the storage URL is unknown to the browser,
//   - the stream URL itself is useless without the JWT,
//   - there is no download / print / save control anywhere,
//   - the right-click menu and Ctrl/Cmd+S/P/Shift+S are
//     blocked while the viewer is open.
//
// Reading model - a normal continuous-scroll PDF reader:
// every page is one canvas inside a single vertical stack,
// the document opens fit-width (no horizontal scrolling),
// and pages are rendered when they approach the viewport
// (and released again once they scroll far past it).
//
// Smart search integration - openPdfViewerAtPage() opens a
// document directly on the page that matched a search and
// paints a translucent overlay on every occurrence of the
// keyword on that page (the canvas is pixel-only, so the
// highlights are positioned from the text layer transforms).
// =====================================================

import { API_BASE_URL } from "./config.js";
import { getAuthToken } from "./api.js";
import { $ } from "./helpers.js";

const PDFJS_LIB_SRC = "./vendor/pdfjs/pdf.min.js";
const PDFJS_WORKER_SRC = "./vendor/pdfjs/pdf.worker.min.js";

// Dashboard category -> backend content segment.
const STREAM_CATEGORY = {
    notes: "notes",
    pyq: "pyqs",
    tnp: "tnp-notes",
    timetable: "timetables",
    syllabus: "syllabus"
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

// Horizontal breathing room (px-4 on the scroll area) that fit
// width leaves free so no horizontal scrollbar ever appears.
const FIT_GUTTER = 32;

// Pages this close to the viewport get rendered; pages further
// away release their canvas again (keeps big PDFs cheap).
const RENDER_MARGIN = 800;
const RELEASE_MARGIN = 2400;

const state = {
    ready: false,        // modal + global guards wired
    pdfjsPromise: null,  // lazy <script> load of PDF.js
    doc: null,           // loaded PDFDocumentProxy
    pages: [],           // one entry per PDF page (slot + canvas + proxy)
    zoom: 1,             // 1 = fit width
    currentPage: 1,
    ioRender: null,
    ioRelease: null,
    scrollHandler: null,
    resizeTimer: null,
    resizeObserver: null,
    open: false,
    pendingTarget: null  // { page, keyword } to jump to once loaded
};

// =====================================================
// PDF.js (lazy, vendored)
// =====================================================

function loadPdfJs() {
    if (window.pdfjsLib) {
        return Promise.resolve(window.pdfjsLib);
    }

    if (!state.pdfjsPromise) {
        state.pdfjsPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = PDFJS_LIB_SRC;
            script.onload = () => {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                        PDFJS_WORKER_SRC;
                    resolve(window.pdfjsLib);
                } else {
                    reject(new Error("PDF engine failed to initialize."));
                }
            };
            script.onerror = () =>
                reject(new Error("PDF engine could not be loaded."));
            document.head.appendChild(script);
        });
    }

    return state.pdfjsPromise;
}

// =====================================================
// Viewer chrome
// =====================================================

function showLoading(show) {
    $("pdfViewerLoading")?.classList.toggle("hidden", !show);
}

function showError(message) {
    showLoading(false);
    const errorBox = $("pdfViewerError");
    const errorMessage = $("pdfViewerErrorMessage");
    if (errorMessage) {
        errorMessage.textContent = message;
    }
    errorBox?.classList.remove("hidden");
}

/** Page indicator + zoom label (100% = fit width). */
function updateLabels() {
    const pageNum = $("pdfViewerPageNum");
    const pageCount = $("pdfViewerPageCount");
    const zoomLabel = $("pdfViewerZoomLabel");
    if (pageNum) {
        pageNum.textContent = String(state.currentPage);
    }
    if (pageCount) {
        pageCount.textContent = String(state.doc ? state.doc.numPages : 0);
    }
    if (zoomLabel) {
        zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    }
}

/** Cancel every observer, render and listener; destroy the document. */
function resetViewer() {
    if (state.ioRender) {
        state.ioRender.disconnect();
        state.ioRender = null;
    }
    if (state.ioRelease) {
        state.ioRelease.disconnect();
        state.ioRelease = null;
    }
    if (state.scrollHandler) {
        $("pdfViewerBody")?.removeEventListener("scroll", state.scrollHandler);
        state.scrollHandler = null;
    }
    if (state.resizeTimer) {
        clearTimeout(state.resizeTimer);
        state.resizeTimer = null;
    }
    if (state.resizeObserver) {
        state.resizeObserver.disconnect();
        state.resizeObserver = null;
    }

    for (const entry of state.pages) {
        cancelRender(entry);
    }
    state.pages = [];
    $("pdfViewerPages")?.replaceChildren();

    if (state.doc) {
        try {
            state.doc.destroy();
        } catch {
            // already destroyed
        }
        state.doc = null;
    }

    state.zoom = 1;
    state.currentPage = 1;
    updateLabels();
    $("pdfViewerError")?.classList.add("hidden");
    showLoading(false);
}

// =====================================================
// Page slots, rendering, releasing
// =====================================================

function cancelRender(entry) {
    if (entry.task) {
        try {
            entry.task.cancel();
        } catch {
            // already finished
        }
        entry.task = null;
    }
}

/** Draw (or redraw) one page canvas at the slot's current width. */
async function renderSlot(entry) {
    cancelRender(entry);

    const scale = entry.width / entry.rawViewport.width;
    const viewport = entry.page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;

    // The canvas is CSS-sized by its slot (absolute inset-0); only the
    // backing store follows the device pixel ratio here.
    entry.canvas.width = Math.floor(viewport.width * dpr);
    entry.canvas.height = Math.floor(viewport.height * dpr);

    entry.task = entry.page.render({
        canvasContext: entry.canvas.getContext("2d"),
        viewport,
        transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0]
    });

    try {
        await entry.task.promise;
    } catch {
        // Cancelled by a release, a re-layout or a closed viewer.
        return;
    }
    entry.task = null;
    entry.rendered = true;
    entry.canvas.classList.remove("hidden");
}

/** Free the pixels of a page that scrolled far away. */
function releaseSlot(entry) {
    cancelRender(entry);
    if (!entry.rendered) {
        return;
    }
    entry.rendered = false;
    entry.canvas.classList.add("hidden");
    entry.canvas.width = 0;
    entry.canvas.height = 0;
}

/** Create one sized slot (aspect-ratio placeholder) per PDF page. */
async function buildPageStack() {
    const pagesRoot = $("pdfViewerPages");
    if (!pagesRoot) {
        return;
    }
    pagesRoot.replaceChildren();
    state.pages = [];

    for (let index = 1; index <= state.doc.numPages; index += 1) {
        const page = await state.doc.getPage(index);
        const rawViewport = page.getViewport({ scale: 1 });

        const slot = document.createElement("div");
        slot.className = "relative bg-white shadow-md";
        slot.style.aspectRatio =
            `${rawViewport.width} / ${rawViewport.height}`;

        const canvas = document.createElement("canvas");
        canvas.className = "absolute inset-0 hidden w-full h-full";
        slot.appendChild(canvas);
        pagesRoot.appendChild(slot);

        state.pages.push({
            index,
            page,
            rawViewport,
            slot,
            canvas,
            width: 0,
            rendered: false,
            task: null
        });
    }
}

function entryFor(slot) {
    return state.pages.find(entry => entry.slot === slot) || null;
}

function setupObservers() {
    const body = $("pdfViewerBody");
    if (!body) {
        return;
    }

    state.ioRender = new IntersectionObserver(entries => {
        for (const observed of entries) {
            if (!observed.isIntersecting) {
                continue;
            }
            const entry = entryFor(observed.target);
            if (entry && !entry.rendered && !entry.task) {
                renderSlot(entry);
            }
        }
    }, { root: body, rootMargin: `${RENDER_MARGIN}px 0px` });

    state.ioRelease = new IntersectionObserver(entries => {
        for (const observed of entries) {
            if (observed.isIntersecting) {
                continue;
            }
            const entry = entryFor(observed.target);
            if (entry) {
                releaseSlot(entry);
            }
        }
    }, { root: body, rootMargin: `${RELEASE_MARGIN}px 0px` });

    for (const entry of state.pages) {
        state.ioRender.observe(entry.slot);
        state.ioRelease.observe(entry.slot);
    }

    // Re-fit whenever the reading area itself changes size (scrollbar
    // appearing/disappearing, sidebar toggles, window resizes).
    state.resizeObserver = new ResizeObserver(() => {
        if (state.open && state.pages.length) {
            relayout();
        }
    });
    state.resizeObserver.observe(body);
}

// =====================================================
// Fit-width layout + zoom (100% = fit width)
// =====================================================

/** The page currently at the top of the reading area + scroll fraction. */
function captureAnchor() {
    const body = $("pdfViewerBody");
    if (!body || !state.pages.length) {
        return null;
    }
    const marker = body.scrollTop + 80;
    let anchor = state.pages[0];
    for (const entry of state.pages) {
        if (entry.slot.offsetTop <= marker) {
            anchor = entry;
        } else {
            break;
        }
    }
    return {
        entry: anchor,
        fraction:
            (body.scrollTop - anchor.slot.offsetTop)
            / Math.max(1, anchor.slot.offsetHeight)
    };
}

function restoreAnchor(anchor) {
    if (!anchor) {
        return;
    }
    const body = $("pdfViewerBody");
    if (!body) {
        return;
    }
    const top = anchor.entry.slot.offsetTop
        + anchor.fraction * anchor.entry.slot.offsetHeight;
    body.scrollTop = Math.max(0, top - 80);
}

/** Fit-width layout: every slot spans the reading area, zoom multiplies. */
function relayout() {
    const body = $("pdfViewerBody");
    if (!body || !state.pages.length) {
        return;
    }

    const anchor = captureAnchor();
    const width = Math.round(
        Math.max(240, body.clientWidth - FIT_GUTTER) * state.zoom
    );

    for (const entry of state.pages) {
        entry.width = width;
        // CSS width drives the slot; aspect-ratio derives its height.
        entry.slot.style.width = `${width}px`;
        if (entry.rendered) {
            renderSlot(entry); // redraw visible pages at the new size
        }
        if (entry.highlightTerm) {
            // Zoom changed the scale - repaint the search overlays.
            highlightKeyword(entry, entry.highlightTerm);
        }
    }

    restoreAnchor(anchor);
    updateLabels();
    updateCurrentPage();
}

function applyZoom(delta) {
    if (!state.doc) {
        return;
    }
    state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom + delta));
    relayout();
}

// =====================================================
// Page indicator (follows the scroll position)
// =====================================================

function updateCurrentPage() {
    const body = $("pdfViewerBody");
    if (!body || !state.pages.length) {
        return;
    }
    const marker = body.scrollTop + 80;
    let current = state.pages[0];
    for (const entry of state.pages) {
        if (entry.slot.offsetTop <= marker) {
            current = entry;
        } else {
            break;
        }
    }
    if (current.index !== state.currentPage) {
        state.currentPage = current.index;
        const pageNum = $("pdfViewerPageNum");
        if (pageNum) {
            pageNum.textContent = String(state.currentPage);
        }
    }
}

function setupScrollIndicator() {
    const body = $("pdfViewerBody");
    if (!body) {
        return;
    }
    let ticking = false;
    state.scrollHandler = () => {
        if (ticking) {
            return;
        }
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            updateCurrentPage();
        });
    };
    body.addEventListener("scroll", state.scrollHandler, { passive: true });
}

// =====================================================
// Open / close
// =====================================================

export async function openPdfViewer({ category, id, title } = {}) {
    setupPdfViewer();

    const modal = $("pdfViewerModal");
    if (!modal || !id) {
        return;
    }

    resetViewer();
    if ($("pdfViewerTitle")) {
        $("pdfViewerTitle").textContent = title || "Document";
    }

    state.open = true;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    showLoading(true);

    // Same-origin, JWT-protected relay - not a shareable direct link.
    const path = `/api/content/${STREAM_CATEGORY[category] || category}/${id}/pdf`;
    const token = getAuthToken();

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
    } catch {
        showError(
            "The document could not be loaded. Check your connection and try again."
        );
        return;
    }

    if (!response.ok) {
        if (response.status === 401) {
            showError("Your session has expired. Please log in again.");
        } else if (response.status === 403 || response.status === 404) {
            showError("This document is not available with your current access.");
        } else {
            showError("The document could not be loaded right now.");
        }
        return;
    }

    try {
        const pdfjsLib = await loadPdfJs();
        // Bytes live in memory only: no object URL, no link, no cache.
        const data = await response.arrayBuffer();
        state.doc = await pdfjsLib.getDocument({ data }).promise;

        state.currentPage = 1;
        await buildPageStack();
        setupObservers();
        setupScrollIndicator();
        relayout(); // fit width; the observers paint what is visible
        updateLabels();
        updateCurrentPage();
        showLoading(false);

        // Smart search "Open": jump straight to the matching page
        // and highlight the keyword there.
        const target = state.pendingTarget;
        state.pendingTarget = null;
        if (target) {
            await applyTarget(target);
        }
    } catch (error) {
        showError(
            error?.message && /engine/i.test(error.message)
                ? error.message
                : "This document could not be opened. It may be damaged."
        );
    }
}

/**
 * Smart search entry point: opens the document and lands on the page
 * that matched, with every occurrence of the keyword highlighted.
 */
export async function openPdfViewerAtPage(
    { category, id, title } = {},
    pageNumber = 1,
    keyword = ""
) {
    state.pendingTarget = { page: pageNumber, keyword };
    await openPdfViewer({ category, id, title });
}

/** Scroll to the target page and paint the keyword overlays on it. */
async function applyTarget(target) {
    if (!target || !state.pages.length) {
        return;
    }

    const body = $("pdfViewerBody");
    const pageNumber = Math.min(
        Math.max(1, Number(target.page) || 1),
        state.pages.length
    );
    const entry = state.pages[pageNumber - 1];
    if (!body || !entry) {
        return;
    }

    state.currentPage = entry.index;
    updateLabels();
    body.scrollTop = Math.max(0, entry.slot.offsetTop - 80);

    if (target.keyword) {
        await highlightKeyword(entry, target.keyword);

        // Bring the first occurrence into comfortable view.
        const first = entry.slot.querySelector(".pdf-highlight");
        if (first) {
            body.scrollTop = Math.max(
                0,
                entry.slot.offsetTop + first.offsetTop - body.clientHeight / 3
            );
        }
    }
}

/**
 * Overlay every occurrence of the keyword on one page. The viewer is
 * canvas-only, so the overlays are positioned from the text layer item
 * transforms (same maths PDF.js' own text layer uses). The keyword is
 * stored on the entry so a zoom re-layout repaints the overlays.
 */
async function highlightKeyword(entry, keyword) {
    const term = String(keyword || "").trim().toLowerCase();
    entry.slot
        .querySelectorAll(".pdf-highlight")
        .forEach(overlay => overlay.remove());

    if (!term || !window.pdfjsLib) {
        entry.highlightTerm = null;
        return;
    }
    entry.highlightTerm = term;

    let textContent;
    try {
        textContent = await entry.page.getTextContent();
    } catch {
        return; // page gone / viewer closed mid-await
    }

    const scale = entry.width / entry.rawViewport.width;
    const viewport = entry.page.getViewport({ scale });

    for (const item of textContent.items) {
        const text = item.str || "";
        if (!text.trim() || !text.toLowerCase().includes(term)) {
            continue;
        }

        const tx = window.pdfjsLib.Util.transform(
            viewport.transform,
            item.transform
        );
        const fontHeight = Math.hypot(tx[2], tx[3]);

        const overlay = document.createElement("div");
        overlay.className = "pdf-highlight absolute pointer-events-none";
        overlay.style.left = `${tx[4]}px`;
        overlay.style.top = `${tx[5] - fontHeight}px`;
        overlay.style.width = `${Math.max(4, (item.width || 0) * scale)}px`;
        overlay.style.height = `${fontHeight * 1.15}px`;
        overlay.style.background = "rgba(251, 191, 36, 0.45)";
        overlay.style.borderRadius = "2px";
        entry.slot.appendChild(overlay);
    }
}

export function closePdfViewer() {
    if (!state.open) {
        return;
    }
    state.open = false;
    resetViewer();
    const modal = $("pdfViewerModal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
}

// =====================================================
// One-time wiring (modal controls, card triggers,
// right-click and save/print shortcut guards)
// =====================================================

export function setupPdfViewer() {
    if (state.ready) {
        return;
    }

    const modal = $("pdfViewerModal");
    if (!modal) {
        return; // page has no modal partial yet - retry later
    }
    state.ready = true;

    $("pdfViewerCloseBtn")?.addEventListener("click", closePdfViewer);
    $("pdfViewerZoomOutBtn")?.addEventListener("click", () =>
        applyZoom(-ZOOM_STEP)
    );
    $("pdfViewerZoomInBtn")?.addEventListener("click", () =>
        applyZoom(ZOOM_STEP)
    );
    // The zoom label doubles as "back to fit width".
    $("pdfViewerZoomLabel")?.addEventListener("click", () => {
        if (state.doc) {
            state.zoom = 1;
            relayout();
        }
    });

    // Fullscreen modal: keep fit-width correct across window resizes.
    window.addEventListener("resize", () => {
        if (!state.open) {
            return;
        }
        clearTimeout(state.resizeTimer);
        state.resizeTimer = setTimeout(() => {
            if (state.open) {
                relayout();
            }
        }, 150);
    });

    // Card triggers anywhere on the page:
    // <button data-pdf-open data-pdf-category data-pdf-id data-pdf-title>
    document.addEventListener("click", event => {
        const trigger = event.target.closest?.("[data-pdf-open]");
        if (!trigger) {
            return;
        }
        event.preventDefault();
        openPdfViewer({
            category: trigger.dataset.pdfCategory,
            id: trigger.dataset.pdfId,
            title: trigger.dataset.pdfTitle
        });
    });

    // Guards - they only act while the viewer is open. Capture phase,
    // so no other handler can resurrect the blocked behaviour.
    document.addEventListener(
        "contextmenu",
        event => {
            if (state.open) {
                event.preventDefault();
            }
        },
        true
    );

    document.addEventListener(
        "keydown",
        event => {
            if (!state.open) {
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closePdfViewer();
                return;
            }
            // Ctrl/Cmd + S (save), Ctrl/Cmd + Shift + S (save as),
            // Ctrl/Cmd + P (print) - never raised over the viewer.
            const key = String(event.key || "").toLowerCase();
            if ((event.ctrlKey || event.metaKey)
                    && (key === "s" || key === "p")) {
                event.preventDefault();
                event.stopPropagation();
            }
        },
        true
    );
}
