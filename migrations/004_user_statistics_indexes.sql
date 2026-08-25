CREATE INDEX review_operations_user_created_at_index
    ON review_operations(user_id, created_at DESC);

CREATE INDEX words_user_created_at_index
    ON words(user_id, created_at);
