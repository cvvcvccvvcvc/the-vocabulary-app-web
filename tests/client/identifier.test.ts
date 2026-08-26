import { describe, expect, it } from "vitest";
import {
  AnswerOperationTracker,
  createOperationId,
} from "../../src/client/lib/identifier.js";

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

describe("AnswerOperationTracker", () => {
  it("reuses an unanswered operation and clears it after success", () => {
    let nextId = 0;
    const tracker = new AnswerOperationTracker(() => `operation-${nextId += 1}`);

    const first = tracker.begin("word-1", true, "scheduled");
    expect(tracker.begin("word-1", true, "scheduled")).toBe(first);
    expect(tracker.begin("word-1", false, "scheduled")).not.toBe(first);

    const latest = tracker.begin("word-1", false, "scheduled");
    tracker.complete();
    expect(tracker.begin("word-1", false, "scheduled")).not.toBe(latest);
  });
});
