export const MAX_MEANINGS = 8;

export interface MeaningRow {
  id: number;
  text: string;
}

export interface MeaningDraft {
  rows: MeaningRow[];
  nextId: number;
}

export type MeaningAction =
  | { type: "change"; id: number; text: string; composing?: boolean }
  | { type: "settle"; activeId: number | null }
  | { type: "remove"; id: number; activeId: number | null }
  | { type: "move"; id: number; beforeId: number | null }
  | { type: "reset"; values: readonly string[] };

export function hasMeaning(row: MeaningRow): boolean {
  return row.text.trim() !== "";
}

// A cleared, focused row is the empty slot until editing moves elsewhere.
function normalize(draft: MeaningDraft, activeId: number | null = null): MeaningDraft {
  const activeEmpty = draft.rows.find((row) => row.id === activeId && !hasMeaning(row));
  const empty = activeEmpty ?? draft.rows.find((row) => !hasMeaning(row));
  const rows = draft.rows.filter((row) => hasMeaning(row) || row === activeEmpty);
  let nextId = draft.nextId;

  if (rows.length < MAX_MEANINGS && activeEmpty === undefined) {
    rows.push(empty === undefined ? { id: nextId++, text: "" } : empty.text === "" ? empty : { ...empty, text: "" });
  }

  return nextId === draft.nextId && rows.length === draft.rows.length && rows.every((row, index) => row === draft.rows[index])
    ? draft
    : { rows, nextId };
}

export function createMeaningDraft(values: readonly string[]): MeaningDraft {
  return normalize({ rows: values.map((text, id) => ({ id, text })), nextId: values.length });
}

export function getMeaningValues(draft: MeaningDraft): string[] {
  return draft.rows.filter(hasMeaning).map((row) => row.text.trim());
}

export function meaningDraftReducer(draft: MeaningDraft, action: MeaningAction): MeaningDraft {
  switch (action.type) {
    case "change": {
      if (!draft.rows.some((row) => row.id === action.id)) return draft;
      const changed = {
        ...draft,
        rows: draft.rows.map((row) => row.id === action.id ? { ...row, text: action.text } : row),
      };
      return action.composing ? changed : normalize(changed, action.id);
    }
    case "settle":
      return normalize(draft, action.activeId);
    case "remove": {
      if (!draft.rows.some((row) => row.id === action.id && hasMeaning(row))) return draft;
      return normalize({ ...draft, rows: draft.rows.filter((row) => row.id !== action.id) }, action.activeId);
    }
    case "move": {
      const filled = draft.rows.filter(hasMeaning);
      const moved = filled.find((row) => row.id === action.id);
      if (moved === undefined || action.beforeId === action.id) return draft;
      const remaining = filled.filter((row) => row !== moved);
      const destination = action.beforeId === null
        ? remaining.length
        : remaining.findIndex((row) => row.id === action.beforeId);
      if (destination < 0) return draft;
      remaining.splice(destination, 0, moved);
      return normalize({ ...draft, rows: [...remaining, ...draft.rows.filter((row) => !hasMeaning(row))] });
    }
    case "reset":
      return normalize({
        rows: action.values.map((text, index) => ({ id: draft.nextId + index, text })),
        nextId: draft.nextId + action.values.length,
      });
  }
}
