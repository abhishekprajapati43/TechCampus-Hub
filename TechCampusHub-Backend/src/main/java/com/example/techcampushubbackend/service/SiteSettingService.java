package com.example.techcampushubbackend.service;

import com.example.techcampushubbackend.dto.SiteSettingDtos.SiteSettingRequest;
import com.example.techcampushubbackend.dto.SiteSettingDtos.SiteSettingResponse;
import com.example.techcampushubbackend.entity.SiteSetting;
import com.example.techcampushubbackend.exception.BadRequestException;
import com.example.techcampushubbackend.repository.SiteSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Global site settings (UPI payee, chatbot link, Telegram invite) held as a
 * single lazily-created row. Reading never fails: a missing row returns the
 * built-in defaults so the storefront works before an admin has saved anything.
 */
@Service
@RequiredArgsConstructor
public class SiteSettingService {

    /** Values used until an admin saves a real one. */
    public static final String DEFAULT_UPI_ID = "abhishekprajapati8115@okicici";
    public static final String DEFAULT_GEMINI_URL = "https://gemini.google.com";
    public static final String DEFAULT_TELEGRAM_LINK = "https://t.me/TechCampus_Hub";

    private final SiteSettingRepository siteSettingRepository;

    @Transactional
    public SiteSettingResponse get() {
        return toResponse(findOrCreate());
    }

    @Transactional
    public SiteSettingResponse update(SiteSettingRequest request) {
        if (request.upiId() == null && request.geminiUrl() == null && request.telegramLink() == null) {
            throw new BadRequestException("Provide at least one setting to update");
        }

        SiteSetting setting = findOrCreate();
        if (request.upiId() != null) {
            setting.setUpiId(requireHttpUrl("upiId", request.upiId(), false));
        }
        if (request.geminiUrl() != null) {
            setting.setGeminiUrl(requireHttpUrl("geminiUrl", request.geminiUrl(), true));
        }
        if (request.telegramLink() != null) {
            setting.setTelegramLink(requireHttpUrl("telegramLink", request.telegramLink(), true));
        }
        return toResponse(siteSettingRepository.save(setting));
    }

    private SiteSetting findOrCreate() {
        return siteSettingRepository.findById(SiteSetting.SINGLETON_ID)
                .orElseGet(() -> siteSettingRepository.save(SiteSetting.builder()
                        .id(SiteSetting.SINGLETON_ID)
                        .upiId(DEFAULT_UPI_ID)
                        .geminiUrl(DEFAULT_GEMINI_URL)
                        .telegramLink(DEFAULT_TELEGRAM_LINK)
                        .build()));
    }

    /** UPI ids are VPAs (not URLs) so they skip the scheme check. */
    private static String requireHttpUrl(String field, String value, boolean httpOnly) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new BadRequestException(field + " cannot be empty");
        }
        if (trimmed.length() > 400) {
            throw new BadRequestException(field + " must be at most 400 characters");
        }
        if (httpOnly && !trimmed.matches("(?i)^https?://.+")) {
            throw new BadRequestException(field + " must start with http:// or https://");
        }
        return trimmed;
    }

    public static SiteSettingResponse toResponse(SiteSetting setting) {
        return new SiteSettingResponse(
                setting.getId(),
                setting.getUpiId() == null ? DEFAULT_UPI_ID : setting.getUpiId(),
                setting.getGeminiUrl() == null ? DEFAULT_GEMINI_URL : setting.getGeminiUrl(),
                setting.getTelegramLink() == null ? DEFAULT_TELEGRAM_LINK : setting.getTelegramLink(),
                setting.getUpdatedAt() == null ? setting.getCreatedAt() : setting.getUpdatedAt());
    }
}
