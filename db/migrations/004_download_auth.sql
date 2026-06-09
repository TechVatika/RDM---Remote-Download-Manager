-- Flag set when a download fails because the target requires a login.
-- The actual username/password are NOT stored here — the backend keeps them
-- only in memory for the immediate retry.
USE rdm;
ALTER TABLE downloads ADD COLUMN needs_auth TINYINT(1) NOT NULL DEFAULT 0;
