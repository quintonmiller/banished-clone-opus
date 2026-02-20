export class Random {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed | 0;
    if (this.state === 0) this.state = 1;
  }

  /** xorshift32 */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 0xFFFFFFFF;
  }

  /** Returns float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns int in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with given probability */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Get internal RNG state for serialization */
  getState(): number {
    return this.state;
  }

  /** Restore internal RNG state from serialization */
  setState(s: number): void {
    this.state = s;
    if (this.state === 0) this.state = 1;
  }

  /** Shuffle array in place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
