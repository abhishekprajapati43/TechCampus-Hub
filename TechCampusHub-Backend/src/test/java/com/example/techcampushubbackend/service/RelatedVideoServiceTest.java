package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkRequest;
import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkResponse;
import com.example.techcampushubbackend.entity.RelatedVideoType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Transactional
class RelatedVideoServiceTest {

    @Autowired
    private RelatedVideoService relatedVideoService;

    @Test
    void replacesKeepsOrderAndClearsTheVideoList() {
        long noteId = 987_654_321L;

        relatedVideoService.replace(
                RelatedVideoType.NOTE,
                noteId,
                List.of(
                        new VideoLinkRequest(
                                "Second lecture",
                                "https://youtu.be/dQw4w9WgXcQ"),
                        new VideoLinkRequest(
                                "First lecture",
                                "https://www.youtube.com/watch?v=aaaaaaaaaaa&t=5")),
                42L);

        List<VideoLinkResponse> stored = relatedVideoService.list(
                RelatedVideoType.NOTE, noteId);

        assertEquals(2, stored.size());
        assertEquals("Second lecture", stored.get(0).videoTitle());
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                stored.get(0).youtubeUrl());
        assertEquals(0, stored.get(0).sortOrder());
        assertEquals(1, stored.get(1).sortOrder());
        assertEquals(42L, stored.get(0).uploadedBy());

        // The grouped list count mirrors the rows without loading the videos.
        assertEquals(2, relatedVideoService.counts(RelatedVideoType.NOTE).get(noteId));

        // A null list is a partial update: the stored videos stay untouched.
        relatedVideoService.replace(
                RelatedVideoType.NOTE, noteId, null, 42L);
        assertEquals(2, relatedVideoService.list(
                RelatedVideoType.NOTE, noteId).size());

        // An empty list explicitly clears everything.
        relatedVideoService.replace(
                RelatedVideoType.NOTE, noteId, List.of(), 42L);
        assertTrue(relatedVideoService.list(
                RelatedVideoType.NOTE, noteId).isEmpty());
        assertNull(relatedVideoService.counts(RelatedVideoType.NOTE).get(noteId));
    }
}
