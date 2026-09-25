import { describe, expect, it } from "vitest";
import { addViewportCoverage } from "../../src/client/lib/addViewport.js";

describe("Add Word visible viewport", () => {
  it("tracks keyboard coverage even when the layout viewport shrinks with it", () => {
    const initial = { unobscuredBottom: 844, coveredHeight: 0 };
    expect(addViewportCoverage(initial, 510, true)).toEqual({
      unobscuredBottom: 844,
      coveredHeight: 334,
    });
    expect(addViewportCoverage(initial, 844, true).coveredHeight).toBe(0);
  });

  it("keeps the keyboard layout on blur until the viewport recovers", () => {
    const open = addViewportCoverage({ unobscuredBottom: 844, coveredHeight: 0 }, 510, true);
    const blurred = addViewportCoverage(open, 510, false);
    expect(blurred).toEqual(open);

    const closing = addViewportCoverage(blurred, 700, false);
    expect(closing).toEqual({ unobscuredBottom: 844, coveredHeight: 144 });

    expect(addViewportCoverage(closing, 840, false)).toEqual({
      unobscuredBottom: 840,
      coveredHeight: 0,
    });
  });

  it("adopts a viewport change when no keyboard was covering the form", () => {
    expect(addViewportCoverage({ unobscuredBottom: 844, coveredHeight: 0 }, 700, false)).toEqual({
      unobscuredBottom: 700,
      coveredHeight: 0,
    });
  });

  it("accepts a larger viewport if Telegram expands while a field is focused", () => {
    expect(addViewportCoverage({ unobscuredBottom: 700, coveredHeight: 0 }, 844, true)).toEqual({
      unobscuredBottom: 844,
      coveredHeight: 0,
    });
  });
});
