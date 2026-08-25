CREATE TABLE telegram_reminder_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE telegram_reminder_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    review_operation_id TEXT NOT NULL REFERENCES review_operations(id) ON DELETE CASCADE,
    milestone_days INTEGER NOT NULL CHECK (milestone_days IN (1, 2, 4, 7, 14, 30)),
    due_card_count INTEGER NOT NULL CHECK (due_card_count >= 0),
    status TEXT NOT NULL CHECK (
        status IN ('skipped_no_due', 'claimed', 'sent', 'failed')
    ),
    telegram_error_code INTEGER,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (user_id, review_operation_id, milestone_days)
);

CREATE INDEX review_operations_user_created_at_index
    ON review_operations(user_id, created_at DESC, id DESC);

CREATE INDEX telegram_reminder_events_user_cycle_index
    ON telegram_reminder_events(user_id, review_operation_id, milestone_days DESC);
