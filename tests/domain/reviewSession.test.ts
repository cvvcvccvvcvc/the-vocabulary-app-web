import { describe, expect, it } from "vitest";
import { ReviewSession, SeededRandomSource } from "../../src/domain/index.js";
import { makeWord } from "./fixtures.js";

const now = new Date("2026-08-26T12:00:00.000Z");
const later = "2026-09-01T12:00:00.000Z";

function makeSession(seed = 1): ReviewSession {
  return new ReviewSession(new SeededRandomSource(seed), () => now);
}

function completeCurrent(session: ReviewSession, wordId: string): void {
  expect(session.presentationReady(wordId)).toBe(true);
  expect(session.reveal()).toBe(true);
  expect(session.beginAnswer(wordId)).toBe(true);
  expect(session.completeAnswer(wordId)).toBe(true);
}

describe("ReviewSession", () => {
  it("preserves the current card, direction, reveal state, and queue position", () => {
    const words = [makeWord({ id: "one" }), makeWord({ id: "two" })];
    const session = makeSession(10);
    const current = session.beginPresentation(words);

    expect(current).not.toBeNull();
    expect(session.presentationReady(current!.wordId)).toBe(true);
    expect(session.reveal()).toBe(true);

    const beforeNavigation = session.snapshot;
    expect(session.reconcile(words)).toBe(false);
    expect(session.beginPresentation(words)).toBeNull();
    expect(session.snapshot).toEqual(beforeNavigation);
  });

  it("keeps an in-flight presentation stable and retries the same card", () => {
    const words = [makeWord({ id: "one" }), makeWord({ id: "two" })];
    const session = makeSession(20);
    const current = session.beginPresentation(words);

    expect(current).not.toBeNull();
    expect(session.beginPresentation(words)).toBeNull();
    expect(session.presentationFailed(current!.wordId)).toBe(true);
    expect(session.beginPresentation(words)).toEqual(current);
  });

  it("appends newly due cards without rebuilding the remaining scheduled queue", () => {
    const words = [
      makeWord({ id: "one" }),
      makeWord({ id: "two" }),
      makeWord({ id: "three" }),
    ];
    const control = makeSession(30);
    const session = makeSession(30);
    const controlFirst = control.beginPresentation(words)!;
    const first = session.beginPresentation(words)!;

    expect(first).toEqual(controlFirst);
    completeCurrent(control, controlFirst.wordId);
    completeCurrent(session, first.wordId);

    const reviewedWords = words.map((word) =>
      word.id === first.wordId
        ? { ...word, lastReviewedAt: now.toISOString(), nextReviewAt: later }
        : word,
    );
    const expectedNext = control.beginPresentation(reviewedWords);
    const actualNext = session.beginPresentation([
      ...reviewedWords,
      makeWord({ id: "newly-added" }),
    ]);

    expect(actualNext?.wordId).toBe(expectedNext?.wordId);
    expect(actualNext?.mode).toBe("scheduled");
  });

  it("serves a newly due card before returning to Free Review", () => {
    const futureWords = [
      makeWord({
        id: "future",
        lastReviewedAt: now.toISOString(),
        nextReviewAt: later,
      }),
    ];
    const session = makeSession(40);
    const freeCard = session.beginPresentation(futureWords)!;

    expect(freeCard.mode).toBe("free");
    const wordsWithNewDueCard = [
      ...futureWords,
      makeWord({ id: "newly-due" }),
    ];
    expect(session.reconcile(wordsWithNewDueCard)).toBe(true);
    expect(session.snapshot.card).toEqual(freeCard);
    completeCurrent(session, freeCard.wordId);

    const next = session.beginPresentation(wordsWithNewDueCard);
    expect(next).toMatchObject({ wordId: "newly-due", mode: "scheduled" });
  });

  it("drops a deleted current card and selects only from active IDs", () => {
    const words = [makeWord({ id: "one" }), makeWord({ id: "two" })];
    const session = makeSession(50);
    const current = session.beginPresentation(words)!;
    const remaining = words.filter((word) => word.id !== current.wordId);

    expect(session.removeWord(current.wordId)).toBe(true);
    expect(session.snapshot).toEqual({ card: null, revealed: false, phase: "idle" });
    expect(session.beginPresentation(remaining)?.wordId).toBe(remaining[0]?.id);
  });
});
