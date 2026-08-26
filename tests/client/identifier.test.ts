import { describe, expect, it } from "vitest";
import {
  ReviewTransitionTracker,
  createOperationId,
} from "../../src/client/lib/identifier.js";
import type { ReviewSessionTransition } from "../../src/domain/index.js";

const transition: ReviewSessionTransition = {
  answer: { wordId: "word-1", correct: true, mode: "scheduled" },
  shown: { wordId: "word-2", direction: "known-to-learning" },
};

describe("createOperationId", () => {
  it("uses randomUUID when the browser provides it", () => {
    const expected = "123e4567-e89b-42d3-a456-426614174000";
    const cryptoProvider = {
      randomUUID: () => expected,
    } as Crypto;

    expect(createOperationId(cryptoProvider)).toBe(expected);
  });

  it("creates a valid version 4 UUID without randomUUID", () => {
    const cryptoProvider = {
      getRandomValues: (array: Uint8Array) => {
        array.fill(0);
        return array;
      },
    } as unknown as Crypto;

    expect(createOperationId(cryptoProvider)).toBe("00000000-0000-4000-8000-000000000000");
  });
});

describe("ReviewTransitionTracker", () => {
  it("keeps one immutable transition available for retry", () => {
    let nextId = 0;
    const tracker = new ReviewTransitionTracker(() => `operation-${nextId += 1}`);

    const first = tracker.begin(transition);

    expect(first).toEqual({ operationId: "operation-1", ...transition });
    expect(tracker.pending).toBe(first);
    expect(tracker.begin({ ...transition, answer: { ...transition.answer, correct: false } }))
      .toBeNull();
    expect(tracker.pending).toBe(first);
  });

  it("does not let a stale completion clear the current operation", () => {
    const tracker = new ReviewTransitionTracker(() => "operation-1");
    const current = tracker.begin(transition);

    expect(tracker.complete("stale-operation")).toBe(false);
    expect(tracker.pending).toBe(current);
    expect(tracker.complete("operation-1")).toBe(true);
    expect(tracker.pending).toBeNull();
  });
});
