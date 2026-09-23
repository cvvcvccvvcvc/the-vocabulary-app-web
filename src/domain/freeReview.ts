import type { VocabularyWord } from "./models.js";
import type { RandomSource } from "./random.js";

const ANSWER_WEIGHTS = [4, 3, 2, 1, 1, 1, 1] as const;
const TOTAL_ANSWER_WEIGHT = ANSWER_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

function daysSince(value: string | null, now: Date): number {
  if (value === null) {
    return 30;
  }

  return Math.max(0, now.getTime() - new Date(value).getTime()) / 86_400_000;
}

export function freeReviewWeight(word: VocabularyWord, now: Date): number {
  const ageInDays = Math.min(30, daysSince(word.lastSeenAt, now));
  const levelBoost = 1 + 0.5 * (9 - word.level);
  const ageBoost = 1 + 0.5 * Math.log2(1 + ageInDays);
  const answers = word.recentAnswers ?? (word.lastReviewedAt === null ? [] : [!word.lastAnswerWasWrong]);
  let missedWeight = 0;
  for (const [index, correct] of answers.slice(0, ANSWER_WEIGHTS.length).entries()) {
    const weight = ANSWER_WEIGHTS[index] ?? 0;
    if (!correct) missedWeight += weight;
  }
  const errorBoost = 1 + 5 * missedWeight / TOTAL_ANSWER_WEIGHT;

  return levelBoost * ageBoost * errorBoost;
}

function weightedChoice(
  words: readonly VocabularyWord[],
  weights: readonly number[],
  random: RandomSource,
): VocabularyWord | null {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return words[0] ?? null;
  }

  let threshold = random.next() * total;
  for (let index = 0; index < words.length; index += 1) {
    threshold -= weights[index] ?? 0;
    if (threshold <= 0) {
      return words[index] ?? null;
    }
  }

  return words.at(-1) ?? null;
}

export class FreeReviewPicker {
  private recent: string[] = [];

  remove(wordId: string): boolean {
    const recent = this.recent.filter((id) => id !== wordId);
    const changed = recent.length !== this.recent.length;

    this.recent = recent;
    return changed;
  }

  reconcile(allWords: readonly VocabularyWord[]): boolean {
    const liveIds = new Set(
      allWords.filter((word) => !word.isDeleted).map((word) => word.id),
    );
    const recent = this.recent.filter((id) => liveIds.has(id));
    const changed = recent.length !== this.recent.length;

    this.recent = recent;
    return changed;
  }

  next(
    allWords: readonly VocabularyWord[],
    now: Date,
    random: RandomSource,
  ): VocabularyWord | null {
    const words = allWords.filter((word) => !word.isDeleted);
    if (words.length === 0) {
      this.recent = [];
      return null;
    }

    this.reconcile(words);

    const cooldownSize = Math.min(9, Math.max(0, words.length - 1));
    const blocked = new Set(this.recent.slice(-cooldownSize));
    const candidates = words.filter((word) => !blocked.has(word.id));
    const eligible = candidates.length > 0 ? candidates : words;
    const selected = weightedChoice(
      eligible,
      eligible.map((word) => freeReviewWeight(word, now)),
      random,
    );
    if (selected === null) return null;

    this.recent.push(selected.id);
    this.recent = cooldownSize === 0 ? [] : this.recent.slice(-cooldownSize);
    return selected;
  }

  reset(): void {
    this.recent = [];
  }
}
