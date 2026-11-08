package com.example.techcampushubbackend.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Public homepage previews. These payloads deliberately carry metadata only:
 * the storage URL, storage path and any bundle-only description never leave
 * the server, so a logged-out visitor can browse titles and programs without
 * receiving a direct link to a document.
 */
public final class HomeResourceDtos {

    private HomeResourceDtos() {
    }

    /**
     * One preview card. {@code description} is null for bundle-gated content
     * (paid-only details stay private); {@code locked} tells the UI that the
     * document requires a purchase on top of login.
     */
    public record HomeResourcePreview(
            Long id,
            String category,
            String title,
            String course,
            Integer semester,
            String subject,
            String description,
            LocalDateTime uploadDate,
            boolean locked) {
    }

    /** The latest previews for each homepage section. */
    public record HomeResourcesResponse(
            List<HomeResourcePreview> notes,
            List<HomeResourcePreview> pyq,
            List<HomeResourcePreview> tnp,
            List<HomeResourcePreview> syllabus) {
    }
}
