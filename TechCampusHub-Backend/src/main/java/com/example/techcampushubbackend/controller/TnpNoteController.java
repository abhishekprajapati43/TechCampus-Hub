package com.example.techcampushubbackend.controller;

import com.example.techcampushubbackend.dto.ApiResponse;
import com.example.techcampushubbackend.dto.ContentDtos.TnpNoteRequest;
import com.example.techcampushubbackend.dto.ContentDtos.TnpNoteResponse;
import com.example.techcampushubbackend.dto.ContentDtos.VideoLinkResponse;
import com.example.techcampushubbackend.service.ContentStreamService;
import com.example.techcampushubbackend.service.TnpNoteService;
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

/** Training &amp; placement notes: student reading + admin CRUD. */
@Tag(name = "TNP Notes", description = "Training & placement notes")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class TnpNoteController {

    private final TnpNoteService tnpNoteService;
    private final ContentStreamService contentStreamService;

    @Operation(summary = "List visible TNP notes (student)")
    @GetMapping("/tnp-notes")
    public ResponseEntity<ApiResponse<List<TnpNoteResponse>>> list() {
        return ResponseEntity.ok(ApiResponse.ok(tnpNoteService.listVisible()));
    }

    @Operation(summary = "Get one TNP note (student)")
    @GetMapping("/tnp-notes/{id}")
    public ResponseEntity<ApiResponse<TnpNoteResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(tnpNoteService.getVisible(id)));
    }

    @Operation(summary = "List related YouTube videos for one TNP note (student)",
            description = "Loaded only when the note's viewer opens; guarded by the "
                    + "same purchase access checks as the note itself.")
    @GetMapping("/tnp-notes/{id}/videos")
    public ResponseEntity<ApiResponse<List<VideoLinkResponse>>> videos(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(tnpNoteService.listVisibleVideos(id)));
    }

    @Operation(summary = "Download TNP note PDF (streams through the backend)",
            description = "Bytes are relayed server-side under the same visibility "
                    + "check as reading the note - the storage URL is never exposed.")
    @GetMapping("/tnp-notes/{id}/download")
    public void download(@PathVariable Long id, HttpServletResponse response) {
        contentStreamService.stream(tnpNoteService.requireVisibleFileUrl(id), response);
    }

    @Operation(summary = "List all TNP notes (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/tnp-notes")
    public ResponseEntity<ApiResponse<List<TnpNoteResponse>>> listAll() {
        return ResponseEntity.ok(ApiResponse.ok(tnpNoteService.listAll()));
    }

    @Operation(summary = "Create TNP note (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/tnp-notes")
    public ResponseEntity<ApiResponse<TnpNoteResponse>> create(
            @Valid @RequestBody TnpNoteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(tnpNoteService.create(request)));
    }

    @Operation(summary = "Update TNP note (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/admin/tnp-notes/{id}")
    public ResponseEntity<ApiResponse<TnpNoteResponse>> update(
            @PathVariable Long id, @Valid @RequestBody TnpNoteRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(tnpNoteService.update(id, request)));
    }

    @Operation(summary = "Delete TNP note (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/tnp-notes/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        tnpNoteService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("TNP note deleted", null));
    }
}
