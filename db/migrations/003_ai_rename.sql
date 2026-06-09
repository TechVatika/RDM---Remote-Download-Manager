USE rdm;

ALTER TABLE downloads
  ADD COLUMN ai_rename TINYINT(1) NOT NULL DEFAULT 1 AFTER filename;
