CREATE TABLE users (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    username TEXT,
    photo_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX sessions_user_id_index ON sessions(user_id);
CREATE INDEX sessions_expires_at_index ON sessions(expires_at);

CREATE TABLE auth_flows (
    state_hash TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    learning_language TEXT NOT NULL DEFAULT 'en',
    known_language TEXT NOT NULL DEFAULT 'ru',
    updated_at TEXT NOT NULL
);

CREATE TABLE words (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    learning_text TEXT NOT NULL,
    normalized_learning_text TEXT NOT NULL,
    meanings_json TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 9),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    content_updated_at TEXT NOT NULL,
    progress_updated_at TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at TEXT,
    next_review_at TEXT,
    last_seen_at TEXT,
    last_reviewed_at TEXT,
    last_direction TEXT CHECK (
        last_direction IS NULL OR
        last_direction IN ('learning-to-known', 'known-to-learning')
    ),
    correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
    last_answer_was_wrong INTEGER NOT NULL DEFAULT 0 CHECK (last_answer_was_wrong IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE UNIQUE INDEX words_user_learning_text_unique
    ON words(user_id, normalized_learning_text)
    WHERE is_deleted = 0;

CREATE INDEX words_user_active_index ON words(user_id, is_deleted);
CREATE INDEX words_user_due_index ON words(user_id, is_deleted, next_review_at);

CREATE TABLE review_operations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX review_operations_created_at_index ON review_operations(created_at);

