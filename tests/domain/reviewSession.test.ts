import { describe, expect, it } from "vitest";
import { ReviewSession, SeededRandomSource } from "../../src/domain/index.js";
import { makeWord } from "./fixtures.js";

const now = new Date("2026-08-26T12:00:00.000Z");
const later = "2026-09-01T12:00:00.000Z";

function makeSession(seed = 1): ReviewSession {
  return new ReviewSession(new SeededRandomSource(seed), () => now);
}

function readyCurrent(session: ReviewSession, wordId: string): void {
  expect(session.presentationReady(wordId)).toBe(true);
  expect(session.reveal()).toBe(true);
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

  it("shows the next card while the previous answer is still saving", () => {
    const words = [makeWord({ id: "one" }), makeWord({ id: "two" })];
    const session = makeSession(25);
    const current = session.beginPresentation(words)!;
    readyCurrent(session, current.wordId);

    const transition = session.beginTransition(words, current.wordId, true)!;

    expect(session.snapshot).toMatchObject({
      card: transition.shown,
      revealed: false,
      phase: "saving-transition",
    });
    expect(session.reveal()).toBe(true);
    expect(session.beginTransition(words, transition.shown.wordId, true)).toBeNull();
    expect(session.transitionFailed(transition.shown.wordId)).toBe(true);
    expect(session.snapshot).toMatchObject({ card: transition.shown, revealed: true });
    expect(session.retryTransition(transition.shown.wordId)).toBe(true);
    expect(session.transitionReady(transition.shown.wordId)).toBe(true);
    expect(session.snapshot.phase).toBe("ready");
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
    readyCurrent(control, controlFirst.wordId);
    readyCurrent(session, first.wordId);

    const expectedNext = control.beginTransition(words, controlFirst.wordId, true);
    const actualNext = session.beginTransition([
      ...words,
      makeWord({ id: "newly-added" }),
    ], first.wordId, true);

    expect(actualNext?.shown.wordId).toBe(expectedNext?.shown.wordId);
    expect(session.snapshot.card?.mode).toBe("scheduled");
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
    readyCurrent(session, freeCard.wordId);
    const wordsWithNewDueCard = [
      ...futureWords,
      makeWord({ id: "newly-due" }),
    ];
    expect(session.reconcile(wordsWithNewDueCard)).toBe(true);
    expect(session.snapshot.card).toEqual(freeCard);
    const transition = session.beginTransition(wordsWithNewDueCard, freeCard.wordId, true);
    expect(transition?.shown.wordId).toBe("newly-due");
    expect(session.snapshot.card?.mode).toBe("scheduled");
  });

  it("cycles a one-word deck with the next direction already selected", () => {
    const words = [makeWord({ id: "only" })];
    const session = makeSession(45);
    const current = session.beginPresentation(words)!;
    readyCurrent(session, current.wordId);

    const transition = session.beginTransition(words, current.wordId, true)!;

    expect(transition.shown.wordId).toBe(current.wordId);
    expect(transition.shown.direction).not.toBe(current.direction);
    expect(session.snapshot).toMatchObject({
      card: { wordId: current.wordId, mode: "free" },
      phase: "saving-transition",
    });
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
