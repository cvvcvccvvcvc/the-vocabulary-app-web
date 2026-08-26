import type { ReviewSessionTransition } from "../../domain/index.js";
import type { ReviewTransitionRequest } from "../../shared/contracts.js";

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

export class ReviewTransitionTracker {
  private operation: ReviewTransitionRequest | null = null;

  constructor(private readonly createId: () => string = createOperationId) {}

  get pending(): ReviewTransitionRequest | null {
    return this.operation;
  }

  begin(transition: ReviewSessionTransition): ReviewTransitionRequest | null {
    if (this.operation !== null) {
      return null;
    }

    this.operation = {
      operationId: this.createId(),
      answer: { ...transition.answer },
      shown: { ...transition.shown },
    };
    return this.operation;
  }

  isCurrent(operationId: string): boolean {
    return this.operation?.operationId === operationId;
  }

  complete(operationId: string): boolean {
    if (!this.isCurrent(operationId)) {
      return false;
    }

    this.operation = null;
    return true;
  }

  reset(): void {
    this.operation = null;
  }
}
