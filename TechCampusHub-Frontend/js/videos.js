// =====================================================
// TechCampus_Hub
// videos.js
//
// Shared "Related Video Links" manager used by the admin
// and faculty Notes / TNP upload and edit forms.
//
// - One manager per form, marked with data-video-manager.
// - Rows are created from a small template so every form
//   shares the same layout, validation and reordering
//   behaviour.
// - URLs are parsed and rewritten to a canonical
//   https://www.youtube.com/watch?v=<id> link in the browser
//   (the backend validates them again before saving).
// - Validation is intentionally strict: only https YouTube
//   video links are accepted, never playlists/channels.
// - The same module owns the student "Related Videos" modal:
//   the notes list only shows a pill when video_count > 0 and
//   the rows are fetched when that pill is clicked.
// =====================================================

import { getRelatedVideos } from "./api.js";
import { $, escapeHtml } from "./helpers.js";

export const MAX_VIDEOS = 10;

const ALLOWED_HOSTS = new Set([
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "youtu.be"
]);

// YouTube ids are 11 characters today; allow a small safety range.
const VIDEO_ID = /^[A-Za-z0-9_-]{6,64}$/;
const CANONICAL_WATCH = "https://www.youtube.com/watch?v=";

// =====================================================
// YouTube URL validation / canonicalisation
// =====================================================

/**
 * Parse a YouTube video URL and return its canonical watch link.
 * Throws an Error with a user-facing message when the link is not a
 * supported single-video YouTube URL.
 */
export function normalizeYouTubeUrl(rawUrl) {
    const value = String(rawUrl || "").trim();

    if (!value) {
        throw new Error("YouTube video URL is required.");
    }

    if (value.length > 600) {
        throw new Error("YouTube video URL is too long.");
    }

    // Reject whitespace/control characters (header/script tricks).
    if (/[\u0000-\u001f\u007f\s]/.test(value)) {
        throw new Error("Please provide a valid YouTube URL.");
    }

    let url;

    try {
        url = new URL(value);
    } catch (error) {
        throw new Error("Please provide a valid YouTube URL.");
    }

    if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("Only secure https YouTube links are accepted.");
    }

    const host = url.hostname.toLowerCase();

    if (!ALLOWED_HOSTS.has(host)) {
        throw new Error(
            "Please use a YouTube link (https://www.youtube.com/... or https://youtu.be/...)."
        );
    }

    const path = url.pathname || "";

    if (host === "youtu.be") {
        return watchLink(path.startsWith("/") ? path.slice(1) : path);
    }

    if (path === "/watch") {
        return watchLink(url.searchParams.get("v"));
    }

    for (const prefix of ["/shorts/", "/embed/", "/live/", "/v/"]) {
        if (path.startsWith(prefix)) {
            const id = path.slice(prefix.length);

            if (id.includes("/")) {
                break;
            }

            return watchLink(id);
        }
    }

    throw new Error(
        "Please use a YouTube video link (https://www.youtube.com/watch?v=... or https://youtu.be/...)."
    );
}

function watchLink(id) {
    if (!id || !VIDEO_ID.test(id)) {
        throw new Error("Please provide a valid YouTube video URL.");
    }

    return `${CANONICAL_WATCH}${id}`;
}

// =====================================================
// Manager lookup
// =====================================================

function resolveManager(target) {
    if (!target) {
        return null;
    }

    if (typeof target === "string") {
        return document.getElementById(target);
    }

    return target;
}

function videoRows(manager) {
    return Array.from(manager.querySelectorAll("[data-video-row]"));
}

function videoList(manager) {
    return manager.querySelector("[data-video-list]");
}

// =====================================================
// Row template + controls
// =====================================================

const ICON_BUTTON = "w-8 h-8 rounded-lg border border-slate-200 bg-white " +
    "hover:bg-slate-100 flex items-center justify-center text-xs " +
    "text-slate-600 transition disabled:opacity-40 disabled:cursor-not-allowed";

function createVideoRow(video = {}) {
    const row = document.createElement("div");

    row.dataset.videoRow = "";
    row.className = "rounded-xl border border-slate-200 bg-slate-50 p-3";

    row.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)]
                    gap-2 items-start">
            <span data-video-index
                  class="hidden sm:flex w-8 h-8 items-center justify-center
                         rounded-lg bg-white border border-slate-200
                         text-xs font-bold text-slate-500"></span>
            <input data-video-title
                   class="input"
                   type="text"
                   maxlength="200"
                   placeholder="Video Title">
            <input data-video-url
                   class="input"
                   type="url"
                   maxlength="600"
                   placeholder="https://www.youtube.com/watch?v=...">
        </div>
        <div class="mt-2 flex items-center justify-between gap-2">
            <p class="text-[11px] text-slate-400 leading-snug">
                YouTube link only — youtube.com/watch?v=… or youtu.be/…
            </p>
            <div class="flex items-center gap-1 shrink-0">
                <button type="button" data-video-up aria-label="Move video up"
                        title="Move up" class="${ICON_BUTTON}">
                    <i class="fa-solid fa-arrow-up"></i>
                </button>
                <button type="button" data-video-down aria-label="Move video down"
                        title="Move down" class="${ICON_BUTTON}">
                    <i class="fa-solid fa-arrow-down"></i>
                </button>
                <button type="button" data-video-remove aria-label="Remove video"
                        title="Remove" class="${ICON_BUTTON} text-red-500 hover:bg-red-50">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;

    const titleInput = row.querySelector("[data-video-title]");
    const urlInput = row.querySelector("[data-video-url]");

    if (titleInput) {
        titleInput.value = video.videoTitle || video.video_title || video.title || "";
    }

    if (urlInput) {
        urlInput.value = video.youtubeUrl || video.youtube_url || video.url || "";
    }

    return row;
}

function updateRowControls(manager) {
    const rows = videoRows(manager);

    rows.forEach((row, index) => {
        const indexLabel = row.querySelector("[data-video-index]");
        const upButton = row.querySelector("[data-video-up]");
        const downButton = row.querySelector("[data-video-down]");

        if (indexLabel) {
            indexLabel.textContent = String(index + 1);
        }

        if (upButton) {
            upButton.disabled = index === 0;
        }

        if (downButton) {
            downButton.disabled = index === rows.length - 1;
        }
    });

    const addButton = manager.querySelector("[data-video-add]");

    if (addButton) {
        const atLimit = rows.length >= MAX_VIDEOS;

        addButton.disabled = atLimit;
        addButton.classList.toggle("opacity-50", atLimit);
        addButton.classList.toggle("cursor-not-allowed", atLimit);
    }
}

// =====================================================
// Messages
// =====================================================

function showVideoMessage(manager, message, type = "error") {
    const box = manager.querySelector("[data-video-message]");

    if (!box) {
        return;
    }

    const colors = type === "error"
        ? "text-red-600"
        : "text-emerald-600";

    box.textContent = message || "";
    box.className = `text-sm mt-2 ${colors}`;
}

function clearVideoMessage(manager) {
    const box = manager.querySelector("[data-video-message]");

    if (!box) {
        return;
    }

    box.textContent = "";
    box.className = "hidden text-sm mt-2";
}

// =====================================================
// Public API
// =====================================================

/** Append an empty (or pre-filled) row to a manager. */
export function addVideoRow(target, video = {}, { focus = true } = {}) {
    const manager = resolveManager(target);

    if (!manager) {
        return null;
    }

    const list = videoList(manager);

    if (!list) {
        return null;
    }

    if (videoRows(manager).length >= MAX_VIDEOS) {
        showVideoMessage(
            manager,
            `You can add at most ${MAX_VIDEOS} video links per upload.`
        );

        return null;
    }

    const row = createVideoRow(video);

    list.appendChild(row);
    updateRowControls(manager);

    if (focus) {
        row.querySelector("[data-video-title]")?.focus();
    }

    return row;
}

/** Replace every row with the given list (used when opening an edit form). */
export function setVideos(target, videos = []) {
    const manager = resolveManager(target);

    if (!manager) {
        return;
    }

    const list = videoList(manager);

    if (!list) {
        return;
    }

    list.replaceChildren();

    const entries = Array.isArray(videos) ? videos.slice(0, MAX_VIDEOS) : [];

    entries.forEach(video => addVideoRow(manager, video, { focus: false }));

    // Keep one blank row so the section never looks broken/empty.
    if (!videoRows(manager).length) {
        addVideoRow(manager, {}, { focus: false });
    }

    updateRowControls(manager);
    clearVideoMessage(manager);
}

/** Remove every row and start again with one blank row. */
export function resetVideos(target) {
    setVideos(target, []);
}

/**
 * Read, validate and canonicalise the manager's rows.
 * Blank rows are ignored; the result is the ordered list expected by
 * the backend's `videos` request field.
 *
 * @throws {Error} with a user-facing message for the first invalid row.
 */
export function collectVideos(target) {
    const manager = resolveManager(target);

    if (!manager) {
        return [];
    }

    const collected = [];

    videoRows(manager).forEach((row, index) => {
        const title = row.querySelector("[data-video-title]")?.value.trim() || "";
        const url = row.querySelector("[data-video-url]")?.value.trim() || "";

        // An untouched row is not an error.
        if (!title && !url) {
            return;
        }

        if (!title) {
            throw new Error(
                `Video title is required for link ${index + 1}.`
            );
        }

        if (title.length > 200) {
            throw new Error(
                `Video title for link ${index + 1} must be 200 characters or fewer.`
            );
        }

        let youtubeUrl;

        try {
            youtubeUrl = normalizeYouTubeUrl(url);
        } catch (error) {
            throw new Error(`Link ${index + 1}: ${error.message}`);
        }

        collected.push({
            videoTitle: title,
            youtubeUrl
        });
    });

    if (collected.length > MAX_VIDEOS) {
        throw new Error(
            `You can add at most ${MAX_VIDEOS} video links per upload.`
        );
    }

    clearVideoMessage(manager);

    return collected;
}

/**
 * Wire the add/remove/reorder buttons for every manager inside `root`.
 * Safe to call more than once (each manager is initialised only once).
 */
export function setupVideoManagers(root = document) {
    root.querySelectorAll("[data-video-manager]").forEach(manager => {
        if (manager.dataset.videoReady === "true") {
            return;
        }

        manager.dataset.videoReady = "true";

        manager
            .querySelector("[data-video-add]")
            ?.addEventListener("click", () => addVideoRow(manager));

        videoList(manager)?.addEventListener("click", event => {
            const row = event.target.closest?.("[data-video-row]");

            if (!row) {
                return;
            }

            const list = videoList(manager);

            if (event.target.closest("[data-video-remove]")) {
                row.remove();

                // Always keep one row available for a fresh link.
                if (!videoRows(manager).length) {
                    addVideoRow(manager, {}, { focus: false });
                }

                updateRowControls(manager);
                clearVideoMessage(manager);
                return;
            }

            if (event.target.closest("[data-video-up]")) {
                const previous = row.previousElementSibling;

                if (previous) {
                    list.insertBefore(row, previous);
                    updateRowControls(manager);
                }
                return;
            }

            if (event.target.closest("[data-video-down]")) {
                const next = row.nextElementSibling;

                if (next) {
                    list.insertBefore(next, row);
                    updateRowControls(manager);
                }
            }
        });

        if (!videoRows(manager).length) {
            addVideoRow(manager, {}, { focus: false });
        }

        updateRowControls(manager);
    });
}

// =====================================================
// Student related-videos modal (Notes / TNP cards)
// =====================================================

const STUDENT_VIDEO_CATEGORIES = new Set(["notes", "tnp"]);

// Canonical links produced by the backend; the guard is a second layer
// so a malformed row can never become a javascript: link.
const CANONICAL_YOUTUBE =
    /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+$/;

let relatedVideosReady = false;
let relatedVideosRequestId = 0;
let relatedVideosTrigger = null;

function showRelatedVideosModal(category, id, title) {
    const modal = $("relatedVideosModal");

    if (!modal) {
        return;
    }

    relatedVideosTrigger =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

    $("relatedVideosSubtitle").textContent =
        title || "Recommended lectures";

    const list = $("relatedVideosList");
    const status = $("relatedVideosStatus");

    list?.replaceChildren();
    status.textContent = "Loading videos…";
    status.className =
        "text-center text-sm text-slate-500 py-6";
    status.classList.remove("hidden");

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const requestId = ++relatedVideosRequestId;

    getRelatedVideos(category, id)
        .then(videos => {
            if (requestId !== relatedVideosRequestId) {
                return;
            }

            renderRelatedVideos(videos);
        })
        .catch(error => {
            if (requestId !== relatedVideosRequestId) {
                return;
            }

            console.warn("Could not load related videos:", error);

            status.textContent =
                "Could not load the videos right now. Please try again.";
            status.className =
                "text-center text-sm text-red-500 py-6";
            status.classList.remove("hidden");
        });
}

function renderRelatedVideos(videos) {
    const list = $("relatedVideosList");
    const status = $("relatedVideosStatus");

    if (!list || !status) {
        return;
    }

    list.replaceChildren();

    const entries = Array.isArray(videos) ? videos : [];
    let rendered = 0;

    for (const video of entries) {
        const url = String(video.youtube_url || "").trim();

        if (!CANONICAL_YOUTUBE.test(url)) {
            continue;
        }

        const row = document.createElement("article");

        row.className =
            "flex items-start gap-3 rounded-xl border " +
            "border-slate-200 bg-slate-50 p-3";

        row.innerHTML = `
            <span class="w-9 h-9 shrink-0 rounded-lg bg-red-600
                         text-white flex items-center justify-center">
                <i class="fa-brands fa-youtube"></i>
            </span>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-900
                          leading-snug line-clamp-2">
                    ${escapeHtml(video.title || "Video lecture")}
                </p>
                <a href="${escapeHtml(url)}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="mt-2 inline-flex items-center gap-2
                          rounded-lg bg-red-600 px-3 py-1.5
                          text-xs font-bold text-white
                          transition hover:bg-red-700">
                    <i class="fa-solid fa-play"></i>
                    Watch Video
                </a>
            </div>
        `;

        list.appendChild(row);
        rendered += 1;
    }

    if (!rendered) {
        status.textContent = "No related videos are available.";
        status.className =
            "text-center text-sm text-slate-500 py-6";
        status.classList.remove("hidden");
        return;
    }

    status.classList.add("hidden");
}

function closeRelatedVideosModal() {
    const modal = $("relatedVideosModal");

    if (!modal) {
        return;
    }

    relatedVideosRequestId += 1;
    modal.classList.add("hidden");
    modal.classList.remove("flex");

    $("relatedVideosList")?.replaceChildren();

    const status = $("relatedVideosStatus");

    if (status) {
        status.textContent = "";
        status.classList.add("hidden");
    }

    relatedVideosTrigger?.focus?.();
    relatedVideosTrigger = null;
}

/**
 * Wire the "Videos" pill, the modal close controls and the Escape key.
 * Idempotent: the document-level delegate is installed only once, and the
 * pill itself is delegated so cards rendered later still work.
 */
export function setupRelatedVideosModal() {
    if (relatedVideosReady) {
        return;
    }

    relatedVideosReady = true;

    document.addEventListener("click", event => {
        const trigger = event.target.closest?.("[data-related-videos]");

        if (!trigger) {
            return;
        }

        event.preventDefault();

        const category = trigger.dataset.relatedCategory || "";
        const id = trigger.dataset.relatedId || "";

        if (!STUDENT_VIDEO_CATEGORIES.has(category) || !id) {
            return;
        }

        showRelatedVideosModal(
            category,
            id,
            trigger.dataset.relatedTitle || ""
        );
    });

    $("closeRelatedVideosBtn")?.addEventListener(
        "click",
        closeRelatedVideosModal
    );

    // Clicking the dimmed backdrop (but not the dialog) closes it.
    $("relatedVideosModal")?.addEventListener("click", event => {
        if (event.target === event.currentTarget) {
            closeRelatedVideosModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape"
            && !$("relatedVideosModal")?.classList.contains("hidden")) {
            closeRelatedVideosModal();
        }
    });
}
