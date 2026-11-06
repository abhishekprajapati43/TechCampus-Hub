package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.ContentDtos.NoteRequest;
import com.example.techcampushubbackend.dto.ContentDtos.NoteResponse;
import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkResponse;
import com.example.techcampushubbackend.entity.Note;
import com.example.techcampushubbackend.entity.RelatedVideoType;
import com.example.techcampushubbackend.entity.Role;
import com.example.techcampushubbackend.entity.User;
import com.example.techcampushubbackend.exception.ResourceNotFoundException;
import com.example.techcampushubbackend.repository.NoteRepository;
import com.example.techcampushubbackend.repository.UserRepository;
import com.example.techcampushubbackend.security.AuthenticatedUser;
import com.example.techcampushubbackend.utils.CurrentUserService;
import com.example.techcampushubbackend.utils.ProgramFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.example.techcampushubbackend.utils.ContentUtils.requireFileUrl;
import static com.example.techcampushubbackend.utils.ContentUtils.resolveTitle;

/**
 * Notes: students see free notes plus bundle-gated notes they have purchased;
 * admins manage the full collection (create/edit/delete); faculty create, read
 * and edit only the notes they uploaded - deletion is intentionally admin-only.
 */
@Service
@RequiredArgsConstructor
public class NoteService {

    private final NoteRepository noteRepository;
    private final CourseService courseService;
    private final PurchaseService purchaseService;
    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;
    private final PdfIndexService pdfIndexService;
    private final RelatedVideoService relatedVideoService;

    /**
     * Listing for the public endpoint - filters out paid bundles the caller
     * cannot access and withholds the storage URL from students (document
     * bytes stream through GET /api/content/notes/{id}/pdf; staff keep the
     * URL because their management UIs depend on it).
     */
    @Transactional(readOnly = true)
    public List<NoteResponse> listVisible() {
        User user = currentUserService.requireUser();
        boolean staff = user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY;
        return withVideoCounts(noteRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(note -> canAccess(note, user))
                // Students only ever see notes of their own program
                // (MCA vs B.Tech vs BCA); general rows stay visible to all.
                .filter(note -> staff
                        || ProgramFilter.matches(note.getCourse(), user.getCourse()))
                .map(note -> toVisibleResponse(note, user))
                .toList());
    }

    /**
     * Admin listing - everything, enriched with the uploader's name/role in a
     * single batched query so admins can audit faculty content (no N+1).
     */
    @Transactional(readOnly = true)
    public List<NoteResponse> listAll() {
        return withVideoCounts(withOwners(noteRepository.findAllByOrderByCreatedAtDesc()));
    }

    /**
     * Faculty workspace listing - only the caller's own notes; admins see all
     * notes (including legacy ones with no recorded owner).
     */
    @Transactional(readOnly = true)
    public List<NoteResponse> listOwn() {
        User user = currentUserService.requireUser();
        return withVideoCounts(noteRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(note -> user.getRole() == Role.ADMIN
                        || (note.getCreatedBy() != null
                            && note.getCreatedBy().equals(user.getId())))
                .map(NoteService::toResponse)
                .toList());
    }

    /**
     * Every note linked to a course bundle, used by the faculty "Course"
     * detail view. Course ownership is checked by the caller - this only
     * filters by bundle id.
     */
    @Transactional(readOnly = true)
    public List<NoteResponse> listByCourse(Long courseId) {
        if (courseId == null) {
            return List.of();
        }
        return withVideoCounts(noteRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(note -> note.getCourseBundle() != null
                        && courseId.equals(note.getCourseBundle().getId()))
                .map(NoteService::toResponse)
                .toList());
    }

    @Transactional(readOnly = true)
    public NoteResponse getVisible(Long id) {
        User user = currentUserService.requireUser();
        Note note = require(id);
        if (!canAccess(note, user) || !canSeeProgram(note, user)) {
            throw new ResourceNotFoundException("Note", id);
        }
        return toVisibleResponse(note, user);
    }

    /** Admin create - identical to before (no owner stamped). */
    @Transactional
    public NoteResponse create(NoteRequest request) {
        return doCreate(request, null);
    }

    /**
     * Faculty/admin create that stamps the uploader's user id as the owner, so
     * the faculty workspace can list it and admins can trace it during moderation.
     */
    @Transactional
    public NoteResponse createAsOwner(NoteRequest request, Long ownerId) {
        return doCreate(request, ownerId);
    }

    private NoteResponse doCreate(NoteRequest request, Long ownerId) {
        Note note = Note.builder()
                .title(resolveTitle(request.title(), request.subject(), request.course()))
                .subject(request.subject())
                .course(request.course())
                .branch(request.branch())
                .year(request.year())
                .semester(request.semester() == null ? 0 : request.semester())
                .description(request.description())
                .fileUrl(requireFileUrl(request.fileUrl()))
                .storagePath(request.storagePath())
                .courseBundle(loadBundle(request.courseId()))
                .createdBy(ownerId)
                .build();
        Note saved = noteRepository.save(note);
        relatedVideoService.replace(RelatedVideoType.NOTE, saved.getId(),
                request.videos(), videoUploaderId(ownerId));
        reindexForSearch(saved);
        return toResponse(saved);
    }

    @Transactional
    public NoteResponse update(Long id, NoteRequest request) {
        Note note = require(id);
        note.setTitle(request.title() == null || request.title().isBlank()
                ? note.getTitle()
                : request.title().trim());
        if (request.subject() != null) note.setSubject(request.subject());
        if (request.course() != null) note.setCourse(request.course());
        if (request.branch() != null) note.setBranch(request.branch());
        if (request.year() != null) note.setYear(request.year());
        if (request.semester() != null) note.setSemester(request.semester());
        if (request.description() != null) note.setDescription(request.description());
        if (request.fileUrl() != null) note.setFileUrl(request.fileUrl());
        if (request.storagePath() != null) note.setStoragePath(request.storagePath());
        if (request.courseId() != null) {
            note.setCourseBundle(loadBundle(request.courseId()));
        }
        Note saved = noteRepository.save(note);
        relatedVideoService.replace(RelatedVideoType.NOTE, saved.getId(),
                request.videos(), currentUploaderId());
        reindexForSearch(saved);
        return toResponse(saved);
    }

    /**
     * Faculty workspace update: a faculty member may only edit a note they own
     * ({@code createdBy} == caller id); admins may edit any note. Attempting to
     * edit someone else's note raises Spring's AccessDeniedException → 403.
     */
    @Transactional
    public NoteResponse updateOwned(Long id, NoteRequest request) {
        User user = currentUserService.requireUser();
        Note note = require(id);
        if (user.getRole() != Role.ADMIN
                && (note.getCreatedBy() == null || !note.getCreatedBy().equals(user.getId()))) {
            throw new AccessDeniedException("You can only edit notes you uploaded");
        }
        return update(id, request);
    }

    /**
     * Bundle resolution enforces ownership: faculty may only link content to
     * courses they launched; admins may link to any course (403 otherwise).
     */
    private com.example.techcampushubbackend.entity.Course loadBundle(Long courseId) {
        return courseService.requireOwnedBundle(courseId);
    }

    /**
     * Admin-only delete: enforced twice over - the {@code @PreAuthorize} on the
     * controller method AND the {@code /api/admin/**} matcher in SecurityConfig.
     * Faculty deletion is intentionally forbidden; there is no delete route
     * under /api/faculty.
     */
    @Transactional
    public void delete(Long id) {
        Note note = require(id);
        relatedVideoService.deleteAll(RelatedVideoType.NOTE, id);
        noteRepository.delete(note);
        pdfIndexService.removeIndexAsync(PdfIndexService.CAT_NOTES, id);
    }

    /**
     * Videos for one note, guarded by the same access/program checks as
     * {@link #getVisible(Long)} so a paid note's lectures cannot be read by id
     * without bundle access.
     */
    @Transactional(readOnly = true)
    public List<VideoLinkResponse> listVisibleVideos(Long id) {
        User user = currentUserService.requireUser();
        Note note = require(id);
        if (!canAccess(note, user) || !canSeeProgram(note, user)) {
            throw new ResourceNotFoundException("Note", id);
        }
        return relatedVideoService.list(RelatedVideoType.NOTE, id);
    }

    /** Owner stamp for a video link: the uploader being created for, else the caller. */
    private Long videoUploaderId(Long ownerId) {
        return ownerId != null ? ownerId : currentUploaderId();
    }

    private Long currentUploaderId() {
        AuthenticatedUser principal = currentUserService.principal();
        return principal == null ? null : principal.id();
    }

    /** Keeps the smart-search index in sync after every write. */
    private void reindexForSearch(Note note) {
        pdfIndexService.reindexAsync(PdfIndexService.CAT_NOTES, note.getId(),
                note.getFileUrl(), note.getTitle(), note.getSubject(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getId(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getTitle(),
                note.getCourse());
    }

    private Note require(Long id) {
        return noteRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Note", id));
    }

    private boolean canAccess(Note note, User user) {
        if (note.getCourseBundle() == null) {
            return true; // free note
        }
        // ADMIN and FACULTY staff read all content regardless of purchases.
        if (user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY) {
            return true;
        }
        return purchaseService.hasActiveAccess(user.getId(), note.getCourseBundle().getId());
    }

    /**
     * Program scoping for students: an MCA note must never be readable
     * (or even discoverable by id) by a B.Tech student. Staff manage all
     * programs and bypass this check.
     */
    private boolean canSeeProgram(Note note, User user) {
        if (user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY) {
            return true;
        }
        return ProgramFilter.matches(note.getCourse(), user.getCourse());
    }

    /** Base response without uploader info - keeps the student payload unchanged. */
    public static NoteResponse toResponse(Note note) {
        return new NoteResponse(
                note.getId(), note.getTitle(), note.getSubject(), note.getCourse(),
                note.getBranch(), note.getYear(), note.getSemester(), note.getDescription(),
                note.getFileUrl(), note.getStoragePath(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getId(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getTitle(),
                null,
                null,
                note.getCreatedAt(),
                0);
    }

    /**
     * Per-role payload: students get the storage URL withheld (they read the
     * bytes through /api/content/**), staff keep the real URL because their
     * management UIs (edit/replace/delete) depend on it.
     */
    private static NoteResponse toVisibleResponse(Note note, User user) {
        boolean staff = user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY;
        return staff ? toResponse(note) : toStudentResponse(note);
    }

    /**
     * Student payload: {@code fileUrl}/{@code storagePath} are withheld so the
     * storage URL never reaches the browser - students read the bytes through
     * GET /api/content/notes/{id}/pdf, which re-checks access server-side.
     */
    public static NoteResponse toStudentResponse(Note note) {
        NoteResponse base = toResponse(note);
        return new NoteResponse(
                base.id(), base.title(), base.subject(), base.course(),
                base.branch(), base.year(), base.semester(), base.description(),
                null,
                null,
                base.courseId(), base.courseTitle(),
                null,
                null,
                base.createdAt(),
                base.videoCount());
    }

    /**
     * Access-checked server-side resolution of the storage URL for the secure
     * streaming routes (in-app viewer relay + /download). Mirrors the
     * visibility rules of {@link #getVisible(Long)}; the URL is only ever
     * relayed as bytes, never serialized into a response body.
     */
    @Transactional(readOnly = true)
    public String requireVisibleFileUrl(Long id) {
        User user = currentUserService.requireUser();
        Note note = require(id);
        if (!canAccess(note, user) || !canSeeProgram(note, user)) {
            throw new ResourceNotFoundException("Note", id);
        }
        if (note.getFileUrl() == null || note.getFileUrl().isBlank()) {
            throw new ResourceNotFoundException("Note file", id);
        }
        return note.getFileUrl();
    }

    /**
     * Stamp the related-video count used by the list cards' "Related Videos"
     * button. One grouped query for the whole page - the video rows themselves
     * are fetched on demand when the button is clicked.
     */
    private List<NoteResponse> withVideoCounts(List<NoteResponse> notes) {
        if (notes.isEmpty()) {
            return notes;
        }
        Map<Long, Integer> counts = relatedVideoService.counts(RelatedVideoType.NOTE);
        return notes.stream()
                .map(note -> note.withVideoCount(counts.getOrDefault(note.id(), 0)))
                .toList();
    }

    /** Admin-list enrichment: resolves every uploader in one batched query (no N+1). */
    private List<NoteResponse> withOwners(List<Note> notes) {
        Set<Long> ownerIds = notes.stream()
                .map(Note::getCreatedBy)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Map<Long, User> owners = ownerIds.isEmpty() ? Map.of()
                : userRepository.findAllById(ownerIds).stream()
                        .collect(java.util.stream.Collectors.toMap(User::getId, owner -> owner));
        return notes.stream()
                .map(note -> {
                    NoteResponse base = toResponse(note);
                    User owner = note.getCreatedBy() == null ? null : owners.get(note.getCreatedBy());
                    if (owner == null) {
                        return base;
                    }
                    return new NoteResponse(
                            base.id(), base.title(), base.subject(), base.course(),
                            base.branch(), base.year(), base.semester(), base.description(),
                            base.fileUrl(), base.storagePath(), base.courseId(), base.courseTitle(),
                            owner.getName(), owner.getRole().name(), base.createdAt(),
                            base.videoCount());
                })
                .toList();
    }
}
