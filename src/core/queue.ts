/**
 * Priority queue of future happenings, earliest first (ADR-0007).
 * Ties at the same time run in the order they were scheduled, so runs are deterministic.
 */
export interface Ticket {
  readonly id: number;
}

interface Entry<T> {
  readonly time: number;
  readonly seq: number;
  readonly item: T;
}

export class EventQueue<T> {
  private heap: Entry<T>[] = [];
  private seq = 0;
  private pending = new Set<number>();
  private cancelled = new Set<number>();

  get size(): number {
    return this.pending.size;
  }

  schedule(time: number, item: T): Ticket {
    if (!Number.isFinite(time)) throw new Error(`cannot schedule at time ${time}`);
    const entry = { time, seq: this.seq++, item };
    this.heap.push(entry);
    this.pending.add(entry.seq);
    this.up(this.heap.length - 1);
    return { id: entry.seq };
  }

  /** Cancelled entries are dropped lazily when they reach the top. */
  cancel(ticket: Ticket): void {
    if (this.pending.delete(ticket.id)) this.cancelled.add(ticket.id);
  }

  peekTime(): number | undefined {
    this.dropCancelled();
    return this.heap[0]?.time;
  }

  pop(): { time: number; item: T } | undefined {
    this.dropCancelled();
    const top = this.heap[0];
    if (!top) return undefined;
    this.pending.delete(top.seq);
    this.removeTop();
    return { time: top.time, item: top.item };
  }

  private dropCancelled(): void {
    let top = this.heap[0];
    while (top && this.cancelled.has(top.seq)) {
      this.cancelled.delete(top.seq);
      this.removeTop();
      top = this.heap[0];
    }
  }

  private removeTop(): void {
    const last = this.heap.pop();
    if (last && this.heap.length > 0) {
      this.heap[0] = last;
      this.down(0);
    }
  }

  private less(i: number, j: number): boolean {
    const a = this.heap[i]!;
    const b = this.heap[j]!;
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }

  private swap(i: number, j: number): void {
    const t = this.heap[i]!;
    this.heap[i] = this.heap[j]!;
    this.heap[j] = t;
  }

  private up(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private down(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) return;
      this.swap(i, m);
      i = m;
    }
  }
}
