-- Existing WikDict selections become Google; Google selections remain Google.
ALTER TABLE user_settings DROP COLUMN translation_method;
ALTER TABLE user_settings ADD COLUMN translation_method TEXT NOT NULL DEFAULT 'google'
CHECK (translation_method IN ('google', 'yandex'));
