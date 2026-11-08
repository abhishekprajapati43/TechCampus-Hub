package com.example.techcampushubbackend.controller;

import com.example.techcampushubbackend.dto.ApiResponse;
import com.example.techcampushubbackend.dto.HomeResourceDtos.HomeResourcesResponse;
import com.example.techcampushubbackend.service.HomeResourceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public homepage previews: metadata-only cards for the newest Notes, PYQs,
 * TNP resources and Syllabus. Document bytes always stay behind the
 * authenticated viewer relay.
 */
@Tag(name = "Home Resources", description = "Public metadata previews for the homepage")
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class HomeResourceController {

    private final HomeResourceService homeResourceService;

    @Operation(summary = "Latest resource previews per homepage section (public)")
    @GetMapping("/resources")
    public ResponseEntity<ApiResponse<HomeResourcesResponse>> latest(
            @RequestParam(defaultValue = "4") int limit) {
        return ResponseEntity.ok(ApiResponse.ok(homeResourceService.latest(limit)));
    }
}
