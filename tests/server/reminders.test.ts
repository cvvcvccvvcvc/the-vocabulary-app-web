import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VocabularyDatabase } from "../../src/server/database.js";
import { TelegramReminderRepository } from "../../src/server/reminders.js";
import { VocabularyRepository } from "../../src/server/repository.js";

describe("Telegram reminder repository", () => {
  let database: VocabularyDatabase;
  let vocabulary: VocabularyRepository;
  let reminders: TelegramReminderRepository;
  let userId: string;

  beforeEach(() => {
    database = new VocabularyDatabase(":memory:");
    vocabulary = new VocabularyRepository(database.sqlite);
    reminders = new TelegramReminderRepository(database.sqlite);
    userId = vocabulary.ensureUser({
      telegramUserId: "1001",
      displayName: "Learner",
      username: null,
      photoUrl: null,
    }, new Date("2026-08-01T12:00:00.000Z")).id;
  });

  afterEach(() => database.close());

  it("claims each reached milestone once and resets after a new answer", () => {
    const firstWord = vocabulary.createWord(
      userId,
      { learningText: "memory", meanings: ["память"], comment: "" },
      new Date("2026-08-01T12:00:00.000Z"),
    );
    vocabulary.answerWord(
      userId,
      firstWord.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-01T12:00:00.000Z"),
    );
    reminders.updateSettings(userId, true, new Date("2026-08-01T12:00:00.000Z"));

    expect(reminders.claimDue(20, new Date("2026-08-02T11:59:59.999Z"))).toEqual([]);
    const firstClaim = reminders.claimDue(20, new Date("2026-08-02T12:00:00.000Z"));
    expect(firstClaim).toMatchObject([{
      chatId: "1001",
      dueCardCount: 1,
      milestoneDays: 1,
    }]);
    expect(reminders.claimDue(20, new Date("2026-08-02T13:00:00.000Z"))).toEqual([]);

    vocabulary.answerWord(
      userId,
      firstWord.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-02T14:00:00.000Z"),
    );
    expect(reminders.claimDue(20, new Date("2026-08-03T14:00:00.000Z"))).toEqual([]);
    expect(reminders.claimDue(20, new Date("2026-08-04T14:00:00.000Z"))).toMatchObject([{
      dueCardCount: 1,
      milestoneDays: 2,
    }]);
  });

  it("consumes a milestone when there are no due cards", () => {
    const word = vocabulary.createWord(
      userId,
      { learningText: "apple", meanings: ["яблоко"], comment: "" },
      new Date("2026-08-01T12:00:00.000Z"),
    );
    vocabulary.answerWord(
      userId,
      word.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-01T12:00:00.000Z"),
    );
    vocabulary.answerWord(
      userId,
      word.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-02T12:00:00.000Z"),
    );
    reminders.updateSettings(userId, true, new Date("2026-08-02T12:00:00.000Z"));

    expect(reminders.claimDue(20, new Date("2026-08-03T12:00:00.000Z"))).toEqual([]);
    expect(reminders.claimDue(20, new Date("2026-08-03T18:00:00.000Z"))).toEqual([]);
    expect(reminders.claimDue(20, new Date("2026-08-04T12:00:00.000Z"))).toMatchObject([{
      dueCardCount: 1,
      milestoneDays: 2,
    }]);

    const events = database.sqlite
      .prepare("SELECT milestone_days, status FROM telegram_reminder_events ORDER BY milestone_days")
      .all();
    expect(events).toEqual([
      { milestone_days: 1, status: "skipped_no_due" },
      { milestone_days: 2, status: "claimed" },
    ]);
  });

  it("requires opt-in and disables reminders after Telegram rejects the chat", () => {
    const word = vocabulary.createWord(
      userId,
      { learningText: "private", meanings: ["личный"], comment: "" },
      new Date("2026-08-01T12:00:00.000Z"),
    );
    vocabulary.answerWord(
      userId,
      word.id,
      randomUUID(),
      true,
      "scheduled",
      new Date("2026-08-01T12:00:00.000Z"),
    );

    expect(reminders.claimDue(20, new Date("2026-08-02T12:00:00.000Z"))).toEqual([]);
    reminders.updateSettings(userId, true);
    const [claim] = reminders.claimDue(20, new Date("2026-08-02T12:00:00.000Z"));
    expect(claim).toBeDefined();

    reminders.complete([{ eventId: claim?.eventId ?? "", ok: false, errorCode: 403 }]);
    expect(reminders.settings(userId)).toEqual({ enabled: false });
  });
});
