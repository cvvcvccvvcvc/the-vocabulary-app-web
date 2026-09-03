import { describe, expect, it } from "vitest";
import {
  settleSwipeAction,
  swipeActionOffset,
  swipeActionPresentation,
} from "../../src/client/lib/swipeAction.js";

describe("swipe action gesture", () => {
  it("keeps the row between closed and fully displaced", () => {
    expect(swipeActionOffset(0, -30, 320)).toBe(-30);
    expect(swipeActionOffset(0, -400, 320)).toBe(-320);
    expect(swipeActionOffset(-124, 200, 320)).toBe(0);
  });

  it("keeps the action invisible during the initial travel", () => {
    expect(swipeActionPresentation(-18)).toEqual({ width: 0, progress: 0 });
    expect(swipeActionPresentation(-124)).toEqual({ width: 112, progress: 1 });
    expect(swipeActionPresentation(-320)).toEqual({ width: 308, progress: 1 });
  });

  it("settles closed, revealed, or at confirmation by distance and intent", () => {
    expect(settleSwipeAction(-55, 0.1, 320, 124)).toBe("closed");
    expect(settleSwipeAction(-56, 0.1, 320, 124)).toBe("revealed");
    expect(settleSwipeAction(-20, -0.6, 320, 124)).toBe("revealed");
    expect(settleSwipeAction(-100, 0.6, 320, 124)).toBe("closed");
    expect(settleSwipeAction(-231, 0.1, 320, 124)).toBe("confirm");
  });
});
