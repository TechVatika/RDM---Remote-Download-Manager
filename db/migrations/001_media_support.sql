-- Adds media (yt-dlp) download support to an existing rdm database.
-- Safe to run once on a DB created before media support existed.
USE rdm;

ALTER TABLE downloads
  ADD COLUMN type       ENUM('http', 'media') NOT NULL DEFAULT 'http' AFTER error_message,
  ADD COLUMN format_id  VARCHAR(64)  NULL AFTER type,
  ADD COLUMN media_kind ENUM('video', 'audio') NULL AFTER format_id,
  ADD COLUMN title       VARCHAR(512) NULL AFTER media_kind,
  ADD COLUMN thumbnail   VARCHAR(1024) NULL AFTER title,
  ADD COLUMN connections TINYINT UNSIGNED NULL AFTER thumbnail,
  ADD COLUMN filename     VARCHAR(512) NULL AFTER connections;
