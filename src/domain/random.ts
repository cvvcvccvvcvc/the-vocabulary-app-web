export interface RandomSource {
  next(): number;
}

export class SystemRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

export class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}

export function randomInRange(
  random: RandomSource,
  minimum: number,
  maximum: number,
): number {
  return minimum + (maximum - minimum) * random.next();
}

export function shuffled<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random.next() * (index + 1));
    const value = result[index];
    const swapValue = result[swapIndex];

    if (value !== undefined && swapValue !== undefined) {
      result[index] = swapValue;
      result[swapIndex] = value;
    }
  }

  return result;
}

