import { describe, expect, it } from "vitest";
import { calculateMeaningReorderLayout, type MeaningReorderItem } from "../../src/client/lib/meaningReorder.js";
import { createMeaningDraft, getMeaningValues, meaningDraftReducer } from "../../src/client/lib/meaningDraft.js";

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
    expect(calculateMeaningReorderLayout(rows, 10, 45, crossed.targetIndex).targetIndex).toBe(1);
    expect(calculateMeaningReorderLayout(rows, 10, 43, crossed.targetIndex).targetIndex).toBe(0);
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

  it("pins the dragged row to the populated track while selecting the last position", () => {
    const layout = calculateMeaningReorderLayout(rows, 10, 1_000);

    expect(layout).toMatchObject({
      targetIndex: 2,
      beforeId: null,
      clampedCenter: 126,
      offset: 104,
    });
    expect(offsets(layout)).toEqual([0, -52, -52]);
  });

  it("pins the dragged row to the populated track while selecting the first position", () => {
    const layout = calculateMeaningReorderLayout(rows, 12, -1_000);

    expect(layout).toMatchObject({
      targetIndex: 0,
      beforeId: 10,
      clampedCenter: 22,
      offset: -104,
    });
    expect(offsets(layout)).toEqual([52, 52, 0]);
  });

  it("selects every destination at its exact slot center, including both ends", () => {
    for (let count = 2; count <= 8; count += 1) {
      const geometry = Array.from({ length: count }, (_, id) => ({ id, top: id * 52, height: 44 }));
      for (const source of geometry) {
        for (const destination of geometry) {
          const layout = calculateMeaningReorderLayout(geometry, source.id, destination.top + 22);
          expect(layout.targetIndex).toBe(destination.id);
          expect(source.top + layout.offset).toBe(destination.top);
        }
      }
    }
  });

  it("keeps the entire dragged row in bounds when heights differ", () => {
    const geometry = [
      { id: 1, top: 0, height: 44 },
      { id: 2, top: 52, height: 80 },
      { id: 3, top: 140, height: 44 },
    ];
    const first = calculateMeaningReorderLayout(geometry, 2, -1_000);
    const last = calculateMeaningReorderLayout(geometry, 2, 1_000);
    expect(52 + first.offset).toBe(0);
    expect(52 + last.offset + 80).toBe(184);
    expect(last.targetIndex).toBe(2);
    expect(offsets(last)).toEqual([0, 0, -88]);
  });

  it("reenters from outside without cancelling or keeping a stale destination", () => {
    const outside = calculateMeaningReorderLayout(rows, 10, 1_000);
    const middle = calculateMeaningReorderLayout(rows, 10, 74, outside.targetIndex);
    const first = calculateMeaningReorderLayout(rows, 10, -1_000, middle.targetIndex);
    expect([outside.targetIndex, middle.targetIndex, first.targetIndex]).toEqual([2, 1, 0]);
    expect(first.offset).toBe(0);
  });

  it("does not change layout when all content coordinates are shifted by scrolling", () => {
    const original = calculateMeaningReorderLayout(rows, 10, 80);
    const shifted = calculateMeaningReorderLayout(rows.map((row) => ({ ...row, top: row.top + 400 })), 10, 480);
    expect(shifted).toEqual({ ...original, clampedCenter: original.clampedCenter + 400 });
  });

  it("commits the projected order and preserves it after reopening, excluding the empty field", () => {
    const draft = createMeaningDraft(["first", "second", "third"]);
    const geometry = draft.rows.slice(0, 3).map((row, index) => ({ id: row.id, top: index * 52, height: 44 }));
    for (const source of geometry) {
      for (const destination of geometry) {
        const layout = calculateMeaningReorderLayout(geometry, source.id, destination.top + 22);
        const moved = meaningDraftReducer(draft, { type: "move", id: source.id, beforeId: layout.beforeId });
        const expected = draft.rows.slice(0, 3).filter((row) => row.id !== source.id);
        expected.splice(layout.targetIndex, 0, draft.rows[source.id]!);
        expect(getMeaningValues(moved)).toEqual(expected.map((row) => row.text));
        expect(getMeaningValues(createMeaningDraft(getMeaningValues(moved)))).toEqual(getMeaningValues(moved));
        expect(moved.rows.at(-1)?.text).toBe("");
      }
    }
  });
});
