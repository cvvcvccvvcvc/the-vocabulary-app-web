ALTER TABLE user_settings
ADD COLUMN translation_method TEXT NOT NULL DEFAULT 'wikdict'
CHECK (translation_method IN ('wikdict', 'google'));
