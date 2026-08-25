ALTER TABLE review_operations
    ADD COLUMN correct INTEGER CHECK (correct IN (0, 1));

UPDATE review_operations
SET correct = CASE
    WHEN json_extract(response_json, '$.lastAnswerWasWrong') = 1 THEN 0
    ELSE 1
END
WHERE correct IS NULL;
