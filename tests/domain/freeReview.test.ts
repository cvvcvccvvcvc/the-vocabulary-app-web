import { describe, expect, it } from "vitest";
import {
  FreeReviewPicker,
  SeededRandomSource,
  freeReviewWeight,
  type RandomSource,
} from "../../src/domain/index.js";
import { makeWord } from "./fixtures.js";

const now = new Date("2026-08-23T12:00:00.000Z");

describe("Free Review", () => {
  it("gives recently missed and low-level words more weight", () => {
    const missed = freeReviewWeight(
      makeWord({ level: 0, lastAnswerWasWrong: true }),
      now,
      new SeededRandomSource(1),
    );
    const strong = freeReviewWeight(
      makeWord({ level: 9, lastSeenAt: now.toISOString() }),
      now,
      new SeededRandomSource(1),
    );

    expect(missed).toBeGreaterThan(strong);
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

  it("refills its 20-card batch when five cards remain", () => {
    class CountingRandomSource implements RandomSource {
      calls = 0;

      next(): number {
        this.calls += 1;
        return 0.5;
      }
    }

    const picker = new FreeReviewPicker();
    const random = new CountingRandomSource();
    const word = makeWord({ id: "only-word" });

    for (let index = 0; index < 14; index += 1) {
      picker.next([word], now, random);
    }
    expect(random.calls).toBe(40);

    picker.next([word], now, random);
    expect(random.calls).toBe(70);
  });
});
