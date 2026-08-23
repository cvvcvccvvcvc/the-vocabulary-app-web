import type { ReviewMode, VocabularyWord } from "./models.js";
import type { RandomSource } from "./random.js";
import { shuffled } from "./random.js";

export const REVIEW_INTERVAL_DAYS = [0, 1, 2, 4, 7, 14, 14, 14, 14, 14] as const;

export function clampLevel(level: number): number {
  return Math.max(0, Math.min(9, Math.trunc(level)));
}

export function intervalDaysForLevel(level: number): number {
  return REVIEW_INTERVAL_DAYS[clampLevel(level)] ?? 0;
}

export function isScheduledReviewCandidate(word: VocabularyWord, now: Date): boolean {
  if (word.isDeleted) {
    return false;
  }

  if (word.lastReviewedAt === null || word.nextReviewAt === null) {
    return true;
  }

  return new Date(word.nextReviewAt).getTime() <= now.getTime();
}

export function scheduledReviewQueue(
  words: readonly VocabularyWord[],
  now: Date,
  random: RandomSource,
): VocabularyWord[] {
  return shuffled(
    words.filter((word) => isScheduledReviewCandidate(word, now)),
    random,
  );
}

export function applyReviewAnswer(
  word: VocabularyWord,
  correct: boolean,
  mode: ReviewMode,
  now: Date,
): VocabularyWord {
  const timestamp = now.toISOString();
  const nextLevel =
    mode === "scheduled"
      ? clampLevel(word.level + (correct ? 1 : -1))
      : clampLevel(word.level);
  const nextReviewAt =
    mode === "scheduled"
      ? new Date(now.getTime() + intervalDaysForLevel(nextLevel) * 86_400_000).toISOString()
      : word.nextReviewAt;

  return {
    ...word,
    level: nextLevel,
    nextReviewAt,
    correctCount: word.correctCount + (correct ? 1 : 0),
    wrongCount: word.wrongCount + (correct ? 0 : 1),
    lastAnswerWasWrong: !correct,
    lastReviewedAt: timestamp,
    progressUpdatedAt: timestamp,
    updatedAt: timestamp,
  };
}

