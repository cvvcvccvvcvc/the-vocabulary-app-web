import type { VocabularyWord } from "../../src/domain/index.js";

export function makeWord(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  const createdAt = "2026-08-01T00:00:00.000Z";

  return {
    id: "word-1",
    learningText: "memory",
    meanings: ["память"],
    comment: "",
    level: 0,
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
    ...overrides,
  };
}
