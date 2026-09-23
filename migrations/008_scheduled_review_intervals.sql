ALTER TABLE words
    ADD COLUMN scheduled_interval_hours INTEGER CHECK (
        scheduled_interval_hours IS NULL OR scheduled_interval_hours > 0
    );

-- Free Review updates last_reviewed_at, so only Scheduled events can anchor
-- an existing card's first extended interval.
CREATE TEMP TABLE latest_scheduled_review AS
SELECT user_id, word_id, MAX(created_at) AS reviewed_at
FROM review_events
WHERE mode = 'scheduled' AND correct IS NOT NULL
GROUP BY user_id, word_id;

CREATE UNIQUE INDEX latest_scheduled_review_user_word_index
    ON latest_scheduled_review(user_id, word_id);

UPDATE words
SET next_review_at = max(
    next_review_at,
    strftime(
        '%Y-%m-%dT%H:%M:%fZ',
        (
            SELECT reviewed_at FROM latest_scheduled_review
            WHERE user_id = words.user_id AND word_id = words.id
        ),
        '+' || CASE level
            WHEN 2 THEN 96
            WHEN 3 THEN 168
            WHEN 4 THEN 336
            WHEN 5 THEN 504
            ELSE 672
        END || ' hours'
    )
)
WHERE is_deleted = 0
  AND level BETWEEN 2 AND 9
  AND next_review_at IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM latest_scheduled_review
      WHERE user_id = words.user_id AND word_id = words.id
  );

DROP TABLE latest_scheduled_review;
