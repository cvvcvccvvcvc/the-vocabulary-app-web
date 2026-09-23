ALTER TABLE words
    ADD COLUMN recent_answers_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX review_events_user_word_recent_index
    ON review_events(user_id, word_id, created_at DESC, id DESC);

UPDATE words
SET recent_answers_json = CASE
    WHEN EXISTS (
        SELECT 1 FROM review_events AS event
        WHERE event.user_id = words.user_id
          AND event.word_id = words.id
          AND event.correct IS NOT NULL
    ) THEN (
        SELECT json_group_array(correct)
        FROM (
            SELECT event.correct
            FROM review_events AS event
            WHERE event.user_id = words.user_id
              AND event.word_id = words.id
              AND event.correct IS NOT NULL
            ORDER BY event.created_at DESC, event.id DESC
            LIMIT 7
        )
    )
    WHEN last_reviewed_at IS NOT NULL THEN json_array(1 - last_answer_was_wrong)
    ELSE '[]'
END
WHERE is_deleted = 0;
