package com.example.techcampushubbackend.utils;

import com.example.techcampushubbackend.exception.BadRequestException;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Strict YouTube link validation and canonicalisation.
 *
 * <p>Only secure https links on YouTube's own hosts are accepted. A link is
 * rebuilt from a validated video id rather than stored verbatim, which strips
 * tracking parameters, fragments and any injected markup/script payloads
 * before the value reaches the database or a student's browser.</p>
 */
public final class YouTubeUrlUtils {

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "www.youtube.com",
            "youtube.com",
            "m.youtube.com",
            "youtu.be"
    );

    /** YouTube ids are 11 characters today; allow a small safety range. */
    private static final Pattern VIDEO_ID = Pattern.compile("[A-Za-z0-9_-]{6,64}");

    private static final String CANONICAL_WATCH = "https://www.youtube.com/watch?v=";

    private YouTubeUrlUtils() {
    }

    /**
     * @return a canonical {@code https://www.youtube.com/watch?v=...} URL
     * @throws BadRequestException when the value is not a supported YouTube video link
     */
    public static String sanitize(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new BadRequestException("YouTube video URL is required");
        }

        String value = rawUrl.trim();
        if (value.length() > 600) {
            throw new BadRequestException("YouTube video URL is too long");
        }

        // Reject control characters, whitespace and other header/script tricks.
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c <= 0x1f || c == 0x7f || Character.isWhitespace(c)) {
                throw invalid();
            }
        }

        URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException ex) {
            throw invalid();
        }

        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null) {
            throw invalid();
        }

        String host = uri.getHost();
        if (host == null) {
            throw invalid();
        }
        host = host.toLowerCase(Locale.ROOT);
        if (!ALLOWED_HOSTS.contains(host)) {
            throw invalid();
        }

        String path = uri.getPath() == null ? "" : uri.getPath();

        if ("youtu.be".equals(host)) {
            String id = path.startsWith("/") ? path.substring(1) : path;
            return watch(id);
        }

        if ("/watch".equals(path)) {
            return watch(queryParam(uri.getRawQuery(), "v"));
        }

        for (String prefix : new String[]{"/shorts/", "/embed/", "/live/", "/v/"}) {
            if (path.startsWith(prefix)) {
                String id = path.substring(prefix.length());
                if (id.contains("/")) {
                    throw invalid();
                }
                return watch(id);
            }
        }

        // Short links such as https://youtube.com/VIDEO_ID are not official
        // YouTube URLs, and playlists/channels are not single videos.
        throw invalid();
    }

    private static String watch(String id) {
        if (id == null || !VIDEO_ID.matcher(id).matches()) {
            throw invalid();
        }
        return CANONICAL_WATCH + id;
    }

    private static String queryParam(String rawQuery, String name) {
        if (rawQuery == null || rawQuery.isBlank()) {
            return null;
        }
        for (String pair : rawQuery.split("&")) {
            int equals = pair.indexOf('=');
            if (equals <= 0) {
                continue;
            }
            if (name.equals(pair.substring(0, equals))) {
                try {
                    return URLDecoder.decode(pair.substring(equals + 1), StandardCharsets.UTF_8);
                } catch (IllegalArgumentException ex) {
                    throw invalid();
                }
            }
        }
        return null;
    }

    private static BadRequestException invalid() {
        return new BadRequestException(
                "Please provide a valid YouTube URL (https://www.youtube.com/... or https://youtu.be/...)");
    }
}
