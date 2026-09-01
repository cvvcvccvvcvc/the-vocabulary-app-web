import { describe, expect, it } from "vitest";
import {
  shouldRevealSwipeAction,
  swipeActionOffset,
} from "../../src/client/lib/swipeAction.js";

describe("swipe action gesture", () => {
  it("keeps the row between closed and fully revealed", () => {
    expect(swipeActionOffset(0, -30, 72)).toBe(-30);
    expect(swipeActionOffset(0, -100, 72)).toBe(-72);
    expect(swipeActionOffset(-72, 100, 72)).toBe(0);
  });

  it("settles by distance unless a deliberate flick chooses the direction", () => {
    expect(shouldRevealSwipeAction(-33, 0.1, 72)).toBe(true);
    expect(shouldRevealSwipeAction(-31, -0.1, 72)).toBe(false);
    expect(shouldRevealSwipeAction(-10, -0.6, 72)).toBe(true);
    expect(shouldRevealSwipeAction(-60, 0.6, 72)).toBe(false);
  });
});
