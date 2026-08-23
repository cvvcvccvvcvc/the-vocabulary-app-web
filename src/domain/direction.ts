import type { ReviewDirection, VocabularyWord } from "./models.js";
import type { RandomSource } from "./random.js";

export function resolveReviewDirection(
  lastDirection: ReviewDirection | null,
  random: RandomSource,
): ReviewDirection {
  if (lastDirection === "learning-to-known") {
    return "known-to-learning";
  }

  if (lastDirection === "known-to-learning") {
    return "learning-to-known";
  }

  return random.next() < 0.5 ? "learning-to-known" : "known-to-learning";
}

export function markWordShown(
  word: VocabularyWord,
  direction: ReviewDirection,
  now: Date,
): VocabularyWord {
  const timestamp = now.toISOString();

  return {
    ...word,
    lastDirection: direction,
    lastSeenAt: timestamp,
    progressUpdatedAt: timestamp,
    updatedAt: timestamp,
  };
}

