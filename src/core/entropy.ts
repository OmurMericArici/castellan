import { instantiateAttrs } from "./archie";
import type { NodeId } from "./graph";
import { lazy } from "./lazy";
import { passable } from "./path";
import { createRng, hash2, hashString } from "./rng";
import { emit, schedule } from "./world";
import type { Handler, World } from "./world";

/**
 * Entropy (ADR-0021): the world changes even when nobody acts. In v0.1 it
 * spreads leaves that have a `spread` rule (new trees near old ones) and wears
 * down what people build.
 */
export class Entropy {
  readonly handlers: ReadonlyMap<string, Handler>;

  constructor(private readonly world: World) {
    this.handlers = new Map<string, Handler>([
      ["entropy.spread", (_w, d) => this.spread((d as { type: string }).type)],
      ["entropy.regrow", () => this.regrow()],
    ]);
  }

  start(): void {
    for (const t of this.world.registry.types.values()) {
      if (t.spread) schedule(this.world, this.world.time + t.spread.every, { handler: "entropy.spread", data: { type: t.name } });
    }
    if (this.regrowing().length) schedule(this.world, this.world.time + 1, { handler: "entropy.regrow" });
  }

  private regrowing(): { type: string; attr: string; rate: number; max: number }[] {
    const out: { type: string; attr: string; rate: number; max: number }[] = [];
    for (const t of this.world.registry.types.values()) {
      for (const a of t.attrs.values()) if (a.regrow && a.max !== undefined) out.push({ type: t.name, attr: a.name, rate: a.regrow, max: a.max });
    }
    return out;
  }

  /** Once a day, attributes with a `regrow` rate come back toward their max (berries, springs). */
  private regrow(): void {
    const w = this.world;
    for (const r of this.regrowing()) {
      for (const n of w.graph.nodes({ kind: "entity", type: r.type })) {
        const v = typeof n.attrs[r.attr] === "number" ? (n.attrs[r.attr] as number) : r.max;
        if (v < r.max) emit(w, "entropy", { kind: "node.attrs", id: n.id, attrs: { [r.attr]: Math.min(r.max, v + r.rate) } });
      }
    }
    schedule(w, w.time + 1, { handler: "entropy.regrow" });
  }

  /** Condition starts falling once something is finished. A lazy value: no ticking. */
  startWear(id: NodeId): void {
    const w = this.world;
    const node = w.graph.node(id);
    const rule = node ? w.registry.types.get(node.type)?.build : undefined;
    if (!node || !rule || rule.wear <= 0) return;
    emit(w, "entropy", { kind: "node.attrs", id, attrs: { condition: lazy(1, -rule.wear, w.time, 0, 1) } });
  }

  private spread(typeName: string): void {
    const w = this.world;
    const type = w.registry.types.get(typeName);
    const rule = type?.spread;
    const space = w.space;
    if (!type || !rule || !space) return;
    const parents = [...w.graph.nodes({ kind: "entity", type: typeName })].filter((n) => n.pos);
    const rng = createRng(w.seed).fork(hash2(Math.floor(w.time * 1000), hashString(`entropy:${typeName}`)));
    const field = rule.field ? space.fields.get(rule.field) : undefined;
    let made = 0;
    for (let tries = 0; parents.length > 0 && made < rule.count && tries < rule.count * 10; tries++) {
      const parent = parents[rng.int(0, parents.length - 1)]!;
      const a = rng.next() * Math.PI * 2;
      const r = 1 + rng.next() * rule.radius;
      const x = parent.pos!.x + Math.cos(a) * r;
      const y = parent.pos!.y + Math.sin(a) * r;
      // Must be walkable land; with a water field rule this means the shore.
      if (!passable(space, x, y)) continue;
      if (field && field.sample(x, y) < 0.3) continue;
      const id = w.graph.allocateNodeId();
      const attrs = instantiateAttrs(type, createRng(w.seed).fork(hash2(id, 0x656e7472)));
      emit(w, "entropy", { kind: "node.created", node: { id, kind: "entity", type: typeName, pos: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }, attrs } });
      made++;
    }
    schedule(w, w.time + rule.every, { handler: "entropy.spread", data: { type: typeName } });
  }
}

