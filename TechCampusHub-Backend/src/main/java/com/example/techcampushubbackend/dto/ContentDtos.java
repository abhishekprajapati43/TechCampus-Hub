package com.example.techcampushubbackend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Request/response payloads for the content collections:
 * notes, PYQs, TNP notes, timetables and certificates.
 *
 * <p>The client either passes a pre-uploaded Cloudinary {@code fileUrl}, or uses the
 * {@code POST /api/admin/files} multipart endpoint to upload and then stores the URL.</p>
 */
public final class ContentDtos {

    private ContentDtos() {
    }

    // --------------------------------------------------------- related videos

    /**
     * One YouTube lecture attached to a Notes or TNP record. Both fields are
     * validated again server-side; a blank row (no title and no URL) is
     * ignored by the service so the add-link form can keep an empty row.
     */
    public record VideoLinkRequest(
            @Size(max = 200) String videoTitle,

            @Size(max = 600) String youtubeUrl) {
    }

    public record VideoLinkResponse(
            Long id,
            Long noteOrTnpId,
            String videoTitle,
            String youtubeUrl,
            Long uploadedBy,
            int sortOrder,
            LocalDateTime createdAt) {
    }

    // ---------------------------------------------------------------- notes

    /**
     * Note/PYQ/TNP/timetable titles are optional in the admin upload form; the
     * service falls back to the subject/topic/course when they are left blank.
     */
    public record NoteRequest(
            @Size(max = 200) String title,

            @Size(max = 120) String subject,

            @Size(max = 60) String course,

            @Size(max = 40) String branch,

            Integer year,

            Integer semester,

            @Size(max = 600) String description,

            /** Required on create; optional on update (partial PUT). */
            @Size(max = 600)
            @Pattern(regexp = "^$|^https?://.*", message = "fileUrl must be an http(s) URL")
            String fileUrl,

            /** Cloudinary public id - kept so the asset can be deleted later. */
            @Size(max = 300) String storagePath,

            Long courseId,

            /** Optional ordered YouTube lectures (null on a partial update = keep). */
            List<VideoLinkRequest> videos) {
    }

    public record NoteResponse(
            Long id,
            String title,
            String subject,
            String course,
            String branch,
            Integer year,
            int semester,
            String description,
            String fileUrl,
            String storagePath,
            Long courseId,
            String courseTitle,
            /** Uploader name - populated only for the admin list (moderation/audit). */
            @JsonInclude(JsonInclude.Include.NON_NULL)
            String createdByName,
            /** Uploader role (ADMIN/FACULTY) - populated only for the admin list. */
            @JsonInclude(JsonInclude.Include.NON_NULL)
            String createdByRole,
            LocalDateTime createdAt,
            /** Number of related YouTube lectures (0 when none). */
            int videoCount) {

        /** Copy with the related-video count resolved for a list response. */
        public NoteResponse withVideoCount(int count) {
            return new NoteResponse(
                    id, title, subject, course, branch, year, semester,
                    description, fileUrl, storagePath, courseId, courseTitle,
                    createdByName, createdByRole, createdAt, count);
        }
    }

    // ------------------------------------------------------------------ PYQ

    /**
     * {@code examYear} is the paper's year; the static frontend reads it as
     * {@code year}, which the API adapter adds client-side.
     */
    public record PyqRequest(
            @Size(max = 200) String title,

            @Size(max = 120) String subject,

            @Size(max = 60) String course,

            @Size(max = 40) String branch,

            Integer semester,

            Integer examYear,

            @Size(max = 600) String description,

            /** Required on create; optional on update (partial PUT). */
            @Size(max = 600)
            @Pattern(regexp = "^$|^https?://.*", message = "fileUrl must be an http(s) URL")
            String fileUrl,

            @Size(max = 300) String storagePath,

            Long courseId) {
    }

    public record PyqResponse(
            Long id,
            String title,
            String subject,
            String course,
            String branch,
            int semester,
            Integer examYear,
            String description,
            String fileUrl,
            String storagePath,
            Long courseId,
            String courseTitle,
            LocalDateTime createdAt) {
    }

    // ------------------------------------------------------------- TNP notes

    /**
     * {@code topic} is the subject-area label; the static admin form calls the
     * same value {@code subject}.
     */
    public record TnpNoteRequest(
            @Size(max = 200) String title,

            @Size(max = 120) String topic,

            @Size(max = 600) String description,

            /** Required on create; optional on update (partial PUT). */
            @Size(max = 600)
            @Pattern(regexp = "^$|^https?://.*", message = "fileUrl must be an http(s) URL")
            String fileUrl,

            @Size(max = 300) String storagePath,

            Long courseId,

            /** Optional ordered YouTube lectures (null on a partial update = keep). */
            List<VideoLinkRequest> videos) {
    }

    public record TnpNoteResponse(
            Long id,
            String title,
            String topic,
            String description,
            String fileUrl,
            String storagePath,
            Long courseId,
            String courseTitle,
            LocalDateTime createdAt,
            /** Number of related YouTube lectures (0 when none). */
            int videoCount) {

        /** Copy with the related-video count resolved for a list response. */
        public TnpNoteResponse withVideoCount(int count) {
            return new TnpNoteResponse(
                    id, title, topic, description, fileUrl, storagePath,
                    courseId, courseTitle, createdAt, count);
        }
    }

    // ------------------------------------------------------------- timetables

    public record TimetableRequest(
            @Size(max = 200) String title,

            @Size(max = 60) String course,

            Integer semester,

            /** Exam-session label, e.g. "Mid Sem", "End Sem". */
            @Size(max = 60) String examType,

            Integer examYear,

            @Size(max = 40) String dayOfWeek,

            LocalDate effectiveFrom,

            /** Required on create; optional on update (partial PUT). */
            @Size(max = 600)
            @Pattern(regexp = "^$|^https?://.*", message = "fileUrl must be an http(s) URL")
            String fileUrl,

            @Size(max = 300) String storagePath,

            @Size(max = 255) String fileName,

            Long courseId) {
    }

    public record TimetableResponse(
            Long id,
            String title,
            String course,
            int semester,
            String examType,
            Integer examYear,
            String dayOfWeek,
            LocalDate effectiveFrom,
            String fileUrl,
            String storagePath,
            String fileName,
            Long courseId,
            String courseTitle,
            LocalDateTime createdAt) {
    }

    // ---------------------------------------------------------------- syllabus

    /**
     * Syllabus upload. One active document is allowed per {@code course} +
     * {@code semester}; when an active row already exists the caller must send
     * {@code replaceExisting=true} to confirm the replacement.
     */
    public record SyllabusRequest(
            @Size(max = 200) String title,

            @Size(max = 60) String course,

            Integer semester,

            /** Required on create; optional on update (partial PUT). */
            @Size(max = 600)
            @Pattern(regexp = "^$|^https?://.*", message = "fileUrl must be an http(s) URL")
            String fileUrl,

            @Size(max = 300) String storagePath,

            @Size(max = 255) String fileName,

            Long courseId,

            /** Active / Inactive - defaults to Active. */
            @Size(max = 20) String status,

            /** true = replace the currently active syllabus for this course+semester. */
            Boolean replaceExisting) {
    }

    public record SyllabusResponse(
            Long id,
            String title,
            String course,
            int semester,
            String fileUrl,
            String storagePath,
            String fileName,
            Long courseId,
            String courseTitle,
            Long uploadedBy,
            String uploadedByName,
            String uploaderRole,
            String status,
            /** Original upload timestamp (audit + admin list "Uploaded on"). */
            LocalDateTime uploadDate,
            LocalDateTime updatedAt,
            LocalDateTime createdAt) {
    }

    // ------------------------------------------------------------ certificates

    public record CertificateRequest(
            @Size(max = 60) String certificateNo,

            @NotBlank(message = "title is required")
            @Size(max = 200) String title,

            Long userId,

            Long courseId,

            LocalDate issuedOn,

            @NotBlank(message = "fileUrl is required")
            @Size(max = 600)
            @Pattern(regexp = "^https?://.*", message = "fileUrl must be an http(s) URL")
            String fileUrl) {
    }

    public record CertificateResponse(
            Long id,
            String certificateNo,
            String title,
            Long userId,
            String userName,
            Long courseId,
            String courseTitle,
            LocalDate issuedOn,
            String fileUrl,
            LocalDateTime createdAt) {
    }

    // --------------------------------------------------------- certificate links

    /** One admin-managed certificate published as an external link. */
    public record CertificateLinkRequest(
            @Size(max = 200) String title,

            @Size(max = 600)
            @Pattern(regexp = "^https?://.*", message = "url must be an http(s) URL")
            String url,

            @Size(max = 600) String description,

            Integer sortOrder,

            Boolean isActive) {
    }

    public record CertificateLinkResponse(
            Long id,
            String title,
            String url,
            String description,
            int sortOrder,
            boolean isActive,
            LocalDateTime createdAt) {
    }

    // -------------------------------------------------------------- file upload

    /** Result of POST /api/admin/files - the URL that gets persisted. */
    public record FileUploadResponse(
            String url,
            String publicId,
            String originalName,
            long sizeBytes) {
    }
}
