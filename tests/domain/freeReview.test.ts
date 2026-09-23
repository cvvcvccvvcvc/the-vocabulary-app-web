import { describe, expect, it } from "vitest";
import {
  FreeReviewPicker,
  SeededRandomSource,
  applyReviewAnswer,
  freeReviewWeight,
  type RandomSource,
} from "../../src/domain/index.js";
import { makeWord } from "./fixtures.js";

const now = new Date("2026-08-23T12:00:00.000Z");

describe("Free Review", () => {
  it("keeps recent mistakes influential after a correct answer", () => {
    const fresh = { level: 9, lastSeenAt: now.toISOString() };
    const easy = freeReviewWeight(makeWord({ ...fresh, recentAnswers: [true, true, true] }), now);
    const recovering = freeReviewWeight(makeWord({ ...fresh, recentAnswers: [true, false, true] }), now);
    const difficult = freeReviewWeight(makeWord({
      ...fresh,
      recentAnswers: [false, false, false, true, true, true, true],
    }), now);

    expect(recovering).toBeGreaterThan(easy);
    expect(difficult).toBeGreaterThan(recovering);
    expect(freeReviewWeight(makeWord({ ...fresh, recentAnswers: [false] }), now)).toBe(6);
  });

  it("caps age so a long-unseen high-level word does not outweigh a fresh low-level word", () => {
    const old = makeWord({ level: 9, lastSeenAt: "2026-01-01T00:00:00.000Z" });
    const monthOld = makeWord({ level: 9, lastSeenAt: "2026-07-24T12:00:00.000Z" });
    const lowLevel = makeWord({ level: 0, lastSeenAt: now.toISOString() });

    expect(freeReviewWeight(old, now)).toBe(freeReviewWeight(monthOld, now));
    expect(freeReviewWeight(old, now)).toBeLessThan(freeReviewWeight(lowLevel, now));
  });

  it("retains only seven answers across both review modes", () => {
    let word = makeWord();
    for (const correct of [true, false, true, false, true, false, true, false]) {
      word = applyReviewAnswer(word, correct, "free", now);
    }
    expect(word.recentAnswers).toEqual([false, true, false, true, false, true, false]);
    expect(applyReviewAnswer(word, true, "scheduled", now).recentAnswers).toEqual([
      true, false, true, false, true, false, true,
    ]);
  });

  it("never repeats within a ten-card window when ten words exist", () => {
    const words = Array.from({ length: 10 }, (_, index) =>
      makeWord({ id: `word-${index}`, level: index }),
    );
    const picker = new FreeReviewPicker();
    const random = new SeededRandomSource(50);
    const selected = Array.from({ length: 50 }, () => picker.next(words, now, random)?.id);

    for (let index = 0; index <= selected.length - 10; index += 1) {
      expect(new Set(selected.slice(index, index + 10)).size).toBe(10);
    }
  });

  it("gracefully cycles through a small deck", () => {
    const words = [makeWord({ id: "one" }), makeWord({ id: "two" })];
    const picker = new FreeReviewPicker();
    const random = new SeededRandomSource(3);
    const selected = Array.from({ length: 8 }, () => picker.next(words, now, random)?.id);

    expect(selected).not.toContain(undefined);
    expect(new Set(selected)).toEqual(new Set(["one", "two"]));
  });

  it("supports an indefinitely repeating one-word deck", () => {
    const word = makeWord({ id: "only-word" });
    const picker = new FreeReviewPicker();
    const random = new SeededRandomSource(9);

    expect(Array.from({ length: 100 }, () => picker.next([word], now, random)?.id)).toEqual(
      Array.from({ length: 100 }, () => "only-word"),
    );
  });

  it("uses updated difficulty on the very next choice", () => {
    class ScriptedRandomSource implements RandomSource {
      private values = [0.99, 0.2];

      next(): number {
        return this.values.shift() ?? 0;
      }
    }

    const words = Array.from({ length: 11 }, (_, index) => makeWord({
      id: `word-${index}`,
      level: 9,
      lastSeenAt: now.toISOString(),
      recentAnswers: [true],
    }));
    const picker = new FreeReviewPicker();
    const random = new ScriptedRandomSource();
    expect(picker.next(words, now, random)?.id).toBe("word-10");

    const updated = words.map((word) => word.id === "word-0"
      ? { ...word, recentAnswers: [false] }
      : word);
    expect(picker.next(updated, now, random)?.id).toBe("word-0");
  });
});
