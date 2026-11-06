package com.example.techcampushubbackend.controller;

import com.example.techcampushubbackend.dto.ApiResponse;
import com.example.techcampushubbackend.dto.ContentDtos.NoteRequest;
import com.example.techcampushubbackend.dto.ContentDtos.NoteResponse;
import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkResponse;
import com.example.techcampushubbackend.service.ContentStreamService;
import com.example.techcampushubbackend.service.NoteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Notes: students read (bundle-gated), admins manage. Student payloads carry
 * no storage URL - document bytes stream through the secure
 * {@code /api/content/**} relay (or {@code /download}) instead.
 */
@Tag(name = "Notes", description = "Course notes - student reading and admin CRUD")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class NoteController {

    private final NoteService noteService;
    private final ContentStreamService contentStreamService;

    @Operation(summary = "List visible notes (student)")
    @GetMapping("/notes")
    public ResponseEntity<ApiResponse<List<NoteResponse>>> list() {
        return ResponseEntity.ok(ApiResponse.ok(noteService.listVisible()));
    }

    @Operation(summary = "Get one note (student, purchase-gated when bundle-linked)")
    @GetMapping("/notes/{id}")
    public ResponseEntity<ApiResponse<NoteResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.getVisible(id)));
    }

    @Operation(summary = "List related YouTube videos for one note (student)",
            description = "Loaded only when the note's viewer opens; guarded by the "
                    + "same purchase/program access checks as the note itself.")
    @GetMapping("/notes/{id}/videos")
    public ResponseEntity<ApiResponse<List<VideoLinkResponse>>> videos(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.listVisibleVideos(id)));
    }

    @Operation(summary = "Download note PDF (streams through the backend)",
            description = "Bytes are relayed server-side under the same visibility "
                    + "check as reading the note - the storage URL is never exposed.")
    @GetMapping("/notes/{id}/download")
    public void download(@PathVariable Long id, HttpServletResponse response) {
        contentStreamService.stream(noteService.requireVisibleFileUrl(id), response);
    }

    // ------------------------------------------------------------------ admin

    @Operation(summary = "List all notes (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/notes")
    public ResponseEntity<ApiResponse<List<NoteResponse>>> listAll() {
        return ResponseEntity.ok(ApiResponse.ok(noteService.listAll()));
    }

    @Operation(summary = "Create note (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/notes")
    public ResponseEntity<ApiResponse<NoteResponse>> create(
            @Valid @RequestBody NoteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(noteService.create(request)));
    }

    @Operation(summary = "Update note (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/admin/notes/{id}")
    public ResponseEntity<ApiResponse<NoteResponse>> update(
            @PathVariable Long id, @Valid @RequestBody NoteRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.update(id, request)));
    }

    @Operation(summary = "Delete note (admin)",
            description = "Faculty deletion is intentionally forbidden: enforced by the "
                    + "ADMIN-only @PreAuthorize here AND the /api/admin/** matcher in "
                    + "SecurityConfig (two layers). No /api/faculty delete route exists.")
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/notes/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        noteService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Note deleted", null));
    }
}
