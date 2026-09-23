import { describe, expect, it } from "vitest";
import {
  SeededRandomSource,
  applyReviewAnswer,
  intervalHoursForLevel,
  isScheduledReviewCandidate,
  scheduledReviewQueue,
} from "../../src/domain/index.js";
import { makeWord } from "./fixtures.js";

const now = new Date("2026-08-23T12:00:00.000Z");

describe("Scheduled Review", () => {
  it("defines the interval for every level and clamps invalid levels", () => {
    expect(Array.from({ length: 10 }, (_, level) => intervalHoursForLevel(level))).toEqual([
      16, 16, 96, 168, 336, 504, 720, 1080, 1440, 2160,
    ]);
    expect(intervalHoursForLevel(-3)).toBe(16);
    expect(intervalHoursForLevel(42)).toBe(2160);
  });

  it("returns the first correct card after 16 hours and the second after four days", () => {
    const first = applyReviewAnswer(makeWord(), true, "scheduled", now);
    expect(first.level).toBe(1);
    expect(first.nextReviewAt).toBe("2026-08-24T04:00:00.000Z");
    const second = applyReviewAnswer(first, true, "scheduled", new Date(first.nextReviewAt!));
    expect(second.level).toBe(2);
    expect(second.nextReviewAt).toBe("2026-08-28T04:00:00.000Z");
  });

  it("raises levels and updates progress", () => {
    const correct = applyReviewAnswer(makeWord({ level: 2 }), true, "scheduled", now);
    expect(correct.level).toBe(3);
    expect(correct.nextReviewAt).toBe("2026-08-30T12:00:00.000Z");
    expect(correct.correctCount).toBe(1);
    expect(correct.lastAnswerWasWrong).toBe(false);
  });

  it("repeats wrong cards in 16 hours, including new and mature cards", () => {
    const due = "2026-08-24T04:00:00.000Z";
    const newWrong = applyReviewAnswer(makeWord(), false, "scheduled", now);
    expect(newWrong).toMatchObject({ level: 0, nextReviewAt: due, wrongCount: 1 });
    const matureWrong = applyReviewAnswer(makeWord({ level: 9, scheduledIntervalHours: 2160 }),
      false, "scheduled", now);
    expect(matureWrong).toMatchObject({
      level: 1,
      nextReviewAt: due,
      scheduledIntervalHours: null,
      lastAnswerWasWrong: true,
    });
    expect(applyReviewAnswer(matureWrong, false, "scheduled", now).level).toBe(1);
  });

  it("extends successful level-nine intervals from 90 to 135 to 180 days", () => {
    const entry = applyReviewAnswer(makeWord({ level: 8 }), true, "scheduled", now);
    const first = applyReviewAnswer(entry, true, "scheduled", new Date(entry.nextReviewAt!));
    const second = applyReviewAnswer(first, true, "scheduled", new Date(first.nextReviewAt!));
    const capped = applyReviewAnswer(second, true, "scheduled", new Date(second.nextReviewAt!));
    expect([entry, first, second, capped].map((word) => word.scheduledIntervalHours)).toEqual([
      2160, 3240, 4320, 4320,
    ]);
    expect(capped.level).toBe(9);
    expect(applyReviewAnswer(makeWord({ level: 9 }), true, "scheduled", now)
      .scheduledIntervalHours).toBe(2160);
  });

  it("does not change level or schedule in Free Review", () => {
    const word = makeWord({ level: 9, scheduledIntervalHours: 3240,
      nextReviewAt: "2026-09-01T00:00:00.000Z" });
    const answered = applyReviewAnswer(word, false, "free", now);

    expect(answered.level).toBe(9);
    expect(answered.nextReviewAt).toBe(word.nextReviewAt);
    expect(answered.scheduledIntervalHours).toBe(word.scheduledIntervalHours);
    expect(answered.wrongCount).toBe(1);
  });

  it("selects only active new and due words", () => {
    const future = makeWord({
      id: "future",
      lastReviewedAt: "2026-08-22T00:00:00.000Z",
      nextReviewAt: "2026-08-24T00:00:00.000Z",
    });
    const due = makeWord({
      id: "due",
      lastReviewedAt: "2026-08-20T00:00:00.000Z",
      nextReviewAt: "2026-08-23T11:00:00.000Z",
    });
    const deleted = makeWord({ id: "deleted", isDeleted: true });

    expect(isScheduledReviewCandidate(makeWord(), now)).toBe(true);
    const afterFirst = applyReviewAnswer(makeWord(), true, "scheduled", now);
    expect(isScheduledReviewCandidate(afterFirst, new Date("2026-08-24T03:59:59.999Z"))).toBe(false);
    expect(isScheduledReviewCandidate(afterFirst, new Date("2026-08-24T04:00:00.000Z"))).toBe(true);
    expect(isScheduledReviewCandidate(future, now)).toBe(false);
    expect(scheduledReviewQueue([future, due, deleted], now, new SeededRandomSource(1))).toEqual([
      due,
    ]);
  });
});
