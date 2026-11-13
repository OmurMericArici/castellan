import type { NodeId, Vec2 } from "./graph";

/** Buckets of nearby points for "what is within r of here" queries. Engine-side, not world truth. */
export class SpatialIndex {
  private readonly buckets = new Map<number, { id: NodeId; pos: Vec2 }[]>();

  constructor(private readonly cell = 8) {}

  private key(cx: number, cy: number): number {
    return cy * 100_003 + cx;
  }

  insert(id: NodeId, pos: Vec2): void {
    const k = this.key(Math.floor(pos.x / this.cell), Math.floor(pos.y / this.cell));
    const list = this.buckets.get(k);
    if (list) list.push({ id, pos });
    else this.buckets.set(k, [{ id, pos }]);
  }

  /** Everything inside the box [minX, maxX] × [minY, maxY]. */
  inBox(minX: number, minY: number, maxX: number, maxY: number): { id: NodeId; pos: Vec2 }[] {
    const out: { id: NodeId; pos: Vec2 }[] = [];
    for (let cy = Math.floor(minY / this.cell); cy <= Math.floor(maxY / this.cell); cy++) {
      for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx++) {
        for (const e of this.buckets.get(this.key(cx, cy)) ?? []) {
          if (e.pos.x >= minX && e.pos.x <= maxX && e.pos.y >= minY && e.pos.y <= maxY) out.push(e);
        }
      }
    }
    return out;
  }
}
