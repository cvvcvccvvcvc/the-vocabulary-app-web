import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VocabularyDatabase } from "../../src/server/database.js";
import {
  ReviewOperationConflictError,
  VocabularyRepository,
} from "../../src/server/repository.js";

describe("Vocabulary repository", () => {
  let database: VocabularyDatabase;
  let repository: VocabularyRepository;
  let userId: string;

  beforeEach(() => {
    database = new VocabularyDatabase(":memory:");
    repository = new VocabularyRepository(database.sqlite);
    userId = repository.ensureUser({
      telegramUserId: "1001",
      displayName: "Learner",
      username: null,
      photoUrl: null,
    }).id;
  });

  afterEach(() => database.close());

  it("removes expired sessions when creating a new session", () => {
    repository.createSession(userId, new Date("2025-01-01T00:00:00.000Z"));
    repository.createSession(userId, new Date("2026-08-26T00:00:00.000Z"));

    const row = database.sqlite.prepare("SELECT COUNT(*) AS count FROM sessions").get() as {
      count: number;
    };
    expect(row.count).toBe(1);
  });

  it("changes the edit version only when word content changes", () => {
    const word = repository.createWord(userId, {
      learningText: "memory",
      meanings: ["память"],
      comment: "",
    });

    const shown = repository.markShown(
      userId,
      word.id,
      "learning-to-known",
      new Date("2026-08-26T10:00:00.000Z"),
    );
    const answered = repository.answerWord(
      userId,
      word.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-26T10:01:00.000Z"),
    );
    const edited = repository.updateWord(
      userId,
      word.id,
      word.version,
      { learningText: "memory", meanings: ["память"], comment: "updated" },
      new Date("2026-08-26T10:02:00.000Z"),
    );

    expect(shown.version).toBe(word.version);
    expect(answered.version).toBe(word.version);
    expect(edited.version).toBe(word.version + 1);
    expect(edited.level).toBe(1);
  });

  it("answers and presents the next side of a one-word deck exactly once", () => {
    const word = repository.createWord(userId, {
      learningText: "memory",
      meanings: ["память"],
      comment: "",
    });
    repository.markShown(
      userId,
      word.id,
      "learning-to-known",
      new Date("2026-08-26T10:00:00.000Z"),
    );
    const input = {
      operationId: randomUUID(),
      answer: { wordId: word.id, correct: true, mode: "scheduled" as const },
      shown: { wordId: word.id, direction: "known-to-learning" as const },
    };

    const first = repository.reviewTransition(
      userId,
      input,
      new Date("2026-08-26T10:01:00.000Z"),
    );
    const retry = repository.reviewTransition(
      userId,
      input,
      new Date("2026-08-26T10:02:00.000Z"),
    );

    expect(first.answeredWord).toEqual(first.shownWord);
    expect(first.shownWord).toMatchObject({
      level: 1,
      correctCount: 1,
      lastDirection: "known-to-learning",
      lastSeenAt: "2026-08-26T10:01:00.000Z",
    });
    expect(retry).toEqual(first);
  });

  it("stores compact review facts separately from the retry response", () => {
    const word = repository.createWord(userId, {
      learningText: "memory",
      meanings: ["память"],
      comment: "",
    });
    repository.markShown(
      userId,
      word.id,
      "known-to-learning",
      new Date("2026-08-26T10:00:00.000Z"),
    );
    const operationId = randomUUID();

    repository.answerWord(
      userId,
      word.id,
      operationId,
      true,
      "scheduled",
      new Date("2026-08-26T10:01:00.000Z"),
    );

    const event = database.sqlite
      .prepare(`
        SELECT correct, mode, direction, level_before, level_after,
               next_review_at, created_at
        FROM review_events
        WHERE id = ? AND user_id = ?
      `)
      .get(operationId, userId);
    expect(event).toEqual({
      correct: 1,
      mode: "scheduled",
      direction: "known-to-learning",
      level_before: 0,
      level_after: 1,
      next_review_at: "2026-08-27T10:01:00.000Z",
      created_at: "2026-08-26T10:01:00.000Z",
    });

    const receipt = database.sqlite
      .prepare(`
        SELECT expires_at, request_json, response_json
        FROM review_operation_receipts
        WHERE id = ? AND user_id = ?
      `)
      .get(operationId, userId) as {
        expires_at: string;
        request_json: string;
        response_json: string;
      };
    expect(receipt.expires_at).toBe("2026-09-02T10:01:00.000Z");
    expect(JSON.parse(receipt.request_json)).toMatchObject({
      operationId,
      answer: { wordId: word.id, correct: true, mode: "scheduled" },
    });
    expect(JSON.parse(receipt.response_json)).toMatchObject({ id: word.id, level: 1 });
  });

  it("rejects an old retry after pruning its cached response", () => {
    const word = repository.createWord(userId, {
      learningText: "memory",
      meanings: ["память"],
      comment: "",
    });
    const operationId = randomUUID();
    repository.answerWord(
      userId,
      word.id,
      operationId,
      true,
      "scheduled",
      new Date("2026-08-01T10:00:00.000Z"),
    );

    expect(() => repository.answerWord(
      userId,
      word.id,
      operationId,
      true,
      "scheduled",
      new Date("2026-08-09T10:00:00.000Z"),
    )).toThrowError(ReviewOperationConflictError);

    repository.answerWord(
      userId,
      word.id,
      randomUUID(),
      true,
      "free",
      new Date("2026-08-09T10:01:00.000Z"),
    );

    const counts = database.sqlite
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM review_events WHERE id = ?) AS event_count,
          (SELECT COUNT(*) FROM review_operation_receipts WHERE id = ?) AS receipt_count,
          (SELECT correct_count FROM words WHERE id = ? AND user_id = ?) AS correct_count
      `)
      .get(operationId, operationId, word.id, userId);
    expect(counts).toEqual({ event_count: 1, receipt_count: 0, correct_count: 2 });
  });
});
