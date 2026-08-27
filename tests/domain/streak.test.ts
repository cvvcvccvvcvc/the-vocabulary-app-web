import { describe, expect, it } from "vitest";
import { calculateCurrentStreak } from "../../src/domain/index.js";

describe("current streak", () => {
  it("counts consecutive activity through today", () => {
    expect(calculateCurrentStreak(
      ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25"],
      "2026-08-25",
    )).toEqual({ current: 4, studiedToday: true });
  });

  it("keeps the streak available through the end of the next day", () => {
    expect(calculateCurrentStreak(
      ["2026-08-22", "2026-08-23", "2026-08-24"],
      "2026-08-25",
    )).toEqual({ current: 3, studiedToday: false });
  });

  it("resets after a full missed calendar day", () => {
    expect(calculateCurrentStreak(
      ["2026-08-21", "2026-08-22", "2026-08-23"],
      "2026-08-25",
    )).toEqual({ current: 0, studiedToday: false });
  });

  it("does not count duplicate activity days twice", () => {
    expect(calculateCurrentStreak(
      ["2026-08-24", "2026-08-24", "2026-08-25", "2026-08-25"],
      "2026-08-25",
    )).toEqual({ current: 2, studiedToday: true });
  });
});
