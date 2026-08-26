import { resolveReviewDirection } from "./direction.js";
import { FreeReviewPicker } from "./freeReview.js";
import type { ReviewDirection, ReviewMode, VocabularyWord } from "./models.js";
import type { RandomSource } from "./random.js";
import { shuffled } from "./random.js";
import { isScheduledReviewCandidate } from "./scheduledReview.js";

export interface ReviewSessionCard {
  wordId: string;
  direction: ReviewDirection;
  mode: ReviewMode;
}

export type ReviewSessionPhase =
  | "idle"
  | "marking-shown"
  | "show-failed"
  | "ready"
  | "answering";

export interface ReviewSessionSnapshot {
  card: ReviewSessionCard | null;
  revealed: boolean;
  phase: ReviewSessionPhase;
}

export class ReviewSession {
  private readonly freeReview = new FreeReviewPicker();
  private scheduledIds: string[] = [];
  private card: ReviewSessionCard | null = null;
  private revealed = false;
  private phase: ReviewSessionPhase = "idle";

  constructor(
    private readonly random: RandomSource,
    private readonly now: () => Date,
  ) {}

  get snapshot(): ReviewSessionSnapshot {
    return {
      card: this.card === null ? null : { ...this.card },
      revealed: this.revealed,
      phase: this.phase,
    };
  }

  removeWord(wordId: string): boolean {
    const scheduledIds = this.scheduledIds.filter((id) => id !== wordId);
    let changed = scheduledIds.length !== this.scheduledIds.length || this.freeReview.remove(wordId);

    this.scheduledIds = scheduledIds;
    if (this.card?.wordId === wordId) {
      this.card = null;
      this.revealed = false;
      this.phase = "idle";
      changed = true;
    }

    return changed;
  }

  reconcile(words: readonly VocabularyWord[]): boolean {
    const now = this.now();
    const activeWords = words.filter((word) => !word.isDeleted);
    const activeIds = new Set(activeWords.map((word) => word.id));
    let changed = this.freeReview.reconcile(activeWords);

    if (this.card !== null && !activeIds.has(this.card.wordId)) {
      this.card = null;
      this.revealed = false;
      this.phase = "idle";
      changed = true;
    }

    const currentId = this.card?.wordId;
    const dueWords = activeWords.filter(
      (word) => word.id !== currentId && isScheduledReviewCandidate(word, now),
    );
    const dueIds = new Set(dueWords.map((word) => word.id));
    const scheduledIds = this.scheduledIds.filter((id) => dueIds.has(id));
    const queuedIds = new Set(scheduledIds);
    const addedWords = dueWords.filter((word) => !queuedIds.has(word.id));

    if (scheduledIds.length !== this.scheduledIds.length || addedWords.length > 0) {
      this.scheduledIds = [
        ...scheduledIds,
        ...shuffled(addedWords, this.random).map((word) => word.id),
      ];
      changed = true;
    }

    return changed;
  }

  beginPresentation(words: readonly VocabularyWord[]): ReviewSessionCard | null {
    this.reconcile(words);

    if (this.card !== null) {
      if (this.phase !== "show-failed") {
        return null;
      }

      this.phase = "marking-shown";
      return { ...this.card };
    }

    const activeWords = words.filter((word) => !word.isDeleted);
    let selected: VocabularyWord | null = null;
    let mode: ReviewMode = "free";

    const scheduledId = this.scheduledIds.shift();
    if (scheduledId !== undefined) {
      selected = activeWords.find((word) => word.id === scheduledId) ?? null;
      mode = "scheduled";
    } else {
      selected = this.freeReview.next(activeWords, this.now(), this.random);
    }

    if (selected === null) {
      return null;
    }

    this.card = {
      wordId: selected.id,
      direction: resolveReviewDirection(selected.lastDirection, this.random),
      mode,
    };
    this.revealed = false;
    this.phase = "marking-shown";
    return { ...this.card };
  }

  presentationReady(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "marking-shown") {
      return false;
    }

    this.phase = "ready";
    return true;
  }

  presentationFailed(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "marking-shown") {
      return false;
    }

    this.phase = "show-failed";
    return true;
  }

  reveal(): boolean {
    if (this.card === null || this.phase !== "ready" || this.revealed) {
      return false;
    }

    this.revealed = true;
    return true;
  }

  beginAnswer(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "ready" || !this.revealed) {
      return false;
    }

    this.phase = "answering";
    return true;
  }

  answerFailed(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "answering") {
      return false;
    }

    this.phase = "ready";
    return true;
  }

  completeAnswer(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "answering") {
      return false;
    }

    this.card = null;
    this.revealed = false;
    this.phase = "idle";
    return true;
  }

  reset(): void {
    this.freeReview.reset();
    this.scheduledIds = [];
    this.card = null;
    this.revealed = false;
    this.phase = "idle";
  }
}
