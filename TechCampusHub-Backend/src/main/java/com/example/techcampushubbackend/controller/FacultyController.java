package com.example.techcampushubbackend.controller;

import com.example.techcampushubbackend.dto.ApiResponse;
import com.example.techcampushubbackend.dto.ContentDtos.CertificateResponse;
import com.example.techcampushubbackend.dto.ContentDtos.FileUploadResponse;
import com.example.techcampushubbackend.dto.ContentDtos.NoteRequest;
import com.example.techcampushubbackend.dto.ContentDtos.NoteResponse;
import com.example.techcampushubbackend.dto.ContentDtos.PyqRequest;
import com.example.techcampushubbackend.dto.ContentDtos.PyqResponse;
import com.example.techcampushubbackend.dto.ContentDtos.SyllabusRequest;
import com.example.techcampushubbackend.dto.ContentDtos.SyllabusResponse;
import com.example.techcampushubbackend.dto.ContentDtos.TimetableRequest;
import com.example.techcampushubbackend.dto.ContentDtos.TimetableResponse;
import com.example.techcampushubbackend.dto.ContentDtos.TnpNoteRequest;
import com.example.techcampushubbackend.dto.ContentDtos.TnpNoteResponse;
import com.example.techcampushubbackend.dto.CourseDtos.CourseRequest;
import com.example.techcampushubbackend.dto.CourseDtos.CourseContentResponse;
import com.example.techcampushubbackend.dto.CourseDtos.CourseResponse;
import com.example.techcampushubbackend.dto.EngagementDtos.FeedbackResponse;
import com.example.techcampushubbackend.dto.EngagementDtos.NotificationResponse;
import com.example.techcampushubbackend.dto.FacultyDtos.FacultyNotificationRequest;
import com.example.techcampushubbackend.dto.FacultyDtos.FacultyNotificationSendResponse;
import com.example.techcampushubbackend.dto.FacultyDtos.FacultyStatsResponse;
import com.example.techcampushubbackend.dto.FacultyDtos.FacultyStudentResponse;
import com.example.techcampushubbackend.dto.FacultyDtos.ResourceRequest;
import com.example.techcampushubbackend.dto.FacultyDtos.ResourceResponse;
import com.example.techcampushubbackend.service.CertificateService;
import com.example.techcampushubbackend.service.CloudinaryService;
import com.example.techcampushubbackend.service.CourseService;
import com.example.techcampushubbackend.service.FacultyDashboardService;
import com.example.techcampushubbackend.service.FacultyResourceService;
import com.example.techcampushubbackend.service.FeedbackService;
import com.example.techcampushubbackend.service.NoteService;
import com.example.techcampushubbackend.service.NotificationService;
import com.example.techcampushubbackend.service.PyqService;
import com.example.techcampushubbackend.service.SyllabusService;
import com.example.techcampushubbackend.service.TimetableService;
import com.example.techcampushubbackend.service.TnpNoteService;
import com.example.techcampushubbackend.utils.CurrentUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Faculty content workspace, deliberately mapped under {@code /api/faculty}
 * (never {@code /api/admin}, which SecurityConfig hard-blocks to ADMIN).
 *
 * <p>Faculty may create, list and update <b>their own</b> content in all four
 * upload categories (notes, TNP, PYQ, timetables) plus courses; admins may do
 * the same for anything. Deletion stays admin-only for those categories. The
 * syllabus workspace is the single exception: faculty may delete a syllabus
 * they uploaded or one of their own courses (ownership re-checked in the
 * service), so they can replace outdated course documents themselves.</p>
 */
@Tag(name = "Faculty", description = "Faculty workspace: create/read/update own notes, courses, "
        + "TNP notes, PYQs and timetables; manage syllabus of own courses")
@RestController
@RequestMapping("/api/faculty")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN','FACULTY')")
public class FacultyController {

    private final NoteService noteService;
    private final CourseService courseService;
    private final TnpNoteService tnpNoteService;
    private final PyqService pyqService;
    private final TimetableService timetableService;
    private final SyllabusService syllabusService;
    private final CloudinaryService cloudinaryService;
    private final CurrentUserService currentUserService;
    private final FacultyDashboardService facultyDashboardService;
    private final FacultyResourceService facultyResourceService;
    private final NotificationService notificationService;
    private final CertificateService certificateService;
    private final FeedbackService feedbackService;

    // -------------------------------------------------------------- dashboard

    @Operation(summary = "Dashboard statistics (faculty: own courses/students/content only)",
            description = "Powers the four summary cards: Total Courses, Total Students, "
                    + "Total Content and Recent Purchases - all scoped to the caller.")
    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<FacultyStatsResponse>> stats() {
        return ResponseEntity.ok(ApiResponse.ok(facultyDashboardService.stats()));
    }

    @Operation(summary = "My students (read-only Users table)",
            description = "One row per purchase of the caller's courses: student name, email, "
                    + "mobile, purchased course, purchase date, progress and status. "
                    + "No mutation is exposed - deletion and role changes stay admin-only.")
    @GetMapping("/students")
    public ResponseEntity<ApiResponse<List<FacultyStudentResponse>>> listStudents() {
        return ResponseEntity.ok(ApiResponse.ok(facultyDashboardService.listStudents()));
    }

    // ---------------------------------------------------------- notifications

    @Operation(summary = "Send a notification to my students",
            description = "Delivered only to students with an approved purchase of the caller's "
                    + "courses; optionally narrowed to one owned course via courseId.")
    @PostMapping("/notifications")
    public ResponseEntity<ApiResponse<FacultyNotificationSendResponse>> sendNotification(
            @Valid @RequestBody FacultyNotificationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(notificationService.sendToMyStudents(request)));
    }

    @Operation(summary = "Notifications I have sent (faculty: own only; admins: all)")
    @GetMapping("/notifications")
    public ResponseEntity<ApiResponse<List<NotificationResponse>>> listSentNotifications() {
        return ResponseEntity.ok(ApiResponse.ok(notificationService.listSentByMe()));
    }

    // ----------------------------------------------------------- certificates

    @Operation(summary = "Certificates visible to me",
            description = "Certificates issued for the caller's courses or to students "
                    + "enrolled in them - never other faculty's certificates.")
    @GetMapping("/certificates")
    public ResponseEntity<ApiResponse<List<CertificateResponse>>> listCertificates() {
        return ResponseEntity.ok(ApiResponse.ok(certificateService.listVisibleToMe()));
    }

    // -------------------------------------------------------------- feedback

    @Operation(summary = "Feedback on my courses (faculty: own only; admins: all)")
    @GetMapping("/feedback")
    public ResponseEntity<ApiResponse<List<FeedbackResponse>>> listFeedback() {
        return ResponseEntity.ok(ApiResponse.ok(feedbackService.listOnMyCourses()));
    }

    // ------------------------------------------------------------- resources

    @Operation(summary = "Upload a video/assignment/other file (faculty: own courses only)")
    @PostMapping("/resources")
    public ResponseEntity<ApiResponse<ResourceResponse>> createResource(
            @Valid @RequestBody ResourceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(facultyResourceService.createAsOwner(
                        request, currentUserService.requireUser().getId())));
    }

    @Operation(summary = "List my resources (videos, assignments, other files)")
    @GetMapping("/resources")
    public ResponseEntity<ApiResponse<List<ResourceResponse>>> listResources() {
        return ResponseEntity.ok(ApiResponse.ok(facultyResourceService.listOwn()));
    }

    @Operation(summary = "Update my resource (faculty: own only -> 403 otherwise; admins: any)",
            description = "No DELETE route - content deletion is admin-only.")
    @PutMapping("/resources/{id}")
    public ResponseEntity<ApiResponse<ResourceResponse>> updateResource(
            @PathVariable Long id, @Valid @RequestBody ResourceRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(facultyResourceService.updateOwned(id, request)));
    }

    // ------------------------------------------------------------------ notes

    @Operation(summary = "Create a note (faculty/admin) - stamped with the uploader")
    @PostMapping("/notes")
    public ResponseEntity<ApiResponse<NoteResponse>> createNote(
            @Valid @RequestBody NoteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(noteService.createAsOwner(
                        request, currentUserService.requireUser().getId())));
    }

    @Operation(summary = "List my notes (faculty: own only; admins: all)")
    @GetMapping("/notes")
    public ResponseEntity<ApiResponse<List<NoteResponse>>> listNotes() {
        return ResponseEntity.ok(ApiResponse.ok(noteService.listOwn()));
    }

    @Operation(summary = "Update a note (faculty: own notes only -> 403 otherwise; admins: any)",
            description = "Deletion is intentionally not exposed here - use DELETE /api/admin/notes/{id}.")
    @PutMapping("/notes/{id}")
    public ResponseEntity<ApiResponse<NoteResponse>> updateNote(
            @PathVariable Long id, @Valid @RequestBody NoteRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.updateOwned(id, request)));
    }

    // ---------------------------------------------------------------- courses

    @Operation(summary = "Create a course (faculty/admin) - active immediately")
    @PostMapping("/courses")
    public ResponseEntity<ApiResponse<CourseResponse>> createCourse(
            @Valid @RequestBody CourseRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(courseService.createAsOwner(
                        request, currentUserService.requireUser().getId())));
    }

    @Operation(summary = "List my courses (faculty: own only; admins: all)")
    @GetMapping("/courses")
    public ResponseEntity<ApiResponse<List<CourseResponse>>> listCourses() {
        return ResponseEntity.ok(ApiResponse.ok(courseService.listOwn()));
    }

    @Operation(summary = "Edit / publish-unpublish one of my courses",
            description = "Faculty may only edit courses they launched (others -> 403); "
                    + "sending active=false unpublishes the course from the public catalogue.")
    @PutMapping("/courses/{id}")
    public ResponseEntity<ApiResponse<CourseResponse>> updateCourse(
            @PathVariable Long id, @Valid @RequestBody CourseRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(courseService.updateOwned(id, request)));
    }

    @Operation(summary = "Open one of my courses with all of its uploaded content "
            + "(notes, TNP, PYQs, timetables) - other people's courses return 403")
    @GetMapping("/courses/{id}/content")
    public ResponseEntity<ApiResponse<CourseContentResponse>> courseContent(
            @PathVariable Long id) {
        // Ownership check first (404 unknown, 403 not mine), then aggregate
        // every piece of content linked to the course bundle.
        CourseResponse course = courseService.getOwned(id);
        return ResponseEntity.ok(ApiResponse.ok(new CourseContentResponse(
                course,
                noteService.listByCourse(id),
                tnpNoteService.listByCourse(id),
                pyqService.listByCourse(id),
                timetableService.listByCourse(id))));
    }

    // ------------------------------------------------------------ TNP notes

    @Operation(summary = "Create a TNP note (faculty/admin) - stamped with the uploader")
    @PostMapping("/tnp-notes")
    public ResponseEntity<ApiResponse<TnpNoteResponse>> createTnpNote(
            @Valid @RequestBody TnpNoteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(tnpNoteService.createAsOwner(
                        request, currentUserService.requireUser().getId())));
    }

    @Operation(summary = "List my TNP notes (faculty: own only; admins: all)")
    @GetMapping("/tnp-notes")
    public ResponseEntity<ApiResponse<List<TnpNoteResponse>>> listTnpNotes() {
        return ResponseEntity.ok(ApiResponse.ok(tnpNoteService.listOwn()));
    }

    @Operation(summary = "Update a TNP note (faculty: own only -> 403 otherwise; admins: any)",
            description = "Deletion is intentionally not exposed here - use DELETE /api/admin/tnp-notes/{id}.")
    @PutMapping("/tnp-notes/{id}")
    public ResponseEntity<ApiResponse<TnpNoteResponse>> updateTnpNote(
            @PathVariable Long id, @Valid @RequestBody TnpNoteRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(tnpNoteService.updateOwned(id, request)));
    }

    // ------------------------------------------------------------------ PYQs

    @Operation(summary = "Create a previous year paper (faculty/admin) - stamped with the uploader")
    @PostMapping("/pyqs")
    public ResponseEntity<ApiResponse<PyqResponse>> createPyq(
            @Valid @RequestBody PyqRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(pyqService.createAsOwner(
                        request, currentUserService.requireUser().getId())));
    }

    @Operation(summary = "List my PYQs (faculty: own only; admins: all)")
    @GetMapping("/pyqs")
    public ResponseEntity<ApiResponse<List<PyqResponse>>> listPyqs() {
        return ResponseEntity.ok(ApiResponse.ok(pyqService.listOwn()));
    }

    @Operation(summary = "Update a PYQ (faculty: own only -> 403 otherwise; admins: any)",
            description = "Deletion is intentionally not exposed here - use DELETE /api/admin/pyqs/{id}.")
    @PutMapping("/pyqs/{id}")
    public ResponseEntity<ApiResponse<PyqResponse>> updatePyq(
            @PathVariable Long id, @Valid @RequestBody PyqRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(pyqService.updateOwned(id, request)));
    }

    // ------------------------------------------------------------- timetables

    @Operation(summary = "Create a timetable (faculty/admin) - stamped with the uploader")
    @PostMapping("/timetables")
    public ResponseEntity<ApiResponse<TimetableResponse>> createTimetable(
            @Valid @RequestBody TimetableRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(timetableService.createAsOwner(
                        request, currentUserService.requireUser().getId())));
    }

    @Operation(summary = "List my timetables (faculty: own only; admins: all)")
    @GetMapping("/timetables")
    public ResponseEntity<ApiResponse<List<TimetableResponse>>> listTimetables() {
        return ResponseEntity.ok(ApiResponse.ok(timetableService.listOwn()));
    }

    @Operation(summary = "Update a timetable (faculty: own only -> 403 otherwise; admins: any)",
            description = "Deletion is intentionally not exposed here - use DELETE /api/admin/timetables/{id}.")
    @PutMapping("/timetables/{id}")
    public ResponseEntity<ApiResponse<TimetableResponse>> updateTimetable(
            @PathVariable Long id, @Valid @RequestBody TimetableRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(timetableService.updateOwned(id, request)));
    }

    // ---------------------------------------------------------------- syllabus

    @Operation(summary = "Upload a syllabus (faculty/admin) - stamped with the uploader",
            description = "One active syllabus per course + semester. Sending "
                    + "replaceExisting=true marks the previous active row Inactive.")
    @PostMapping("/syllabus")
    public ResponseEntity<ApiResponse<SyllabusResponse>> createSyllabus(
            @Valid @RequestBody SyllabusRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(syllabusService.createAsOwner(
                        request, currentUserService.requireUser().getId())));
    }

    @Operation(summary = "List my syllabus documents (faculty: own uploads + own courses; admins: all)")
    @GetMapping("/syllabus")
    public ResponseEntity<ApiResponse<List<SyllabusResponse>>> listSyllabus() {
        return ResponseEntity.ok(ApiResponse.ok(syllabusService.listOwn()));
    }

    @Operation(summary = "Update / replace a syllabus (faculty: own only -> 403 otherwise; admins: any)")
    @PutMapping("/syllabus/{id}")
    public ResponseEntity<ApiResponse<SyllabusResponse>> updateSyllabus(
            @PathVariable Long id, @Valid @RequestBody SyllabusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(syllabusService.updateOwned(id, request)));
    }

    @Operation(summary = "Delete a syllabus (faculty: own uploads + own courses only; admins: any)")
    @DeleteMapping("/syllabus/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteSyllabus(@PathVariable Long id) {
        syllabusService.deleteOwned(id);
        return ResponseEntity.ok(ApiResponse.ok("Syllabus deleted", null));
    }

    // ------------------------------------------------------------------ files

    @Operation(summary = "Upload a PDF/image to Cloudinary (faculty/admin)",
            description = "Same pipeline as POST /api/admin/files; returns the URL to persist "
                    + "on the content record. Deleting assets stays admin-only.")
    @PostMapping("/files")
    public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", required = false, defaultValue = "misc") String folder) {
        // Keep the folder segment path-safe (mirrors FileController).
        String safeFolder = folder.replaceAll("[^a-zA-Z0-9_\\-]", "");
        return ResponseEntity.ok(ApiResponse.ok(
                cloudinaryService.upload(file, safeFolder.isBlank() ? "misc" : safeFolder)));
    }
}
