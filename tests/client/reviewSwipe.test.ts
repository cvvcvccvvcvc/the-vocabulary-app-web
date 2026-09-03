import { describe, expect, it } from "vitest";
import {
  reviewSwipeExitDuration,
  reviewSwipeExitOffset,
} from "../../src/client/lib/reviewSwipe.js";

describe("review card exit motion", () => {
  it("finishes just beyond the nearest viewport edge", () => {
    const bounds = { left: 35, width: 320 };
    expect(reviewSwipeExitOffset(bounds, 390, 1)).toBe(375);
    expect(reviewSwipeExitOffset(bounds, 390, -1)).toBe(-375);
  });

  it("uses release speed without becoming abrupt or sluggish", () => {
    expect(reviewSwipeExitDuration(100, 375, 0.5)).toBe(204);
    expect(reviewSwipeExitDuration(100, 375, 3)).toBe(160);
    expect(reviewSwipeExitDuration(100, 700, 0)).toBe(260);
  });
});
