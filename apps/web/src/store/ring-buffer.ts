/**
 * Fixed-capacity ring buffer backed by Float32Array with zero dynamic memory allocation.
 * Used for sparkline metric histories (capacity = 120 ticks).
 */

export class RingBuffer {
  readonly capacity: number;
  private readonly buffer: Float32Array;
  private head: number = 0; // Index of the next write
  private count: number = 0; // Number of items stored (0 <= count <= capacity)

  constructor(capacity: number = 120) {
    if (capacity <= 0 || !Number.isInteger(capacity)) {
      throw new Error(
        `RingBuffer capacity must be a positive integer, received: ${String(capacity)}`,
      );
    }
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
  }

  /**
   * Current number of stored data points.
   */
  get length(): number {
    return this.count;
  }

  /**
   * Append a value to the ring buffer, overwriting the oldest value if full.
   */
  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Read the most recently pushed value, or undefined if empty.
   */
  latest(): number | undefined {
    if (this.count === 0) {
      return undefined;
    }
    const latestIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[latestIndex];
  }

  /**
   * Return a standard JavaScript number array in chronological order (oldest to newest).
   */
  toArray(): number[] {
    if (this.count === 0) {
      return [];
    }
    const result = new Array<number>(this.count);
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      result[i] = this.buffer[idx] ?? 0;
    }
    return result;
  }

  /**
   * Reset ring buffer without reallocating underlying Float32Array.
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(0);
  }
}
