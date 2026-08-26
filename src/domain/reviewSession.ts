import { resolveReviewDirection } from "./direction.js";
import { FreeReviewPicker } from "./freeReview.js";
import type { ReviewDirection, ReviewMode, VocabularyWord } from "./models.js";
import type { RandomSource } from "./random.js";
import { shuffled } from "./random.js";
import { applyReviewAnswer, isScheduledReviewCandidate } from "./scheduledReview.js";

export interface ReviewSessionCard {
  wordId: string;
  direction: ReviewDirection;
  mode: ReviewMode;
}

export interface ReviewSessionTransition {
  answer: {
    wordId: string;
    correct: boolean;
    mode: ReviewMode;
  };
  shown: {
    wordId: string;
    direction: ReviewDirection;
  };
}

export type ReviewSessionPhase =
  | "idle"
  | "marking-shown"
  | "show-failed"
  | "ready"
  | "saving-transition"
  | "transition-failed";

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

    const selected = this.takeNext(words);
    if (selected === null) {
      return null;
    }

    this.card = selected;
    this.revealed = false;
    this.phase = "marking-shown";
    return { ...this.card };
  }

  beginTransition(
    words: readonly VocabularyWord[],
    wordId: string,
    correct: boolean,
  ): ReviewSessionTransition | null {
    if (this.card?.wordId !== wordId || this.phase !== "ready" || !this.revealed) {
      return null;
    }

    const answeredCard = { ...this.card };
    const current = words.find((word) => word.id === wordId && !word.isDeleted);
    if (current === undefined) {
      return null;
    }

    const projected = applyReviewAnswer(
      { ...current, lastDirection: answeredCard.direction },
      correct,
      answeredCard.mode,
      this.now(),
    );
    const projectedWords = words.map((word) => (word.id === wordId ? projected : word));
    this.card = null;
    this.revealed = false;
    this.phase = "idle";
    this.reconcile(projectedWords);

    const shownCard = this.takeNext(projectedWords);
    if (shownCard === null) {
      this.card = answeredCard;
      this.revealed = true;
      this.phase = "ready";
      return null;
    }

    this.card = shownCard;
    this.phase = "saving-transition";
    return {
      answer: {
        wordId,
        correct,
        mode: answeredCard.mode,
      },
      shown: {
        wordId: shownCard.wordId,
        direction: shownCard.direction,
      },
    };
  }

  private takeNext(words: readonly VocabularyWord[]): ReviewSessionCard | null {
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

    return {
      wordId: selected.id,
      direction: resolveReviewDirection(selected.lastDirection, this.random),
      mode,
    };
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
    if (
      this.card === null
      || !["ready", "saving-transition", "transition-failed"].includes(this.phase)
      || this.revealed
    ) {
      return false;
    }

    this.revealed = true;
    return true;
  }

  transitionReady(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "saving-transition") {
      return false;
    }

    this.phase = "ready";
    return true;
  }

  transitionFailed(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "saving-transition") {
      return false;
    }

    this.phase = "transition-failed";
    return true;
  }

  retryTransition(wordId: string): boolean {
    if (this.card?.wordId !== wordId || this.phase !== "transition-failed") {
      return false;
    }

    this.phase = "saving-transition";
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
