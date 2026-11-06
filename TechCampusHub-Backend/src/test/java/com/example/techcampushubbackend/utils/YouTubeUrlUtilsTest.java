package com.example.techcampushubbackend.utils;

import com.example.techcampushubbackend.exception.BadRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class YouTubeUrlUtilsTest {

    @Test
    void canonicalisesWatchLinkAndDropsTrackingParameters() {
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                YouTubeUrlUtils.sanitize(
                        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=tracking"));
    }

    @Test
    void canonicalisesShortLink() {
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                YouTubeUrlUtils.sanitize("https://youtu.be/dQw4w9WgXcQ?t=10"));
    }

    @Test
    void canonicalisesShortsAndEmbedLinks() {
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                YouTubeUrlUtils.sanitize(
                        "https://www.youtube.com/shorts/dQw4w9WgXcQ"));
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                YouTubeUrlUtils.sanitize(
                        "https://www.youtube.com/embed/dQw4w9WgXcQ"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "",
            "   ",
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://example.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
            "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/playlist?list=PL123",
            "https://www.youtube.com/channel/abc",
            "https://youtu.be/",
            "https://www.youtube.com/watch?v=bad id",
            "javascript:alert(1)",
            "https://www.youtube.com/watch?v=<script>"
    })
    void rejectsEverythingThatIsNotASingleHttpsYouTubeVideo(String value) {
        assertThrows(
                BadRequestException.class,
                () -> YouTubeUrlUtils.sanitize(value));
    }
}
