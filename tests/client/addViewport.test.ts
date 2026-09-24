import { describe, expect, it } from "vitest";
import { addViewportCoverage } from "../../src/client/lib/addViewport.js";

describe("Add Word visible viewport", () => {
  it("tracks keyboard coverage even when the layout viewport shrinks with it", () => {
    expect(addViewportCoverage(844, 510, true)).toEqual({
      unobscuredBottom: 844,
      coveredHeight: 334,
    });
    expect(addViewportCoverage(844, 844, true).coveredHeight).toBe(0);
  });

  it("uses the current viewport again after editing ends", () => {
    expect(addViewportCoverage(844, 510, false)).toEqual({
      unobscuredBottom: 510,
      coveredHeight: 0,
    });
  });

  it("accepts a larger viewport if Telegram expands while a field is focused", () => {
    expect(addViewportCoverage(700, 844, true)).toEqual({
      unobscuredBottom: 844,
      coveredHeight: 0,
    });
  });
});
