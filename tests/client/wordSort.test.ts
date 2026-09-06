import { describe, expect, it } from "vitest";
import type { VocabularyWord } from "../../src/domain/index.js";
import {
  DEFAULT_WORDS_SORT,
  selectWordsSort,
  sortWords,
  type WordsSortState,
} from "../../src/client/lib/wordSort.js";

function makeWord(
  id: string,
  learningText: string,
  level: number,
  createdAt: string,
): VocabularyWord {
  return {
    id,
    learningText,
    meanings: [id],
    comment: "",
    level,
    createdAt,
    updatedAt: createdAt,
    contentUpdatedAt: createdAt,
    progressUpdatedAt: createdAt,
    isDeleted: false,
    deletedAt: null,
    nextReviewAt: null,
    lastSeenAt: null,
    lastReviewedAt: null,
    lastDirection: null,
    correctCount: 0,
    wrongCount: 0,
    lastAnswerWasWrong: false,
    version: 1,
  };
}

const words = [
  makeWord("b", "Beta", 2, "2026-01-02T00:00:00.000Z"),
  makeWord("a", "Alpha", 2, "2026-01-01T00:00:00.000Z"),
  makeWord("c", "Gamma", 0, "2026-01-03T00:00:00.000Z"),
];

function ids(sort: WordsSortState): string[] {
  return sortWords(words, sort).map((word) => word.id);
}

describe("word sorting", () => {
  it("uses an explicit default direction for every newly selected criterion", () => {
    const alphabetical = selectWordsSort(DEFAULT_WORDS_SORT, "alphabetical");
    const level = selectWordsSort({ key: "alphabetical", direction: "descending" }, "level");

    expect(DEFAULT_WORDS_SORT).toEqual({ key: "recent", direction: "descending" });
    expect(alphabetical).toEqual({ key: "alphabetical", direction: "ascending" });
    expect(level).toEqual({ key: "level", direction: "ascending" });
  });

  it("reverses the active criterion on the second selection", () => {
    const alphabetical = selectWordsSort(DEFAULT_WORDS_SORT, "alphabetical");
    expect(selectWordsSort(alphabetical, "alphabetical")).toEqual({
      key: "alphabetical",
      direction: "descending",
    });
  });

  it("sorts every criterion in both directions with stable tie breakers", () => {
    expect(ids(DEFAULT_WORDS_SORT)).toEqual(["c", "b", "a"]);
    expect(ids({ key: "recent", direction: "ascending" })).toEqual(["a", "b", "c"]);
    expect(ids({ key: "alphabetical", direction: "ascending" })).toEqual(["a", "b", "c"]);
    expect(ids({ key: "alphabetical", direction: "descending" })).toEqual(["c", "b", "a"]);
    expect(ids({ key: "level", direction: "ascending" })).toEqual(["c", "a", "b"]);
    expect(ids({ key: "level", direction: "descending" })).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the source collection", () => {
    const original = [...words];
    sortWords(words, { key: "alphabetical", direction: "ascending" });
    expect(words).toEqual(original);
  });
});
