ALTER TABLE user_settings ADD COLUMN translation_max_meanings INTEGER NOT NULL DEFAULT 3
CHECK (translation_max_meanings BETWEEN 1 AND 8);
