package com.example.techcampushubbackend.repository;

import com.example.techcampushubbackend.entity.RelatedVideo;
import com.example.techcampushubbackend.entity.RelatedVideoType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RelatedVideoRepository extends JpaRepository<RelatedVideo, Long> {

    /*
     * The entity field is noteOrTnpId. A derived query name would split
     * "NoteOrTnpId" on the "Or" keyword and look for an entity property
     * called "note", so these two queries are written explicitly.
     */
    @Query("""
            select video
            from RelatedVideo video
            where video.contentType = :contentType
              and video.noteOrTnpId = :noteOrTnpId
            order by video.sortOrder asc, video.id asc
            """)
    List<RelatedVideo> findForContent(
            @Param("contentType") RelatedVideoType contentType,
            @Param("noteOrTnpId") Long noteOrTnpId);

    @Modifying
    @Query("""
            delete from RelatedVideo video
            where video.contentType = :contentType
              and video.noteOrTnpId = :noteOrTnpId
            """)
    void deleteForContent(
            @Param("contentType") RelatedVideoType contentType,
            @Param("noteOrTnpId") Long noteOrTnpId);

    /**
     * One row per parent record that has at least one video. Used by the list
     * endpoints so cards can show a "Related Videos" button without loading
     * the video rows themselves (one grouped query per list, no N+1).
     */
    @Query("""
            select video.noteOrTnpId as parentId, count(video) as total
            from RelatedVideo video
            where video.contentType = :contentType
            group by video.noteOrTnpId
            """)
    List<VideoCount> countForContentType(
            @Param("contentType") RelatedVideoType contentType);

    /** Projection for {@link #countForContentType(RelatedVideoType)}. */
    interface VideoCount {
        Long getParentId();

        long getTotal();
    }
}
