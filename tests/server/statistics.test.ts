import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VocabularyDatabase } from "../../src/server/database.js";
import { VocabularyRepository } from "../../src/server/repository.js";
import { StatisticsRepository } from "../../src/server/statistics.js";

describe("user statistics", () => {
  let database: VocabularyDatabase;
  let vocabulary: VocabularyRepository;
  let statistics: StatisticsRepository;
  let userId: string;

  beforeEach(() => {
    database = new VocabularyDatabase(":memory:");
    vocabulary = new VocabularyRepository(database.sqlite);
    statistics = new StatisticsRepository(database.sqlite);
    userId = vocabulary.ensureUser({
      telegramUserId: "1001",
      displayName: "Learner",
      username: null,
      photoUrl: null,
    }).id;
  });

  afterEach(() => database.close());

  it("uses local calendar days across a daylight-saving transition", () => {
    const word = vocabulary.createWord(
      userId,
      { learningText: "spring", meanings: ["весна"], comment: "" },
      new Date("2026-03-07T20:00:00.000Z"),
    );
    answer(word.id, true, "scheduled", "2026-03-08T04:30:00.000Z");
    answer(word.id, false, "free", "2026-03-08T07:30:00.000Z");

    const report = statistics.report(
      userId,
      "America/New_York",
      new Date("2026-03-09T16:00:00.000Z"),
    );

    expect(report.streak).toEqual({ current: 2, studiedToday: false });
    expect(report.activity.filter((day) => day.answers > 0)).toEqual([
      { date: "2026-03-07", answers: 1, wordsAdded: 1 },
      { date: "2026-03-08", answers: 1, wordsAdded: 0 },
    ]);
  });

  it("counts accepted scheduled and free answers but isolates other users", () => {
    const word = vocabulary.createWord(
      userId,
      { learningText: "memory", meanings: ["память"], comment: "" },
      new Date("2026-08-25T06:00:00.000Z"),
    );
    answer(word.id, true, "scheduled", "2026-08-25T07:00:00.000Z");
    answer(word.id, false, "free", "2026-08-25T08:00:00.000Z");

    const other = vocabulary.ensureUser({
      telegramUserId: "2002",
      displayName: "Other",
      username: null,
      photoUrl: null,
    });
    const otherWord = vocabulary.createWord(
      other.id,
      { learningText: "private", meanings: ["личный"], comment: "" },
      new Date("2026-08-25T06:00:00.000Z"),
    );
    vocabulary.answerWord(
      other.id,
      otherWord.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-25T09:00:00.000Z"),
    );

    const report = statistics.report(
      userId,
      "Asia/Yekaterinburg",
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(report.streak).toEqual({ current: 1, studiedToday: true });
    expect(report.activity.at(-1)).toEqual({ date: "2026-08-25", answers: 2, wordsAdded: 1 });
    expect(report.vocabulary).toEqual({
      totalWords: 1,
      dueWords: 0,
      wordsByLevel: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("keeps historical additions after deletion but excludes deleted vocabulary", () => {
    const word = vocabulary.createWord(
      userId,
      { learningText: "temporary", meanings: ["временный"], comment: "" },
      new Date("2026-08-25T06:00:00.000Z"),
    );
    vocabulary.deleteWord(userId, word.id, new Date("2026-08-25T07:00:00.000Z"));

    const report = statistics.report(
      userId,
      "Asia/Yekaterinburg",
      new Date("2026-08-25T12:00:00.000Z"),
    );

    expect(report.activity.at(-1)?.wordsAdded).toBe(1);
    expect(report.vocabulary.totalWords).toBe(0);
  });

  function answer(
    wordId: string,
    correct: boolean,
    mode: "scheduled" | "free",
    timestamp: string,
  ): void {
    vocabulary.answerWord(
      userId,
      wordId,
      randomUUID(),
      correct,
      mode,
      new Date(timestamp),
    );
  }
});
