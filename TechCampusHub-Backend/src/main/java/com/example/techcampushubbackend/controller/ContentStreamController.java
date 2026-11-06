package com.example.techcampushubbackend.controller;

import com.example.techcampushubbackend.exception.ResourceNotFoundException;
import com.example.techcampushubbackend.service.ContentStreamService;
import com.example.techcampushubbackend.service.NoteService;
import com.example.techcampushubbackend.service.PyqService;
import com.example.techcampushubbackend.service.SyllabusService;
import com.example.techcampushubbackend.service.TimetableService;
import com.example.techcampushubbackend.service.TnpNoteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Secure PDF streaming for the in-app viewer.
 *
 * <p>Authentication: {@code /api/content/**} falls under
 * {@code anyRequest().authenticated()} in SecurityConfig and the JWT travels
 * in the {@code Authorization} header, so opening this URL directly in a
 * browser tab or iframe (no header) gets a 401 - the endpoint cannot be used
 * as a shareable direct link.
 *
 * <p>Authorization: each category delegates to its owning service's
 * visibility check, which for bundle-linked (paid) content requires an
 * approved, unexpired purchase - the exact same rule as the list endpoints.
 * The storage URL is resolved server-side and relayed as bytes; it is never
 * serialized into a response body.
 */
@Tag(name = "Content streaming",
        description = "Authenticated, purchase-checked PDF relay for the in-app viewer")
@RestController
@RequestMapping("/api/content")
@RequiredArgsConstructor
public class ContentStreamController {

    private final NoteService noteService;
    private final PyqService pyqService;
    private final TnpNoteService tnpNoteService;
    private final TimetableService timetableService;
    private final SyllabusService syllabusService;
    private final ContentStreamService contentStreamService;

    @Operation(summary = "Stream a PDF through the backend (auth + subscription checked)",
            description = "Relays the file bytes with no-store headers. The underlying "
                    + "storage URL is never exposed to the client.")
    @GetMapping("/{category}/{id}/pdf")
    public void stream(@PathVariable String category, @PathVariable Long id,
                       HttpServletResponse response) {
        String sourceUrl = switch (category) {
            case "notes" -> noteService.requireVisibleFileUrl(id);
            case "pyqs" -> pyqService.requireVisibleFileUrl(id);
            case "tnp-notes" -> tnpNoteService.requireVisibleFileUrl(id);
            case "timetables" -> timetableService.requireVisibleFileUrl(id);
            case "syllabus" -> syllabusService.requireVisibleFileUrl(id);
            default -> throw new ResourceNotFoundException("Content category", category);
        };
        contentStreamService.stream(sourceUrl, response);
    }
}
