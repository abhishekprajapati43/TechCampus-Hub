package com.example.techcampushubbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * A YouTube lecture linked to exactly one Notes or TNP record.
 *
 * <p>The relation is intentionally a soft reference (content type + id) rather
 * than two nullable foreign keys: both Notes and TNP share the same video
 * shape, and the table keeps the {@code note_or_tnp_id} column requested by the
 * feature specification. Rows are deleted together with their parent record by
 * the content services, so no orphaned videos survive a delete.</p>
 */
@Entity
@Table(name = "related_videos", indexes = {
        @Index(name = "idx_related_videos_parent",
                columnList = "content_type,note_or_tnp_id")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RelatedVideo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "content_type", nullable = false, length = 20)
    private RelatedVideoType contentType;

    @Column(name = "note_or_tnp_id", nullable = false)
    private Long noteOrTnpId;

    @Column(name = "video_title", nullable = false, length = 200)
    private String videoTitle;

    @Column(name = "youtube_url", nullable = false, length = 600)
    private String youtubeUrl;

    /** users.id of the admin/faculty member who saved the link (soft reference). */
    @Column(name = "uploaded_by")
    private Long uploadedBy;

    /** Zero-based display order inside the parent's list. */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
