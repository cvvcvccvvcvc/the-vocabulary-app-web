import { describe, expect, it } from "vitest";
import { calculateMeaningReorderLayout, type MeaningReorderItem } from "../../src/client/lib/meaningReorder.js";

const rows: MeaningReorderItem[] = [
  { id: 10, top: 0, height: 44 },
  { id: 11, top: 52, height: 44 },
  { id: 12, top: 104, height: 44 },
];

function offsets(layout: ReturnType<typeof calculateMeaningReorderLayout>): number[] {
  return layout.shifts.map((item) => item.offset);
}

describe("meaning reorder layout", () => {
  it("moves following rows into the source gap while dragging down", () => {
    const middle = calculateMeaningReorderLayout(rows, 10, 80);
    expect(middle).toMatchObject({ targetIndex: 1, beforeId: 12 });
    expect(offsets(middle)).toEqual([0, -52, 0]);

    const last = calculateMeaningReorderLayout(rows, 10, 132, middle.targetIndex);
    expect(last).toMatchObject({ targetIndex: 2, beforeId: null });
    expect(offsets(last)).toEqual([0, -52, -52]);
  });

  it("moves preceding rows into the source gap while dragging up", () => {
    const middle = calculateMeaningReorderLayout(rows, 12, 69);
    expect(middle).toMatchObject({ targetIndex: 1, beforeId: 11 });
    expect(offsets(middle)).toEqual([0, 52, 0]);

    const first = calculateMeaningReorderLayout(rows, 12, 17, middle.targetIndex);
    expect(first).toMatchObject({ targetIndex: 0, beforeId: 10 });
    expect(offsets(first)).toEqual([52, 52, 0]);
  });

  it("uses hysteresis around a crossed row so the order does not flicker", () => {
    const crossed = calculateMeaningReorderLayout(rows, 10, 80);
    expect(calculateMeaningReorderLayout(rows, 10, 71, crossed.targetIndex).targetIndex).toBe(1);
    expect(calculateMeaningReorderLayout(rows, 10, 69, crossed.targetIndex).targetIndex).toBe(0);
  });

  it("derives exact shifts from captured positions instead of assuming equal rows", () => {
    const uneven = [
      { id: 1, top: 0, height: 44 },
      { id: 2, top: 60, height: 60 },
      { id: 3, top: 140, height: 44 },
    ];
    const layout = calculateMeaningReorderLayout(uneven, 2, 169);
    expect(layout).toMatchObject({ targetIndex: 2, beforeId: null });
    expect(offsets(layout)).toEqual([0, 0, -80]);
  });
});
