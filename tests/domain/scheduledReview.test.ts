import { describe, expect, it } from "vitest";
import {
  SeededRandomSource,
  applyReviewAnswer,
  intervalDaysForLevel,
  isScheduledReviewCandidate,
  scheduledReviewQueue,
} from "../../src/domain/index.js";
import { makeWord } from "./fixtures.js";

const now = new Date("2026-08-23T12:00:00.000Z");

describe("Scheduled Review", () => {
  it("defines the interval for every level and clamps invalid levels", () => {
    expect(Array.from({ length: 10 }, (_, level) => intervalDaysForLevel(level))).toEqual([
      0, 1, 2, 4, 7, 14, 14, 14, 14, 14,
    ]);
    expect(intervalDaysForLevel(-3)).toBe(0);
    expect(intervalDaysForLevel(42)).toBe(14);
  });

  it("raises and lowers levels while updating progress", () => {
    const correct = applyReviewAnswer(makeWord({ level: 2 }), true, "scheduled", now);
    expect(correct.level).toBe(3);
    expect(correct.nextReviewAt).toBe("2026-08-27T12:00:00.000Z");
    expect(correct.correctCount).toBe(1);
    expect(correct.lastAnswerWasWrong).toBe(false);

    const wrong = applyReviewAnswer(makeWord({ level: 1 }), false, "scheduled", now);
    expect(wrong.level).toBe(0);
    expect(wrong.nextReviewAt).toBe(now.toISOString());
    expect(wrong.wrongCount).toBe(1);
    expect(wrong.lastAnswerWasWrong).toBe(true);
  });

  it("clamps answers at levels zero and nine", () => {
    expect(applyReviewAnswer(makeWord({ level: 0 }), false, "scheduled", now).level).toBe(0);
    expect(applyReviewAnswer(makeWord({ level: 9 }), true, "scheduled", now).level).toBe(9);
  });

  it("does not change level or schedule in Free Review", () => {
    const word = makeWord({ level: 6, nextReviewAt: "2026-09-01T00:00:00.000Z" });
    const answered = applyReviewAnswer(word, false, "free", now);

    expect(answered.level).toBe(6);
    expect(answered.nextReviewAt).toBe(word.nextReviewAt);
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
    expect(isScheduledReviewCandidate(future, now)).toBe(false);
    expect(scheduledReviewQueue([future, due, deleted], now, new SeededRandomSource(1))).toEqual([
      due,
    ]);
  });
});

