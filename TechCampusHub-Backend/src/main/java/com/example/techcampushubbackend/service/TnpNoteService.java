package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.ContentDtos.TnpNoteRequest;
import com.example.techcampushubbackend.dto.ContentDtos.TnpNoteResponse;
import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkResponse;
import com.example.techcampushubbackend.entity.RelatedVideoType;
import com.example.techcampushubbackend.entity.Role;
import com.example.techcampushubbackend.entity.TnpNote;
import com.example.techcampushubbackend.entity.User;
import com.example.techcampushubbackend.exception.ResourceNotFoundException;
import com.example.techcampushubbackend.repository.TnpNoteRepository;
import com.example.techcampushubbackend.security.AuthenticatedUser;
import com.example.techcampushubbackend.utils.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static com.example.techcampushubbackend.utils.ContentUtils.requireFileUrl;
import static com.example.techcampushubbackend.utils.ContentUtils.resolveTitle;

/** Training &amp; placement notes: same visibility rules as notes. */
@Service
@RequiredArgsConstructor
public class TnpNoteService {

    private final TnpNoteRepository tnpNoteRepository;
    private final CourseService courseService;
    private final PurchaseService purchaseService;
    private final CurrentUserService currentUserService;
    private final PdfIndexService pdfIndexService;
    private final RelatedVideoService relatedVideoService;

    @Transactional(readOnly = true)
    public List<TnpNoteResponse> listVisible() {
        User user = currentUserService.requireUser();
        return withVideoCounts(tnpNoteRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(note -> canAccess(note, user))
                .map(note -> toVisibleResponse(note, user))
                .toList());
    }

    @Transactional(readOnly = true)
    public List<TnpNoteResponse> listAll() {
        return withVideoCounts(tnpNoteRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(TnpNoteService::toResponse)
                .toList());
    }

    /**
     * Faculty workspace listing - only the caller's own TNP notes; admins see
     * everything (including legacy rows with no recorded owner).
     */
    @Transactional(readOnly = true)
    public List<TnpNoteResponse> listOwn() {
        User user = currentUserService.requireUser();
        return withVideoCounts(tnpNoteRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(note -> user.getRole() == Role.ADMIN
                        || (note.getCreatedBy() != null
                            && note.getCreatedBy().equals(user.getId())))
                .map(TnpNoteService::toResponse)
                .toList());
    }

    /** Every TNP note linked to a course bundle (ownership checked by the caller). */
    @Transactional(readOnly = true)
    public List<TnpNoteResponse> listByCourse(Long courseId) {
        if (courseId == null) {
            return List.of();
        }
        return withVideoCounts(tnpNoteRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(note -> note.getCourseBundle() != null
                        && courseId.equals(note.getCourseBundle().getId()))
                .map(TnpNoteService::toResponse)
                .toList());
    }

    @Transactional(readOnly = true)
    public TnpNoteResponse getVisible(Long id) {
        User user = currentUserService.requireUser();
        TnpNote note = require(id);
        if (!canAccess(note, user)) {
            throw new ResourceNotFoundException("TNP note", id);
        }
        return toVisibleResponse(note, user);
    }

    @Transactional
    public TnpNoteResponse create(TnpNoteRequest request) {
        return doCreate(request, null);
    }

    /** Faculty/admin create that stamps the uploader's user id as the owner. */
    @Transactional
    public TnpNoteResponse createAsOwner(TnpNoteRequest request, Long ownerId) {
        return doCreate(request, ownerId);
    }

    private TnpNoteResponse doCreate(TnpNoteRequest request, Long ownerId) {
        TnpNote note = TnpNote.builder()
                .title(resolveTitle(request.title(), request.topic()))
                .topic(request.topic())
                .description(request.description())
                .fileUrl(requireFileUrl(request.fileUrl()))
                .storagePath(request.storagePath())
                .courseBundle(loadBundle(request.courseId()))
                .createdBy(ownerId)
                .build();
        TnpNote saved = tnpNoteRepository.save(note);
        relatedVideoService.replace(RelatedVideoType.TNP, saved.getId(),
                request.videos(), videoUploaderId(ownerId));
        reindexForSearch(saved);
        return toResponse(saved);
    }

    /**
     * Faculty workspace update: a faculty member may only edit a TNP note they
     * own ({@code createdBy} == caller id); admins may edit any. Attempting to
     * edit someone else's note raises Spring's AccessDeniedException → 403.
     */
    @Transactional
    public TnpNoteResponse updateOwned(Long id, TnpNoteRequest request) {
        User user = currentUserService.requireUser();
        TnpNote note = require(id);
        if (user.getRole() != Role.ADMIN
                && (note.getCreatedBy() == null || !note.getCreatedBy().equals(user.getId()))) {
            throw new AccessDeniedException("You can only edit TNP notes you uploaded");
        }
        return update(id, request);
    }

    @Transactional
    public TnpNoteResponse update(Long id, TnpNoteRequest request) {
        TnpNote note = require(id);
        note.setTitle(request.title() == null || request.title().isBlank()
                ? note.getTitle()
                : request.title().trim());
        if (request.topic() != null) note.setTopic(request.topic());
        if (request.description() != null) note.setDescription(request.description());
        if (request.fileUrl() != null) note.setFileUrl(request.fileUrl());
        if (request.storagePath() != null) note.setStoragePath(request.storagePath());
        if (request.courseId() != null) note.setCourseBundle(loadBundle(request.courseId()));
        TnpNote saved = tnpNoteRepository.save(note);
        relatedVideoService.replace(RelatedVideoType.TNP, saved.getId(),
                request.videos(), currentUploaderId());
        reindexForSearch(saved);
        return toResponse(saved);
    }

    @Transactional
    public void delete(Long id) {
        relatedVideoService.deleteAll(RelatedVideoType.TNP, id);
        tnpNoteRepository.delete(require(id));
        pdfIndexService.removeIndexAsync(PdfIndexService.CAT_TNP, id);
    }

    /**
     * Videos for one TNP note, guarded by the same purchase/visibility rules as
     * {@link #getVisible(Long)}.
     */
    @Transactional(readOnly = true)
    public List<VideoLinkResponse> listVisibleVideos(Long id) {
        User user = currentUserService.requireUser();
        TnpNote note = require(id);
        if (!canAccess(note, user)) {
            throw new ResourceNotFoundException("TNP note", id);
        }
        return relatedVideoService.list(RelatedVideoType.TNP, id);
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
    private void reindexForSearch(TnpNote note) {
        pdfIndexService.reindexAsync(PdfIndexService.CAT_TNP, note.getId(),
                note.getFileUrl(), note.getTitle(), note.getTopic(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getId(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getTitle(),
                null);
    }

    /**
     * Bundle resolution enforces ownership: faculty may only link content to
     * courses they launched; admins may link to any course (403 otherwise).
     */
    private com.example.techcampushubbackend.entity.Course loadBundle(Long courseId) {
        return courseService.requireOwnedBundle(courseId);
    }

    private TnpNote require(Long id) {
        return tnpNoteRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("TNP note", id));
    }

    private boolean canAccess(TnpNote note, User user) {
        // ADMIN and FACULTY staff read all content regardless of purchases.
        if (note.getCourseBundle() == null
                || user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY) {
            return true;
        }
        return purchaseService.hasActiveAccess(user.getId(), note.getCourseBundle().getId());
    }

    public static TnpNoteResponse toResponse(TnpNote note) {
        return new TnpNoteResponse(
                note.getId(), note.getTitle(), note.getTopic(), note.getDescription(),
                note.getFileUrl(), note.getStoragePath(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getId(),
                note.getCourseBundle() == null ? null : note.getCourseBundle().getTitle(),
                note.getCreatedAt(),
                0);
    }

    /**
     * Stamp the related-video count used by the list cards' "Related Videos"
     * button. One grouped query for the whole page - the video rows themselves
     * are fetched on demand when the button is clicked.
     */
    private List<TnpNoteResponse> withVideoCounts(List<TnpNoteResponse> notes) {
        if (notes.isEmpty()) {
            return notes;
        }
        Map<Long, Integer> counts = relatedVideoService.counts(RelatedVideoType.TNP);
        return notes.stream()
                .map(note -> note.withVideoCount(counts.getOrDefault(note.id(), 0)))
                .toList();
    }

    /**
     * Per-role payload: students get the storage URL withheld (they read the
     * bytes through /api/content/**), staff keep the real URL because their
     * management UIs (edit/replace/delete) depend on it.
     */
    private static TnpNoteResponse toVisibleResponse(TnpNote note, User user) {
        boolean staff = user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY;
        return staff ? toResponse(note) : toStudentResponse(note);
    }

    /** Student payload: storage URLs withheld - bytes stream via /api/content/**. */
    public static TnpNoteResponse toStudentResponse(TnpNote note) {
        TnpNoteResponse base = toResponse(note);
        return new TnpNoteResponse(
                base.id(), base.title(), base.topic(), base.description(),
                null,
                null,
                base.courseId(), base.courseTitle(),
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
        TnpNote note = require(id);
        if (!canAccess(note, user)) {
            throw new ResourceNotFoundException("TNP note", id);
        }
        if (note.getFileUrl() == null || note.getFileUrl().isBlank()) {
            throw new ResourceNotFoundException("TNP note file", id);
        }
        return note.getFileUrl();
    }
}
