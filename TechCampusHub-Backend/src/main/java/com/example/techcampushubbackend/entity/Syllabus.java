package com.example.techcampushubbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Course syllabus PDF, one active document per program + semester.
 *
 * <p>Replacing a syllabus marks the previous row {@link #STATUS_INACTIVE}
 * instead of deleting it, so upload history and status stay auditable.
 */
@Entity
@Table(name = "syllabus")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Syllabus extends Auditable {

    public static final String STATUS_ACTIVE = "Active";
    public static final String STATUS_INACTIVE = "Inactive";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    /** Program label, e.g. "MCA", "B.Tech", "BCA". */
    @Column(length = 60)
    private String course;

    @Column(nullable = false)
    private int semester;

    /** Cloudinary PDF URL. */
    @Column(name = "file_url", nullable = false, length = 600)
    private String fileUrl;

    /** Cloudinary public id of the same asset, kept so it can be deleted. */
    @Column(name = "storage_path", length = 300)
    private String storagePath;

    /** Original upload file name, shown in the admin list. */
    @Column(name = "file_name", length = 255)
    private String fileName;

    /** Active / Inactive - at most one Active row per course + semester. */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = STATUS_ACTIVE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course courseBundle;

    /**
     * users.id of the faculty/admin uploader (soft ref, no FK - mirrors notes).
     * NULL for content created through the legacy admin path.
     */
    @Column(name = "created_by")
    private Long createdBy;

    /** Role of the uploader at upload time: ADMIN or FACULTY. */
    @Column(name = "uploader_role", length = 20)
    private String uploaderRole;

    public boolean isActive() {
        return STATUS_ACTIVE.equalsIgnoreCase(status);
    }
}
