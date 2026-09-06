import type { VocabularyWord } from "../../domain/index.js";

export type WordsSortKey = "recent" | "alphabetical" | "level";
export type WordsSortDirection = "ascending" | "descending";

export interface WordsSortState {
  key: WordsSortKey;
  direction: WordsSortDirection;
}

export const DEFAULT_WORDS_SORT_DIRECTIONS = {
  recent: "descending",
  alphabetical: "ascending",
  level: "ascending",
} as const satisfies Readonly<Record<WordsSortKey, WordsSortDirection>>;

export const DEFAULT_WORDS_SORT: WordsSortState = {
  key: "recent",
  direction: DEFAULT_WORDS_SORT_DIRECTIONS.recent,
};

export function selectWordsSort(current: WordsSortState, key: WordsSortKey): WordsSortState {
  if (current.key !== key) {
    return { key, direction: DEFAULT_WORDS_SORT_DIRECTIONS[key] };
  }

  return {
    key,
    direction: current.direction === "ascending" ? "descending" : "ascending",
  };
}

export function sortWords(
  words: readonly VocabularyWord[],
  sort: WordsSortState,
): VocabularyWord[] {
  const factor = sort.direction === "ascending" ? 1 : -1;

  return [...words].sort((left, right) => {
    const primary = sort.key === "alphabetical"
      ? left.learningText.localeCompare(right.learningText)
      : sort.key === "level"
        ? left.level - right.level
        : left.createdAt.localeCompare(right.createdAt);
    if (primary !== 0) return primary * factor;

    const byText = left.learningText.localeCompare(right.learningText);
    if (byText !== 0) return byText;
    return left.id.localeCompare(right.id);
  });
}
