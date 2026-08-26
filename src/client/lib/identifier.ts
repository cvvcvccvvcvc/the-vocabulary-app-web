import type { ReviewMode } from "../../domain/index.js";

export function createOperationId(cryptoProvider: Crypto = globalThis.crypto): string {
  if (typeof cryptoProvider.randomUUID === "function") {
    return cryptoProvider.randomUUID();
  }

  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

interface PendingAnswerOperation {
  wordId: string;
  correct: boolean;
  mode: ReviewMode;
  operationId: string;
}

export class AnswerOperationTracker {
  private pending: PendingAnswerOperation | null = null;

  constructor(private readonly createId: () => string = createOperationId) {}

  begin(wordId: string, correct: boolean, mode: ReviewMode): string {
    if (
      this.pending?.wordId === wordId
      && this.pending.correct === correct
      && this.pending.mode === mode
    ) {
      return this.pending.operationId;
    }

    const operationId = this.createId();
    this.pending = { wordId, correct, mode, operationId };
    return operationId;
  }

  complete(): void {
    this.pending = null;
  }
}
