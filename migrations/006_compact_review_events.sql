CREATE TABLE review_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    correct INTEGER CHECK (correct IS NULL OR correct IN (0, 1)),
    mode TEXT CHECK (mode IS NULL OR mode IN ('scheduled', 'free')),
    direction TEXT CHECK (
        direction IS NULL OR
        direction IN ('learning-to-known', 'known-to-learning')
    ),
    level_before INTEGER CHECK (
        level_before IS NULL OR level_before BETWEEN 0 AND 9
    ),
    level_after INTEGER CHECK (
        level_after IS NULL OR level_after BETWEEN 0 AND 9
    ),
    next_review_at TEXT,
    created_at TEXT NOT NULL
);

INSERT INTO review_events (
    id,
    user_id,
    word_id,
    correct,
    mode,
    direction,
    level_before,
    level_after,
    next_review_at,
    created_at
)
SELECT
    id,
    user_id,
    word_id,
    CAST(json_extract(request_json, '$.answer.correct') AS INTEGER),
    json_extract(request_json, '$.answer.mode'),
    COALESCE(
        json_extract(response_json, '$.answeredWord.lastDirection'),
        json_extract(response_json, '$.lastDirection')
    ),
    NULL,
    COALESCE(
        json_extract(response_json, '$.answeredWord.level'),
        json_extract(response_json, '$.level')
    ),
    COALESCE(
        json_extract(response_json, '$.answeredWord.nextReviewAt'),
        json_extract(response_json, '$.nextReviewAt')
    ),
    created_at
FROM review_operations;

CREATE INDEX review_events_created_at_index
    ON review_events(created_at);

CREATE INDEX review_events_user_created_at_index
    ON review_events(user_id, created_at DESC, id DESC);

CREATE TABLE review_operation_receipts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    request_json TEXT,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

INSERT INTO review_operation_receipts (
    id,
    user_id,
    word_id,
    request_json,
    response_json,
    created_at,
    expires_at
)
SELECT
    id,
    user_id,
    word_id,
    request_json,
    response_json,
    created_at,
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+7 days')
FROM review_operations
WHERE julianday(created_at) > julianday('now', '-7 days');

CREATE INDEX review_operation_receipts_expires_at_index
    ON review_operation_receipts(expires_at);

CREATE TABLE telegram_reminder_events_v2 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    review_event_id TEXT NOT NULL REFERENCES review_events(id) ON DELETE CASCADE,
    milestone_days INTEGER NOT NULL CHECK (milestone_days IN (1, 2, 4, 7, 14, 30)),
    due_card_count INTEGER NOT NULL CHECK (due_card_count >= 0),
    status TEXT NOT NULL CHECK (
        status IN ('skipped_no_due', 'claimed', 'sent', 'failed')
    ),
    telegram_error_code INTEGER,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (user_id, review_event_id, milestone_days)
);

INSERT INTO telegram_reminder_events_v2 (
    id,
    user_id,
    review_event_id,
    milestone_days,
    due_card_count,
    status,
    telegram_error_code,
    created_at,
    completed_at
)
SELECT
    id,
    user_id,
    review_operation_id,
    milestone_days,
    due_card_count,
    status,
    telegram_error_code,
    created_at,
    completed_at
FROM telegram_reminder_events;

DROP TABLE telegram_reminder_events;
ALTER TABLE telegram_reminder_events_v2 RENAME TO telegram_reminder_events;

CREATE INDEX telegram_reminder_events_user_cycle_index
    ON telegram_reminder_events(user_id, review_event_id, milestone_days DESC);

DROP TABLE review_operations;
