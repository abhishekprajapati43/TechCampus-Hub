package com.example.techcampushubbackend.controller;

import com.example.techcampushubbackend.dto.ApiResponse;
import com.example.techcampushubbackend.dto.ContentDtos.SyllabusRequest;
import com.example.techcampushubbackend.dto.ContentDtos.SyllabusResponse;
import com.example.techcampushubbackend.service.ContentStreamService;
import com.example.techcampushubbackend.service.SyllabusService;
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
 * Syllabus: students read the active document of their course/semester;
 * admins upload, replace, edit and delete every row. Student payloads carry
 * no storage URL - bytes stream through the secure {@code /api/content/**}
 * relay instead.
 */
@Tag(name = "Syllabus", description = "Course syllabus - student reading and admin CRUD")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SyllabusController {

    private final SyllabusService syllabusService;
    private final ContentStreamService contentStreamService;

    @Operation(summary = "List visible syllabus documents (student)")
    @GetMapping("/syllabus")
    public ResponseEntity<ApiResponse<List<SyllabusResponse>>> list() {
        return ResponseEntity.ok(ApiResponse.ok(syllabusService.listVisible()));
    }

    @Operation(summary = "Get one syllabus document (student)")
    @GetMapping("/syllabus/{id}")
    public ResponseEntity<ApiResponse<SyllabusResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(syllabusService.getVisible(id)));
    }

    @Operation(summary = "Download syllabus PDF (streams through the backend)",
            description = "Bytes are relayed server-side under the same visibility "
                    + "check as reading the syllabus - the storage URL is never exposed.")
    @GetMapping("/syllabus/{id}/download")
    public void download(@PathVariable Long id, HttpServletResponse response) {
        contentStreamService.stream(syllabusService.requireVisibleFileUrl(id), response);
    }

    // ------------------------------------------------------------------ admin

    @Operation(summary = "List all syllabus documents including inactive history (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/syllabus")
    public ResponseEntity<ApiResponse<List<SyllabusResponse>>> listAll() {
        return ResponseEntity.ok(ApiResponse.ok(syllabusService.listAll()));
    }

    @Operation(summary = "Upload a syllabus (admin)",
            description = "Sending replaceExisting=true replaces the active syllabus "
                    + "of the same course + semester; the previous row becomes Inactive.")
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/syllabus")
    public ResponseEntity<ApiResponse<SyllabusResponse>> create(
            @Valid @RequestBody SyllabusRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(syllabusService.create(request)));
    }

    @Operation(summary = "Update / replace a syllabus PDF (admin)")
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/admin/syllabus/{id}")
    public ResponseEntity<ApiResponse<SyllabusResponse>> update(
            @PathVariable Long id, @Valid @RequestBody SyllabusRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(syllabusService.update(id, request)));
    }

    @Operation(summary = "Delete a syllabus (admin)",
            description = "Removes the row permanently. Prefer setting status=Inactive "
                    + "to keep upload history.")
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/admin/syllabus/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        syllabusService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Syllabus deleted", null));
    }
}
