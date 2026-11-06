package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.ContentDtos.SyllabusRequest;
import com.example.techcampushubbackend.dto.ContentDtos.SyllabusResponse;
import com.example.techcampushubbackend.entity.Role;
import com.example.techcampushubbackend.entity.Syllabus;
import com.example.techcampushubbackend.entity.User;
import com.example.techcampushubbackend.exception.ApiException;
import com.example.techcampushubbackend.exception.ResourceNotFoundException;
import com.example.techcampushubbackend.repository.SyllabusRepository;
import com.example.techcampushubbackend.repository.UserRepository;
import com.example.techcampushubbackend.utils.CurrentUserService;
import com.example.techcampushubbackend.utils.ProgramFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
 * Syllabus: one active PDF per program + semester.
 *
 * <p>Visibility mirrors notes: students only see active rows of their own
 * program and free rows plus course bundles they hold an approved, unexpired
 * purchase of. Staff manage every row. Replacing an active syllabus marks the
 * previous row {@code Inactive} - history is kept, never silently deleted.
 */
@Service
@RequiredArgsConstructor
public class SyllabusService {

    private static final int MIN_SEMESTER = 1;
    private static final int MAX_SEMESTER = 8;

    private final SyllabusRepository syllabusRepository;
    private final CourseService courseService;
    private final PurchaseService purchaseService;
    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;

    // ------------------------------------------------------------- students

    /** Student/read listing: active rows only, gated by program + purchase. */
    @Transactional(readOnly = true)
    public List<SyllabusResponse> listVisible() {
        User user = currentUserService.requireUser();
        boolean staff = isStaff(user);
        return syllabusRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(Syllabus::isActive)
                .filter(row -> canAccess(row, user))
                .filter(row -> staff || ProgramFilter.matches(row.getCourse(), user.getCourse()))
                .map(row -> staff ? toResponse(row) : toStudentResponse(row))
                .toList();
    }

    @Transactional(readOnly = true)
    public SyllabusResponse getVisible(Long id) {
        User user = currentUserService.requireUser();
        Syllabus row = require(id);
        if (!isStaff(user) && !row.isActive()) {
            throw new ResourceNotFoundException("Syllabus", id);
        }
        if (!canAccess(row, user) || !canSeeProgram(row, user)) {
            throw new ResourceNotFoundException("Syllabus", id);
        }
        return isStaff(user) ? toResponse(row) : toStudentResponse(row);
    }

    /**
     * Access-checked server-side resolution of the storage URL for the secure
     * streaming routes. Mirrors {@link #getVisible(Long)} - students can only
     * ever stream an active, accessible syllabus of their own program.
     */
    @Transactional(readOnly = true)
    public String requireVisibleFileUrl(Long id) {
        User user = currentUserService.requireUser();
        Syllabus row = require(id);
        if (!isStaff(user) && !row.isActive()) {
            throw new ResourceNotFoundException("Syllabus", id);
        }
        if (!canAccess(row, user) || !canSeeProgram(row, user)) {
            throw new ResourceNotFoundException("Syllabus", id);
        }
        if (row.getFileUrl() == null || row.getFileUrl().isBlank()) {
            throw new ResourceNotFoundException("Syllabus file", id);
        }
        return row.getFileUrl();
    }

    // -------------------------------------------------------------- admin

    /** Admin listing - every row, including Inactive history. */
    @Transactional(readOnly = true)
    public List<SyllabusResponse> listAll() {
        return withOwners(syllabusRepository.findAllByOrderByCreatedAtDesc());
    }

    @Transactional
    public SyllabusResponse create(SyllabusRequest request) {
        return doCreate(request, currentUserService.requireUser());
    }

    /** Faculty/admin create that stamps the uploader and their role. */
    @Transactional
    public SyllabusResponse createAsOwner(SyllabusRequest request, Long ownerId) {
        User owner = ownerId == null
                ? currentUserService.requireUser()
                : userRepository.findById(ownerId)
                        .orElseThrow(() -> new ResourceNotFoundException("User", ownerId));
        return doCreate(request, owner);
    }

    @Transactional
    public SyllabusResponse update(Long id, SyllabusRequest request) {
        return doUpdate(require(id), request);
    }

    /**
     * Faculty workspace update: a faculty member may only edit a syllabus they
     * uploaded or one linked to a course they launched; admins may edit any.
     */
    @Transactional
    public SyllabusResponse updateOwned(Long id, SyllabusRequest request) {
        User user = currentUserService.requireUser();
        Syllabus row = require(id);
        if (!canManage(row, user)) {
            throw new AccessDeniedException("You can only edit syllabus of your own courses");
        }
        return doUpdate(row, request);
    }

    @Transactional
    public void delete(Long id) {
        syllabusRepository.delete(require(id));
    }

    /**
     * Faculty workspace delete: own uploads and documents of courses the
     * caller launched only. There is intentionally no anonymous delete path.
     */
    @Transactional
    public void deleteOwned(Long id) {
        User user = currentUserService.requireUser();
        Syllabus row = require(id);
        if (!canManage(row, user)) {
            throw new AccessDeniedException("You can only delete syllabus of your own courses");
        }
        syllabusRepository.delete(row);
    }

    /** Every syllabus linked to a course bundle (ownership checked by the caller). */
    @Transactional(readOnly = true)
    public List<SyllabusResponse> listByCourse(Long courseId) {
        if (courseId == null) {
            return List.of();
        }
        return syllabusRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(row -> row.getCourseBundle() != null
                        && courseId.equals(row.getCourseBundle().getId()))
                .map(SyllabusService::toResponse)
                .toList();
    }

    // ------------------------------------------------------------- faculty

    /**
     * Faculty workspace listing: rows the caller uploaded plus rows linked to
     * courses the caller launched (admins see everything).
     */
    @Transactional(readOnly = true)
    public List<SyllabusResponse> listOwn() {
        User user = currentUserService.requireUser();
        if (user.getRole() == Role.ADMIN) {
            return withOwners(syllabusRepository.findAllByOrderByCreatedAtDesc());
        }
        List<Syllabus> rows = syllabusRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(row -> isOwner(row, user) || ownsBundle(row, user))
                .toList();
        return withOwners(rows);
    }

    // ------------------------------------------------------------ internal

    private SyllabusResponse doCreate(SyllabusRequest request, User uploader) {
        if (request.course() == null || request.course().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Program (course) is required for a syllabus upload");
        }
        String course = request.course().trim();
        int semester = requireSemester(request.semester());
        String status = normalizeStatus(request.status());

        if (Syllabus.STATUS_ACTIVE.equals(status)) {
            List<Syllabus> active = activeRows(course, semester, null);
            if (!active.isEmpty()) {
                if (!Boolean.TRUE.equals(request.replaceExisting())) {
                    throw new ApiException(HttpStatus.CONFLICT,
                            "A syllabus for this course and semester already exists. "
                                    + "Confirm replacement to continue.");
                }
                deactivate(active);
            }
        }

        Syllabus row = Syllabus.builder()
                .title(resolveTitle(request.title(), course + " Semester " + roman(semester)))
                .course(course)
                .semester(semester)
                .fileUrl(requireFileUrl(request.fileUrl()))
                .storagePath(request.storagePath())
                .fileName(request.fileName())
                .status(status)
                .courseBundle(loadBundle(request.courseId()))
                .createdBy(uploader.getId())
                .uploaderRole(uploader.getRole() == null ? null : uploader.getRole().name())
                .build();

        return toResponse(syllabusRepository.save(row));
    }

    private SyllabusResponse doUpdate(Syllabus row, SyllabusRequest request) {
        String course = request.course() == null || request.course().isBlank()
                ? row.getCourse()
                : request.course().trim();
        int semester = request.semester() == null
                ? row.getSemester()
                : requireSemester(request.semester());
        String status = request.status() == null || request.status().isBlank()
                ? row.getStatus()
                : normalizeStatus(request.status());

        if (Syllabus.STATUS_ACTIVE.equals(status)) {
            List<Syllabus> active = activeRows(course, semester, row.getId());
            if (!active.isEmpty()) {
                if (!Boolean.TRUE.equals(request.replaceExisting())) {
                    throw new ApiException(HttpStatus.CONFLICT,
                            "A syllabus for this course and semester already exists. "
                                    + "Confirm replacement to continue.");
                }
                deactivate(active);
            }
        }

        if (request.title() != null && !request.title().isBlank()) {
            row.setTitle(request.title().trim());
        }
        row.setCourse(course);
        row.setSemester(semester);
        if (request.fileUrl() != null && !request.fileUrl().isBlank()) {
            row.setFileUrl(request.fileUrl());
        }
        if (request.storagePath() != null) row.setStoragePath(request.storagePath());
        if (request.fileName() != null) row.setFileName(request.fileName());
        row.setStatus(status);
        if (request.courseId() != null) row.setCourseBundle(loadBundle(request.courseId()));

        return toResponse(syllabusRepository.save(row));
    }

    /**
     * At most one Active row may exist for a program + semester. Labels are
     * compared after {@link ProgramFilter#normalize(String)} so "B.Tech",
     * "BTech" and "b tech" are the same programme.
     */
    private List<Syllabus> activeRows(String course, int semester, Long exceptId) {
        String key = ProgramFilter.normalize(course);
        return syllabusRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(Syllabus::isActive)
                .filter(row -> row.getSemester() == semester)
                .filter(row -> Objects.equals(ProgramFilter.normalize(row.getCourse()), key))
                .filter(row -> exceptId == null || !exceptId.equals(row.getId()))
                .toList();
    }

    private void deactivate(List<Syllabus> rows) {
        rows.forEach(row -> row.setStatus(Syllabus.STATUS_INACTIVE));
        syllabusRepository.saveAll(rows);
    }

    private Syllabus require(Long id) {
        return syllabusRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Syllabus", id));
    }

    private com.example.techcampushubbackend.entity.Course loadBundle(Long courseId) {
        return courseService.requireOwnedBundle(courseId);
    }

    private boolean canAccess(Syllabus row, User user) {
        if (row.getCourseBundle() == null || isStaff(user)) {
            return true;
        }
        return purchaseService.hasActiveAccess(user.getId(), row.getCourseBundle().getId());
    }

    private boolean canSeeProgram(Syllabus row, User user) {
        return isStaff(user) || ProgramFilter.matches(row.getCourse(), user.getCourse());
    }

    private static boolean isStaff(User user) {
        return user.getRole() == Role.ADMIN || user.getRole() == Role.FACULTY;
    }

    private static boolean isOwner(Syllabus row, User user) {
        return row.getCreatedBy() != null && row.getCreatedBy().equals(user.getId());
    }

    private static boolean ownsBundle(Syllabus row, User user) {
        return row.getCourseBundle() != null
                && row.getCourseBundle().getCreatedBy() != null
                && row.getCourseBundle().getCreatedBy().equals(user.getId());
    }

    private static boolean canManage(Syllabus row, User user) {
        return user.getRole() == Role.ADMIN || isOwner(row, user) || ownsBundle(row, user);
    }

    private static int requireSemester(Integer semester) {
        if (semester == null || semester < MIN_SEMESTER || semester > MAX_SEMESTER) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Semester must be between " + MIN_SEMESTER + " and " + MAX_SEMESTER);
        }
        return semester;
    }

    private static String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return Syllabus.STATUS_ACTIVE;
        }
        String trimmed = status.trim();
        if (Syllabus.STATUS_ACTIVE.equalsIgnoreCase(trimmed)) {
            return Syllabus.STATUS_ACTIVE;
        }
        if (Syllabus.STATUS_INACTIVE.equalsIgnoreCase(trimmed)) {
            return Syllabus.STATUS_INACTIVE;
        }
        throw new ApiException(HttpStatus.BAD_REQUEST,
                "Status must be Active or Inactive");
    }

    // ------------------------------------------------------------ mapping

    public static SyllabusResponse toResponse(Syllabus row) {
        return new SyllabusResponse(
                row.getId(),
                row.getTitle(),
                row.getCourse(),
                row.getSemester(),
                row.getFileUrl(),
                row.getStoragePath(),
                row.getFileName(),
                row.getCourseBundle() == null ? null : row.getCourseBundle().getId(),
                row.getCourseBundle() == null ? null : row.getCourseBundle().getTitle(),
                row.getCreatedBy(),
                null,
                row.getUploaderRole(),
                row.getStatus(),
                row.getCreatedAt(),
                row.getUpdatedAt(),
                row.getCreatedAt());
    }

    /** Student payload: storage URLs and uploader identity are withheld. */
    public static SyllabusResponse toStudentResponse(Syllabus row) {
        SyllabusResponse base = toResponse(row);
        return new SyllabusResponse(
                base.id(), base.title(), base.course(), base.semester(),
                null, null, base.fileName(),
                base.courseId(), base.courseTitle(),
                null, null, null,
                base.status(),
                base.uploadDate(), base.updatedAt(), base.createdAt());
    }

    /** Batch-resolves uploader names once per list (no N+1). */
    private List<SyllabusResponse> withOwners(List<Syllabus> rows) {
        Set<Long> ownerIds = rows.stream()
                .map(Syllabus::getCreatedBy)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Map<Long, User> owners = ownerIds.isEmpty() ? Map.of()
                : userRepository.findAllById(ownerIds).stream()
                        .collect(java.util.stream.Collectors.toMap(User::getId, owner -> owner));

        return rows.stream().map(row -> {
            SyllabusResponse base = toResponse(row);
            User owner = row.getCreatedBy() == null ? null : owners.get(row.getCreatedBy());
            return new SyllabusResponse(
                    base.id(), base.title(), base.course(), base.semester(),
                    base.fileUrl(), base.storagePath(), base.fileName(),
                    base.courseId(), base.courseTitle(),
                    base.uploadedBy(),
                    owner == null ? null : owner.getName(),
                    base.uploaderRole(),
                    base.status(),
                    base.uploadDate(), base.updatedAt(), base.createdAt());
        }).toList();
    }

    /** 1 -> "I", 2 -> "II", ... only used for the default title. */
    private static String roman(int value) {
        return switch (value) {
            case 1 -> "I";
            case 2 -> "II";
            case 3 -> "III";
            case 4 -> "IV";
            case 5 -> "V";
            case 6 -> "VI";
            case 7 -> "VII";
            case 8 -> "VIII";
            default -> String.valueOf(value);
        };
    }
}
