export class RingBuffer<T extends { ts: number }> {
  private readonly items: T[] = [];

  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error('RingBuffer capacity must be positive');
    }
  }

  push(item: T): void {
    if (this.items.length === this.capacity) {
      this.items.shift();
    }

    this.items.push(item);
  }

  toArray(): T[] {
    return [...this.items];
  }

  since(ts?: number): T[] {
    if (ts === undefined || Number.isNaN(ts)) {
      return this.toArray();
    }

    return this.items.filter((item) => item.ts > ts);
  }

  get size(): number {
    return this.items.length;
  }
}
