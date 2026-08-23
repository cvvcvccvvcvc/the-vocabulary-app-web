import type { VocabularyWord } from "./models.js";
import type { RandomSource } from "./random.js";
import { randomInRange } from "./random.js";

const BATCH_SIZE = 20;
const REFILL_THRESHOLD = 5;

function daysSince(value: string | null, now: Date): number {
  if (value === null) {
    return 30;
  }

  return Math.max(0, now.getTime() - new Date(value).getTime()) / 86_400_000;
}

export function freeReviewWeight(
  word: VocabularyWord,
  now: Date,
  random: RandomSource,
  lastSeenAtOverride?: string | null,
): number {
  const ageInDays = daysSince(lastSeenAtOverride ?? word.lastSeenAt, now);
  const levelBoost = 1 + 0.35 * (9 - word.level);
  const ageBoost = 1 + Math.log2(1 + ageInDays);
  const errorBoost = word.lastAnswerWasWrong ? 5 : 1;
  const jitter = randomInRange(random, 0.85, 1.15);

  return Math.max(0.0001, levelBoost * ageBoost * errorBoost * jitter);
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
  private queue: string[] = [];
  private recent: string[] = [];

  next(
    allWords: readonly VocabularyWord[],
    now: Date,
    random: RandomSource,
  ): VocabularyWord | null {
    const words = allWords.filter((word) => !word.isDeleted);
    if (words.length === 0) {
      this.queue = [];
      this.recent = [];
      return null;
    }

    const liveIds = new Set(words.map((word) => word.id));
    this.queue = this.queue.filter((id) => liveIds.has(id));
    this.recent = this.recent.filter((id) => liveIds.has(id));

    if (this.queue.length === 0) {
      this.refill(words, now, random);
    }

    const selectedId = this.queue.shift();
    if (selectedId === undefined) {
      return null;
    }

    const cooldownSize = Math.min(9, Math.max(0, words.length - 1));
    this.recent.push(selectedId);
    this.recent = cooldownSize === 0 ? [] : this.recent.slice(-cooldownSize);

    if (this.queue.length < REFILL_THRESHOLD) {
      this.refill(words, now, random);
    }

    return words.find((word) => word.id === selectedId) ?? null;
  }

  reset(): void {
    this.queue = [];
    this.recent = [];
  }

  private refill(
    words: readonly VocabularyWord[],
    now: Date,
    random: RandomSource,
  ): void {
    const cooldownSize = Math.min(9, Math.max(0, words.length - 1));
    const virtualRecent = [...this.recent];
    const virtualSeenAt = new Map<string, string>();

    for (const queuedId of this.queue) {
      virtualRecent.push(queuedId);
      virtualRecent.splice(0, Math.max(0, virtualRecent.length - cooldownSize));
      virtualSeenAt.set(queuedId, now.toISOString());
    }

    const targetCount = Math.max(0, BATCH_SIZE - this.queue.length);
    for (let index = 0; index < targetCount; index += 1) {
      const blocked = new Set(virtualRecent.slice(-cooldownSize));
      let candidates = words.filter((word) => !blocked.has(word.id));

      if (candidates.length === 0) {
        candidates = [...words];
      }

      const weights = candidates.map((word) =>
        freeReviewWeight(word, now, random, virtualSeenAt.get(word.id)),
      );
      const selected = weightedChoice(candidates, weights, random);
      if (selected === null) {
        break;
      }

      this.queue.push(selected.id);
      virtualRecent.push(selected.id);
      virtualRecent.splice(0, Math.max(0, virtualRecent.length - cooldownSize));
      virtualSeenAt.set(selected.id, now.toISOString());
    }
  }
}
