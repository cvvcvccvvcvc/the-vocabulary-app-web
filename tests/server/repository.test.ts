import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VocabularyDatabase } from "../../src/server/database.js";
import { VocabularyRepository } from "../../src/server/repository.js";

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
});
