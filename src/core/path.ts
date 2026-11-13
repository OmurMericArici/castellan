import type { Vec2 } from "./graph";
import type { Space } from "./space";

/**
 * Walking costs derived from the fields (ADR-0015): water blocks, slopes cost more.
 * A* on the cell grid, 8 directions, then straightened where the line is clear.
 */
export interface PathOptions {
  /** Cells with more water than this can't be entered. */
  maxWater: number;
  /** Extra cost per unit of height difference between neighbouring cells. */
  slopeCost: number;
}

export const DEFAULT_PATH: PathOptions = { maxWater: 0.5, slopeCost: 25 };

export function passable(space: Space, x: number, y: number, opts: PathOptions = DEFAULT_PATH): boolean {
  if (!space.contains(x, y)) return false;
  const water = space.fields.get("water");
  return !water || water.at(x, y) <= opts.maxWater;
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** A path from `from` to `to` as waypoints (both included), or undefined if unreachable. */
export function findPath(space: Space, from: Vec2, to: Vec2, opts: PathOptions = DEFAULT_PATH): Vec2[] | undefined {
  if (!passable(space, to.x, to.y, opts)) return undefined;
  const w = space.width;
  const h = space.height;
  const height = space.fields.get("height");
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  const tx = Math.floor(to.x);
  const ty = Math.floor(to.y);
  const start = sy * w + sx;
  const goal = ty * w + tx;
  if (start === goal) return [from, to];

  const g = new Float64Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const open = new MinHeap();
  const hcost = (i: number): number => Math.hypot((i % w) - tx, Math.floor(i / w) - ty);
  g[start] = 0;
  open.push(start, hcost(start));

  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const hc = height?.at(cx, cy) ?? 0;
    for (const [dx, dy, base] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni] || !passable(space, nx + 0.5, ny + 0.5, opts)) continue;
      // No cutting corners across water.
      if (dx !== 0 && dy !== 0 && (!passable(space, cx + dx + 0.5, cy + 0.5, opts) || !passable(space, cx + 0.5, cy + dy + 0.5, opts))) {
        continue;
      }
      const slope = Math.abs((height?.at(nx, ny) ?? 0) - hc);
      const cost = g[cur]! + base * (1 + opts.slopeCost * slope);
      if (cost < g[ni]!) {
        g[ni] = cost;
        came[ni] = cur;
        open.push(ni, cost + hcost(ni));
      }
    }
  }
  if (came[goal] === -1) return undefined;

  const cells: Vec2[] = [];
  for (let i = goal; i !== start; i = came[i]!) cells.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
  cells.reverse();
  cells[cells.length - 1] = to;
  return straighten(space, [from, ...cells], opts);
}

/** Drop waypoints that a straight, dry line can skip. */
function straighten(space: Space, pts: Vec2[], opts: PathOptions): Vec2[] {
  const out: Vec2[] = [pts[0]!];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!clearLine(space, pts[anchor]!, pts[i]!, opts)) {
      out.push(pts[i - 1]!);
      anchor = i - 1;
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function clearLine(space: Space, a: Vec2, b: Vec2, opts: PathOptions): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!passable(space, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, opts)) return false;
  }
  return true;
}

export function pathLength(path: readonly Vec2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  return len;
}

/** The point at distance d along a path. */
export function pointAlong(path: readonly Vec2[], d: number): Vec2 {
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg;
  }
  return path[path.length - 1]!;
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.ids.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}
