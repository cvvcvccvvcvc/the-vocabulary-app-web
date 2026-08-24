import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsRepository } from "../../src/server/analytics.js";
import { VocabularyDatabase } from "../../src/server/database.js";
import { VocabularyRepository } from "../../src/server/repository.js";

describe("analytics", () => {
  let database: VocabularyDatabase;
  let repository: VocabularyRepository;
  let analytics: AnalyticsRepository;

  beforeEach(() => {
    database = new VocabularyDatabase(":memory:");
    repository = new VocabularyRepository(database.sqlite);
    analytics = new AnalyticsRepository(database.sqlite);
  });

  afterEach(() => {
    database.close();
  });

  it("builds complete calendar histories from registrations, words, and answers", () => {
    const owner = repository.ensureUser(
      {
        telegramUserId: "1001",
        displayName: "Owner User",
        username: "owner",
        photoUrl: null,
      },
      new Date("2026-08-20T20:30:00.000Z"),
    );
    const learner = repository.ensureUser(
      {
        telegramUserId: "2002",
        displayName: "Learner User",
        username: null,
        photoUrl: null,
      },
      new Date("2026-08-21T21:00:00.000Z"),
    );

    const ownerWord = repository.createWord(
      owner.id,
      { learningText: "memory", meanings: ["память"], comment: "" },
      new Date("2026-08-21T02:00:00.000Z"),
    );
    const learnerWord = repository.createWord(
      learner.id,
      { learningText: "apple", meanings: ["яблоко"], comment: "" },
      new Date("2026-08-21T22:00:00.000Z"),
    );

    repository.answerWord(
      owner.id,
      ownerWord.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-21T03:00:00.000Z"),
    );
    repository.answerWord(
      learner.id,
      learnerWord.id,
      randomUUID(),
      false,
      "scheduled",
      new Date("2026-08-21T23:00:00.000Z"),
    );
    repository.answerWord(
      owner.id,
      ownerWord.id,
      randomUUID(),
      true,
      "free",
      new Date("2026-08-24T05:00:00.000Z"),
    );
    repository.answerWord(
      learner.id,
      learnerWord.id,
      randomUUID(),
      true,
      "free",
      new Date("2026-08-24T06:00:00.000Z"),
    );
    repository.deleteWord(
      learner.id,
      learnerWord.id,
      new Date("2026-08-24T07:00:00.000Z"),
    );

    const report = analytics.report(new Date("2026-08-24T12:00:00.000Z"));

    expect(report.registrations).toEqual([
      { date: "2026-08-21", newUsers: 1, totalUsers: 1 },
      { date: "2026-08-22", newUsers: 1, totalUsers: 2 },
      { date: "2026-08-23", newUsers: 0, totalUsers: 2 },
      { date: "2026-08-24", newUsers: 0, totalUsers: 2 },
    ]);
    expect(report.activity.days).toEqual([
      { periodStart: "2026-08-21", activeUsers: 1 },
      { periodStart: "2026-08-22", activeUsers: 1 },
      { periodStart: "2026-08-23", activeUsers: 0 },
      { periodStart: "2026-08-24", activeUsers: 2 },
    ]);
    expect(report.activity.weeks).toEqual([
      { periodStart: "2026-08-17", activeUsers: 2 },
      { periodStart: "2026-08-24", activeUsers: 2 },
    ]);
    expect(report.activity.months).toEqual([
      { periodStart: "2026-08-01", activeUsers: 2 },
    ]);
    expect(report.usage).toEqual([
      { date: "2026-08-21", answers: 1, wordsAdded: 1 },
      { date: "2026-08-22", answers: 1, wordsAdded: 1 },
      { date: "2026-08-23", answers: 0, wordsAdded: 0 },
      { date: "2026-08-24", answers: 2, wordsAdded: 0 },
    ]);
    expect(report.summary).toEqual({
      totalUsers: 2,
      activeToday: 2,
      activeThisWeek: 2,
      activeThisMonth: 2,
      answersToday: 2,
      wordsAddedToday: 0,
    });
    expect(report.users).toEqual([
      expect.objectContaining({
        id: owner.id,
        activeCardCount: 1,
        wordsAddedCount: 1,
        answerCount: 2,
        lastStudiedAt: "2026-08-24T05:00:00.000Z",
      }),
      expect.objectContaining({
        id: learner.id,
        activeCardCount: 0,
        wordsAddedCount: 1,
        answerCount: 2,
        lastStudiedAt: "2026-08-24T06:00:00.000Z",
      }),
    ]);
  });

  it("authorizes only the configured Telegram identity", () => {
    const owner = repository.ensureUser({
      telegramUserId: "1001",
      displayName: "Owner",
      username: null,
      photoUrl: null,
    });

    expect(analytics.canAccess(owner.id, "1001")).toBe(true);
    expect(analytics.canAccess(owner.id, "2002")).toBe(false);
  });
});
