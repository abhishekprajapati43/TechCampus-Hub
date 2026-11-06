package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkRequest;
import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkResponse;
import com.example.techcampushubbackend.entity.RelatedVideo;
import com.example.techcampushubbackend.entity.RelatedVideoType;
import com.example.techcampushubbackend.exception.BadRequestException;
import com.example.techcampushubbackend.repository.RelatedVideoRepository;
import com.example.techcampushubbackend.utils.YouTubeUrlUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Persistence for the YouTube lectures attached to Notes and TNP records.
 *
 * <p>Videos are only ever read through the per-record endpoint
 * ({@code GET /api/notes/{id}/videos} / {@code /api/tnp-notes/{id}/videos}),
 * so the list pages never carry video payloads.</p>
 */
@Service
@RequiredArgsConstructor
public class RelatedVideoService {

    public static final int MAX_VIDEOS = 10;

    private final RelatedVideoRepository relatedVideoRepository;

    @Transactional(readOnly = true)
    public List<VideoLinkResponse> list(RelatedVideoType contentType, Long noteOrTnpId) {
        return relatedVideoRepository
                .findForContent(contentType, noteOrTnpId)
                .stream()
                .map(RelatedVideoService::toResponse)
                .toList();
    }

    /**
     * Number of videos per parent record, resolved with one grouped query.
     * Used only to decide whether a card shows its "Related Videos" button;
     * the actual video rows are fetched on demand when that button is clicked.
     */
    @Transactional(readOnly = true)
    public Map<Long, Integer> counts(RelatedVideoType contentType) {
        Map<Long, Integer> counts = new HashMap<>();
        relatedVideoRepository.countForContentType(contentType)
                .forEach(row -> counts.put(row.getParentId(), (int) row.getTotal()));
        return counts;
    }

    /**
     * Replaces the complete ordered list when the caller supplied a list.
     * A {@code null} list means "leave the existing videos untouched" (partial
     * PUT); an empty list explicitly removes every link.
     */
    @Transactional
    public void replace(RelatedVideoType contentType,
                        Long noteOrTnpId,
                        List<VideoLinkRequest> videos,
                        Long uploadedBy) {
        if (videos == null) {
            return;
        }
        if (videos.size() > MAX_VIDEOS) {
            throw new BadRequestException(
                    "You can add at most " + MAX_VIDEOS + " video links per upload");
        }

        // Validate and build everything first so a bad link can never wipe the
        // existing list halfway through an update.
        List<RelatedVideo> replacements = new ArrayList<>();
        int sortOrder = 0;
        for (VideoLinkRequest video : videos) {
            if (video == null) {
                continue;
            }
            String title = video.videoTitle() == null ? "" : video.videoTitle().trim();
            String url = video.youtubeUrl() == null ? "" : video.youtubeUrl().trim();

            if (title.isBlank() && url.isBlank()) {
                continue; // untouched blank row from the add-link form
            }
            if (title.isBlank()) {
                throw new BadRequestException("Video title is required for each video link");
            }
            if (title.length() > 200) {
                throw new BadRequestException("Video title must be 200 characters or fewer");
            }

            replacements.add(RelatedVideo.builder()
                    .contentType(contentType)
                    .noteOrTnpId(noteOrTnpId)
                    .videoTitle(title)
                    .youtubeUrl(YouTubeUrlUtils.sanitize(url))
                    .uploadedBy(uploadedBy)
                    .sortOrder(sortOrder++)
                    .createdAt(LocalDateTime.now())
                    .build());
        }

        relatedVideoRepository.deleteForContent(contentType, noteOrTnpId);
        if (!replacements.isEmpty()) {
            relatedVideoRepository.saveAll(replacements);
        }
    }

    @Transactional
    public void deleteAll(RelatedVideoType contentType, Long noteOrTnpId) {
        relatedVideoRepository.deleteForContent(contentType, noteOrTnpId);
    }

    private static VideoLinkResponse toResponse(RelatedVideo video) {
        return new VideoLinkResponse(
                video.getId(),
                video.getNoteOrTnpId(),
                video.getVideoTitle(),
                video.getYoutubeUrl(),
                video.getUploadedBy(),
                video.getSortOrder(),
                video.getCreatedAt());
    }
}
