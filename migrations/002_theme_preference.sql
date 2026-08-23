ALTER TABLE user_settings
ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'
CHECK (theme IN ('system', 'light', 'dark'));
