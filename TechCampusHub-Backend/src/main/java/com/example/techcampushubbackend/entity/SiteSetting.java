package com.example.techcampushubbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Global site settings held as a single row (id = 1). Mirrors the
 * {@code site_settings} table the static frontend used to read from Supabase:
 * the UPI payee id, the AI chatbot link and the Telegram community link.
 */
@Entity
@Table(name = "site_settings")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SiteSetting extends Auditable {

    /** Only ever one row; the id is assigned (not generated) so it is always 1. */
    public static final long SINGLETON_ID = 1L;

    /** Assigned id: a singleton row that is inserted with an explicit id = 1. */
    @Id
    private Long id;

    /** VPA shown in the UPI payment modal, e.g. abhishekprajapati8115@okicici. */
    @Column(name = "upi_id", length = 120)
    private String upiId;

    /** Link the "Open Gemini" dashboard button opens. */
    @Column(name = "gemini_url", length = 400)
    private String geminiUrl;

    /** Telegram community invite link. */
    @Column(name = "telegram_link", length = 400)
    private String telegramLink;
}
