import { describe, expect, it } from "vitest";
import {
  SeededRandomSource,
  markWordShown,
  resolveReviewDirection,
} from "../../src/domain/index.js";
import { makeWord } from "./fixtures.js";

describe("review direction", () => {
  it("alternates after the first presentation", () => {
    const random = new SeededRandomSource(7);
    expect(resolveReviewDirection("learning-to-known", random)).toBe("known-to-learning");
    expect(resolveReviewDirection("known-to-learning", random)).toBe("learning-to-known");
  });

  it("makes the seeded first direction deterministic", () => {
    expect(resolveReviewDirection(null, new SeededRandomSource(100))).toBe(
      resolveReviewDirection(null, new SeededRandomSource(100)),
    );
  });

  it("records the shown direction and time", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const shown = markWordShown(makeWord(), "learning-to-known", now);

    expect(shown.lastDirection).toBe("learning-to-known");
    expect(shown.lastSeenAt).toBe(now.toISOString());
  });
});

