import { describe, expect, it } from "vitest";
import { createMeaningDraft, getMeaningValues, meaningDraftReducer as reduce } from "../../src/client/lib/meaningDraft.js";

describe("meaning editor draft", () => {
  it("adds one empty slot without replacing the field being typed into", () => {
    const empty = createMeaningDraft([]);
    expect(empty.rows).toHaveLength(1);
    const id = empty.rows[0]!.id;
    const typed = reduce(empty, { type: "change", id, text: "п" });
    const continued = reduce(typed, { type: "change", id, text: "память" });
    expect(continued.rows).toEqual([{ id, text: "память" }, typed.rows[1]]);
    expect(empty.rows[0]!.text).toBe("");
  });

  it("keeps a cleared middle field in place and reuses it for replacement", () => {
    const original = createMeaningDraft(["первое", "второе", "третье"]);
    const id = original.rows[1]!.id;
    const cleared = reduce(original, { type: "change", id, text: "" });
    expect(cleared.rows.map((row) => row.text)).toEqual(["первое", "", "третье"]);
    expect(cleared.rows[1]!.id).toBe(id);
    const replaced = reduce(cleared, { type: "change", id, text: "замена" });
    expect(replaced.rows.map((row) => row.text)).toEqual(["первое", "замена", "третье", ""]);
    expect(replaced.rows[1]!.id).toBe(id);
  });

  it("moves a cleared field to the end only after focus leaves it", () => {
    const original = createMeaningDraft(["первое", "второе"]);
    const cleared = reduce(original, { type: "change", id: original.rows[0]!.id, text: "  " });
    const settled = reduce(cleared, { type: "settle", activeId: original.rows[1]!.id });
    expect(settled.rows).toEqual([original.rows[1], { id: original.rows[0]!.id, text: "" }]);
    expect(getMeaningValues(cleared)).toEqual(["второе"]);
  });

  it.each([0, 1, 2])("can delete populated row %i without changing the other identities", (index) => {
    const original = createMeaningDraft(["первое", "второе", "третье"]);
    const removed = reduce(original, { type: "remove", id: original.rows[index]!.id, activeId: null });
    expect(removed.rows).toEqual(original.rows.filter((_, position) => position !== index));
  });

  it("allows deleting the only meaning but never deletes the empty slot", () => {
    const original = createMeaningDraft(["память"]);
    const removed = reduce(original, { type: "remove", id: original.rows[0]!.id, activeId: null });
    expect(removed.rows).toEqual([original.rows[1]]);
    expect(getMeaningValues(removed)).toEqual([]);
    expect(reduce(removed, { type: "remove", id: removed.rows[0]!.id, activeId: null })).toBe(removed);
  });

  it("caps the editor at eight meanings and restores a slot after deletion", () => {
    let draft = createMeaningDraft([]);
    for (let index = 0; index < 8; index++) {
      draft = reduce(draft, { type: "change", id: draft.rows.at(-1)!.id, text: `значение ${index}` });
      expect(draft.rows).toHaveLength(Math.min(index + 2, 8));
    }
    expect(getMeaningValues(draft)).toHaveLength(8);
    const removed = reduce(draft, { type: "remove", id: draft.rows[0]!.id, activeId: null });
    expect(removed.rows).toHaveLength(8);
    expect(removed.rows.at(-1)!.text).toBe("");
    const cleared = reduce(draft, { type: "change", id: draft.rows[2]!.id, text: "" });
    const replaced = reduce(cleared, { type: "change", id: draft.rows[2]!.id, text: "замена" });
    expect(replaced.rows).toHaveLength(8);
    expect(getMeaningValues(replaced)).toHaveLength(8);
  });

  it("moves first to last and last to first, keeping text attached to its ID", () => {
    const original = createMeaningDraft(["первое", "второе", "третье"]);
    const last = reduce(original, { type: "move", id: original.rows[0]!.id, beforeId: null });
    expect(last.rows).toEqual([original.rows[1], original.rows[2], original.rows[0], original.rows[3]]);
    expect(getMeaningValues(last)).toEqual(["второе", "третье", "первое"]);
    const first = reduce(last, { type: "move", id: original.rows[0]!.id, beforeId: original.rows[1]!.id });
    expect(first.rows).toEqual(original.rows);
  });

  it("does not move the empty slot or accept a stale destination", () => {
    const draft = createMeaningDraft(["первое", "второе"]);
    expect(reduce(draft, { type: "move", id: draft.rows[2]!.id, beforeId: draft.rows[0]!.id })).toBe(draft);
    expect(reduce(draft, { type: "move", id: draft.rows[0]!.id, beforeId: 999 })).toBe(draft);
    expect(reduce(draft, { type: "change", id: 999, text: "потерянное поле" })).toBe(draft);
  });

  it("does not create a slot for whitespace or while composing a character", () => {
    const empty = createMeaningDraft([]);
    const id = empty.rows[0]!.id;
    expect(reduce(empty, { type: "change", id, text: "  " }).rows).toHaveLength(1);
    const composing = reduce(empty, { type: "change", id, text: "记", composing: true });
    expect(composing.rows).toHaveLength(1);
    const completed = reduce(composing, { type: "change", id, text: "记忆" });
    expect(completed.rows.map((row) => row.text)).toEqual(["记忆", ""]);
  });

  it("serializes trimmed values in order without silently deduplicating them", () => {
    const draft = createMeaningDraft(["  память  ", "ПАМЯТЬ"]);
    expect(getMeaningValues(draft)).toEqual(["память", "ПАМЯТЬ"]);
  });

  it("resets text and order from saved values with fresh field identities", () => {
    const values = ["первое", "второе"];
    const original = createMeaningDraft(values);
    const moved = reduce(original, { type: "move", id: original.rows[0]!.id, beforeId: null });
    const reset = reduce(moved, { type: "reset", values });
    expect(getMeaningValues(reset)).toEqual(values);
    expect(reset.rows.every((row) => row.id >= original.nextId)).toBe(true);
    const cleared = reduce(reset, { type: "reset", values: [] });
    expect(cleared.rows).toHaveLength(1);
    expect(getMeaningValues(cleared)).toEqual([]);
  });
});
