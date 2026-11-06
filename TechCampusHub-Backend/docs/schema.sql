-- =====================================================================
-- TechCampus Hub - PostgreSQL schema
-- Database: techcampushub_db
-- The application also auto-creates/updates these tables via JPA
-- (spring.jpa.hibernate.ddl-auto=update). This script is the reference
-- DDL for production environments where ddl-auto is set to "validate".
-- =====================================================================

CREATE DATABASE techcampushub_db;
\c techcampushub_db;

-- ---------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                    BIGSERIAL PRIMARY KEY,
    name                  VARCHAR(120)  NOT NULL,
    email                 VARCHAR(190)  NOT NULL UNIQUE,
    password              VARCHAR(255)  NOT NULL,          -- BCrypt hash
    phone                 VARCHAR(20),
    role                  VARCHAR(20)   NOT NULL CHECK (role IN ('ADMIN', 'FACULTY', 'STUDENT')),
    aadhaar_number        VARCHAR(64),                     -- SHA-256 hash of the 12-digit Aadhaar (never exposed)
    address               TEXT,                            -- faculty postal address
    gender                VARCHAR(20),                     -- optional, shown on profile pages
    enrollment_number     VARCHAR(40),                     -- student roll / enrollment number
    department            VARCHAR(120),                    -- faculty home department
    qualification         VARCHAR(120),                    -- faculty highest qualification
    experience            VARCHAR(60),                     -- faculty teaching/industry experience
    course                VARCHAR(60),                     -- student academic profile (e.g. MCA)
    branch                VARCHAR(60),                     -- student branch/specialisation
    "year"                INTEGER,                         -- quoted: YEAR is reserved
    semester              INTEGER,
    declaration_accepted  BOOLEAN       NOT NULL DEFAULT FALSE,
    registration_status   VARCHAR(20)   NOT NULL DEFAULT 'APPROVED'
                          CHECK (registration_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    email_verified        BOOLEAN       NOT NULL DEFAULT FALSE,
    verification_token    VARCHAR(64),
    reset_token           VARCHAR(64),
    reset_token_expires_at TIMESTAMP,
    enabled               BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ---------------------------------------------------------------------
-- 2. courses
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id             BIGSERIAL PRIMARY KEY,
    title          VARCHAR(160)   NOT NULL,
    code           VARCHAR(40),
    category       VARCHAR(60),
    description    TEXT,
    price_inr      NUMERIC(10,2)  NOT NULL DEFAULT 0,
    mrp_inr        NUMERIC(10,2),                          -- discount anchor; NULL = no discount shown
    thumbnail_url  VARCHAR(600),                          -- Cloudinary URL
    validity_days  INTEGER        NOT NULL DEFAULT 365,
    is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
    created_by     BIGINT,                                -- users.id (soft ref: faculty/admin uploader)
    created_at     TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 3. purchases
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT        NOT NULL REFERENCES users (id)   ON DELETE CASCADE,
    course_id        BIGINT        NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    amount_inr       NUMERIC(10,2) NOT NULL,
    utr              VARCHAR(64)   NOT NULL,             -- UPI transaction ref
    status           VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    valid_from       TIMESTAMP,
    valid_until      TIMESTAMP,
    reviewed_at      TIMESTAMP,
    reviewed_by      BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    rejection_reason VARCHAR(300),
    created_at       TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchases_user   ON purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_active ON purchases (user_id, course_id, status, valid_until);

-- ---------------------------------------------------------------------
-- 4. notes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(200)  NOT NULL,
    subject     VARCHAR(120),
    course      VARCHAR(60),
    branch      VARCHAR(40),
    "year"      INTEGER,
    semester    INTEGER       NOT NULL DEFAULT 0,
    description VARCHAR(600),
    file_url    VARCHAR(600)  NOT NULL,                  -- Cloudinary URL
    storage_path VARCHAR(300),                           -- Cloudinary public id (for deletion)
    course_id   BIGINT        REFERENCES courses (id) ON DELETE SET NULL,
    created_by  BIGINT,                                  -- users.id (soft ref: faculty/admin uploader)
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notes_course ON notes (course_id);

-- ---------------------------------------------------------------------
-- 5. pyqs (previous year question papers)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pyqs (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(200)  NOT NULL,
    subject     VARCHAR(120),
    course      VARCHAR(60),
    branch      VARCHAR(40),
    semester    INTEGER       NOT NULL DEFAULT 0,
    exam_year   INTEGER,
    description VARCHAR(600),
    file_url    VARCHAR(600)  NOT NULL,                  -- Cloudinary URL
    storage_path VARCHAR(300),                           -- Cloudinary public id (for deletion)
    course_id   BIGINT        REFERENCES courses (id) ON DELETE SET NULL,
    created_by  BIGINT,                                  -- users.id (soft ref: faculty/admin uploader)
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pyqs_course ON pyqs (course_id);

-- ---------------------------------------------------------------------
-- 6. tnp_notes (training & placement)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tnp_notes (
    id          BIGSERIAL PRIMARY KEY,
    title       VARCHAR(200)  NOT NULL,
    topic       VARCHAR(120),
    description VARCHAR(600),
    file_url    VARCHAR(600)  NOT NULL,                  -- Cloudinary URL
    storage_path VARCHAR(300),                           -- Cloudinary public id (for deletion)
    course_id   BIGINT        REFERENCES courses (id) ON DELETE SET NULL,
    created_by  BIGINT,                                  -- users.id (soft ref: faculty/admin uploader)
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 7. timetables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timetables (
    id             BIGSERIAL PRIMARY KEY,
    title          VARCHAR(200) NOT NULL,
    course         VARCHAR(60),
    semester       INTEGER      NOT NULL DEFAULT 0,
    exam_type      VARCHAR(60),                          -- e.g. "Mid Sem", "End Sem"
    exam_year      INTEGER,                              -- exam-session year, e.g. 2026
    day_of_week    VARCHAR(40),
    effective_from DATE,
    file_url       VARCHAR(600) NOT NULL,                -- Cloudinary URL
    storage_path   VARCHAR(300),                         -- Cloudinary public id (for deletion)
    file_name      VARCHAR(255),                         -- original upload file name
    course_id      BIGINT       REFERENCES courses (id) ON DELETE SET NULL,
    created_by     BIGINT,                               -- users.id (soft ref: faculty/admin uploader)
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 8. certificates
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificates (
    id              BIGSERIAL PRIMARY KEY,
    certificate_no  VARCHAR(60)  NOT NULL UNIQUE,
    title           VARCHAR(200) NOT NULL,
    user_id         BIGINT       REFERENCES users (id)   ON DELETE SET NULL,
    course_id       BIGINT       REFERENCES courses (id) ON DELETE SET NULL,
    issued_on       DATE,
    file_url        VARCHAR(600) NOT NULL,               -- Cloudinary URL
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates (user_id);

-- ---------------------------------------------------------------------
-- 9. notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         BIGSERIAL PRIMARY KEY,
    title      VARCHAR(200) NOT NULL,
    message    TEXT         NOT NULL,
    kind       VARCHAR(20)  NOT NULL DEFAULT 'INFO'
               CHECK (kind IN ('INFO', 'UPDATE', 'OFFER', 'ALERT')),
    user_id    BIGINT       REFERENCES users (id) ON DELETE CASCADE,  -- NULL = broadcast
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);

-- ---------------------------------------------------------------------
-- 10. favorites
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_type  VARCHAR(20) NOT NULL
               CHECK (item_type IN ('COURSE','NOTE','PYQ','TNP_NOTE','TIMETABLE','CERTIFICATE')),
    item_id    BIGINT      NOT NULL,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    CONSTRAINT uk_favorites_user_item UNIQUE (user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites (user_id);

-- ---------------------------------------------------------------------
-- 11. feedback
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id)   ON DELETE CASCADE,
    course_id  BIGINT      REFERENCES courses (id) ON DELETE SET NULL,
    rating     INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    message    TEXT        NOT NULL,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_course ON feedback (course_id);

-- ---------------------------------------------------------------------
-- 12. related_videos (YouTube lectures attached to notes / tnp_notes)
-- ---------------------------------------------------------------------
-- note_or_tnp_id is a soft reference resolved together with content_type;
-- the owning content service deletes a record's rows when the record itself
-- is deleted (no FK because the column points at two different tables).
CREATE TABLE IF NOT EXISTS related_videos (
    id             BIGSERIAL PRIMARY KEY,
    content_type   VARCHAR(20)  NOT NULL CHECK (content_type IN ('NOTE', 'TNP')),
    note_or_tnp_id BIGINT       NOT NULL,
    video_title    VARCHAR(200) NOT NULL,
    youtube_url    VARCHAR(600) NOT NULL,
    uploaded_by    BIGINT,                                -- users.id (soft ref: admin/faculty uploader)
    sort_order     INTEGER      NOT NULL DEFAULT 0,       -- zero-based display order
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_related_videos_parent
    ON related_videos (content_type, note_or_tnp_id);

-- Optional one-off migration for databases created before this feature.
-- Wrapped in a DO block so a re-run is a harmless no-op.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_name = 'related_videos') THEN
        CREATE TABLE related_videos (
            id             BIGSERIAL PRIMARY KEY,
            content_type   VARCHAR(20)  NOT NULL CHECK (content_type IN ('NOTE', 'TNP')),
            note_or_tnp_id BIGINT       NOT NULL,
            video_title    VARCHAR(200) NOT NULL,
            youtube_url    VARCHAR(600) NOT NULL,
            uploaded_by    BIGINT,
            sort_order     INTEGER      NOT NULL DEFAULT 0,
            created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_related_videos_parent
            ON related_videos (content_type, note_or_tnp_id);
    END IF;
END $$;
