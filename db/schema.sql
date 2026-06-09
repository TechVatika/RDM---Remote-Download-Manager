USE rdm;

CREATE TABLE IF NOT EXISTS destination_profiles (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64)  NOT NULL UNIQUE,
  label       VARCHAR(128) NOT NULL,
  path        VARCHAR(512) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS downloads (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  url              TEXT         NOT NULL,
  category         VARCHAR(64)  NOT NULL DEFAULT 'general',
  status           ENUM('queued', 'downloading', 'paused', 'completed', 'failed', 'cancelled')
                   NOT NULL DEFAULT 'queued',
  progress         DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  file_path        VARCHAR(512) NULL,
  file_size        BIGINT UNSIGNED NULL,
  bytes_downloaded BIGINT UNSIGNED NOT NULL DEFAULT 0,
  error_message    TEXT NULL,
  type             ENUM('http', 'media') NOT NULL DEFAULT 'http',
  format_id        VARCHAR(64)  NULL,
  media_kind       ENUM('video', 'audio') NULL,
  title            VARCHAR(512) NULL,
  thumbnail        VARCHAR(1024) NULL,
  connections      TINYINT UNSIGNED NULL,
  filename         VARCHAR(512) NULL,
  ai_rename        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at     TIMESTAMP NULL,
  INDEX idx_downloads_status (status),
  INDEX idx_downloads_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(128) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO destination_profiles (name, label, path) VALUES
  ('general',  'General',  '/mnt/4tb-1/RDM/downloads/general'),
  ('movies',   'Movies',   '/mnt/4tb-1/RDM/downloads/movies'),
  ('software', 'Software', '/mnt/4tb-1/RDM/downloads/software')
ON DUPLICATE KEY UPDATE label = VALUES(label), path = VALUES(path);
