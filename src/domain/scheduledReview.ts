import type { ReviewMode, VocabularyWord } from "./models.js";
import type { RandomSource } from "./random.js";
import { shuffled } from "./random.js";

export const REVIEW_INTERVAL_HOURS = [16, 16, 96, 168, 336, 504, 720, 1080, 1440, 2160] as const;
const MAX_INTERVAL_HOURS = 180 * 24;

export function clampLevel(level: number): number {
  return Math.max(0, Math.min(9, Math.trunc(level)));
}

export function intervalHoursForLevel(level: number): number {
  return REVIEW_INTERVAL_HOURS[clampLevel(level)] ?? 16;
}

function scheduledOutcome(
  word: VocabularyWord,
  correct: boolean,
): { level: number; intervalHours: number } {
  const level = clampLevel(word.level);
  if (!correct) {
    return { level: level === 0 ? 0 : 1, intervalHours: 16 };
  }

  if (level === 9) {
    return {
      level,
      intervalHours: Math.min(
        MAX_INTERVAL_HOURS,
        Math.max(intervalHoursForLevel(9), Math.round((word.scheduledIntervalHours ?? 0) * 1.5)),
      ),
    };
  }

  const nextLevel = level + 1;
  return { level: nextLevel, intervalHours: intervalHoursForLevel(nextLevel) };
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
  const scheduled = mode === "scheduled" ? scheduledOutcome(word, correct) : null;
  const nextReviewAt = scheduled === null
    ? word.nextReviewAt
    : new Date(now.getTime() + scheduled.intervalHours * 3_600_000).toISOString();

  return {
    ...word,
    level: scheduled?.level ?? clampLevel(word.level),
    nextReviewAt,
    scheduledIntervalHours: scheduled === null
      ? word.scheduledIntervalHours
      : scheduled.level === 9 ? scheduled.intervalHours : null,
    correctCount: word.correctCount + (correct ? 1 : 0),
    wrongCount: word.wrongCount + (correct ? 0 : 1),
    lastAnswerWasWrong: !correct,
    recentAnswers: [
      correct,
      ...(word.recentAnswers ?? (word.lastReviewedAt === null ? [] : [!word.lastAnswerWasWrong])),
    ].slice(0, 7),
    lastReviewedAt: timestamp,
    progressUpdatedAt: timestamp,
    updatedAt: timestamp,
  };
}
