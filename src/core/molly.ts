import type { Adam } from "./adam";
import { instantiateAttrs } from "./archie";
import { evaluate } from "./expr";
import type { Scope } from "./expr";
import type { GraphNode, NodeId, Vec2 } from "./graph";
import type { NumberSource, TypeDef } from "./packs";
import { passable } from "./path";
import { buildTypes, homeOf, planOf } from "./projects";
import { createRng, hash2, hashString } from "./rng";
import { DUSK, nextAt } from "./time";
import { createEdge, createNode, emit, schedule } from "./world";
import type { Handler, World } from "./world";

/**
 * Molly (ADR-0012, ADR-0025): recognises day and night, places concepts where a
 * need, material and a spot line up, and recognises and names groups (villages).
 * She reads everything and writes only through events.
 */
export const CONCEPT_THRESHOLD = 0.25;
/** How far around a candidate spot known material counts. */
const MATERIAL_RADIUS = 15;

export class Molly {
  readonly handlers: ReadonlyMap<string, Handler>;

  constructor(
    private readonly world: World,
    private readonly adam: Adam,
  ) {
    this.handlers = new Map<string, Handler>([
      ["molly.dusk", () => this.turn("dusk", DUSK)],
      ["molly.dawn", () => this.turn("dawn", 0)],
    ]);
  }

  start(): void {
    const t = this.world.time;
    schedule(this.world, nextAt(t, DUSK), { handler: "molly.dusk" });
    schedule(this.world, nextAt(t, 0), { handler: "molly.dawn" });
  }

  private turn(name: string, fraction: number): void {
    emit(this.world, "molly", { kind: "signal", name });
    if (name === "dawn") this.placeConcepts();
    this.adam.wakeAll(name);
    schedule(this.world, nextAt(this.world.time, fraction), { handler: `molly.${name}` });
  }

  // ---------------------------------------------------------------- concepts

  /** Each morning: for people without a home or a plan, is there a good place for one? */
  placeConcepts(): void {
    const w = this.world;
    for (const type of buildTypes(w)) {
      for (const person of this.adam.people()) {
        if (!person.pos || planOf(w, person.id) || homeOf(w, person.id)) continue;
        const best = this.bestSpot(type, person);
        if (!best) continue;
        const rng = createRng(w.seed).fork(hash2(hash2(person.id, Math.floor(w.time)), hashString(`molly:${type.name}`)));
        if (best.mu < CONCEPT_THRESHOLD || rng.next() >= best.mu) continue;
        const attrs = instantiateAttrs(type, rng, { state: "planned", stock: 0, worked: 0 });
        const id = createNode(w, "molly", { kind: "entity", type: type.name, pos: best.pos, attrs });
        createEdge(w, "molly", { type: type.build!.planner, from: person.id, to: id });
      }
    }
  }

  /**
   * The fuzzy triple (ADR-0008): μ = need × spot × material × company.
   * Exposed for the UI and tests.
   */
  bestSpot(type: TypeDef, person: GraphNode): { pos: Vec2; mu: number; parts: Record<string, number> } | undefined {
    const w = this.world;
    const space = w.space;
    const rule = type.build;
    if (!space || !rule || !person.pos) return undefined;
    const need = clamp01(this.num(rule.when, this.adam.scopeFor(person)));
    if (need <= 0) return undefined;
    const others = [...w.graph.nodes({ kind: "entity", type: type.name })].filter((n) => n.pos);
    // What the person remembers about the material, not what is really there.
    const material = this.adam
      .knowledge(person.id, rule.material)
      .map((k) => ({ pos: k.pos, amount: typeof k.it[rule.materialAttr] === "number" ? (k.it[rule.materialAttr] as number) : 0 }))
      .filter((m) => m.amount > 0);
    const rng = createRng(w.seed).fork(hash2(hash2(person.id, Math.floor(w.time)), hashString("molly:spots")));

    let best: { pos: Vec2; mu: number; parts: Record<string, number> } | undefined;
    for (let i = 0; i < 24; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 2 + rng.next() * 10;
      const p = { x: person.pos.x + Math.cos(a) * r, y: person.pos.y + Math.sin(a) * r };
      if (!passable(space, p.x, p.y, { maxWater: 0.2, slopeCost: 0 })) continue;
      const fieldScope: Scope = {};
      for (const [name, f] of space.fields) fieldScope[name] = f.sample(p.x, p.y);
      const spot = clamp01(this.num(rule.spot, { field: fieldScope }));
      let nearest = Infinity;
      for (const o of others) nearest = Math.min(nearest, Math.hypot(o.pos!.x - p.x, o.pos!.y - p.y));
      if (nearest < rule.near.min) continue;
      const company = others.length === 0 || nearest <= rule.near.prefer ? 1 : Math.max(0.6, rule.near.prefer / nearest);
      let wood = 0;
      for (const m of material) if (Math.hypot(m.pos.x - p.x, m.pos.y - p.y) <= MATERIAL_RADIUS) wood += m.amount;
      const mat = Math.min(1, wood / rule.amount);
      const mu = need * spot * mat * company;
      if (!best || mu > best.mu) best = { pos: { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }, mu, parts: { need, spot, material: mat, company } };
    }
    return best;
  }

  // ---------------------------------------------------------------- recognising groups

  /** A member was finished: join a group nearby, or form a new one if enough are close. */
  recognize(memberId: NodeId): void {
    const w = this.world;
    const g = w.graph;
    const member = g.node(memberId);
    if (!member?.pos) return;
    for (const group of [...w.registry.types.values()].filter((t) => t.recognize?.members === member.type)) {
      const rule = group.recognize!;
      const inGroup = (n: GraphNode) => g.edgesOf(n.id, rule.memberEdge).some((e) => e.from === n.id);
      if (inGroup(member)) continue;
      // Join a group if close to any of its members (not just its centre).
      const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) <= rule.radius;
      const existing = [...g.nodes({ kind: "entity", type: group.name })].find((v) =>
        g.edgesOf(v.id, rule.memberEdge).some((e) => {
          const m = g.node(e.from);
          return m?.pos !== undefined && near(m.pos, member.pos!);
        }),
      );
      if (existing) {
        createEdge(w, "molly", { type: rule.memberEdge, from: memberId, to: existing.id });
        this.recentre(existing.id, rule.memberEdge);
        continue;
      }
      const loose = [...g.nodes({ kind: "entity", type: member.type })].filter(
        (n) => n.pos && n.attrs["state"] === "built" && !inGroup(n) && Math.hypot(n.pos.x - member.pos!.x, n.pos.y - member.pos!.y) <= rule.radius,
      );
      const mu = clamp01((loose.length - rule.min + 1) / (rule.full - rule.min + 1));
      if (mu < rule.formAt) continue;
      const rng = createRng(w.seed).fork(hash2(memberId, hashString(`molly:${group.name}`)));
      const pos = centroid(loose.map((n) => n.pos!));
      // Names should not repeat: re-roll a few times if one is taken.
      const taken = new Set([...g.nodes({ type: group.name })].map((n) => n.attrs["name"]));
      let attrs = instantiateAttrs(group, rng);
      for (let i = 0; i < 10 && taken.has(attrs["name"] ?? null); i++) attrs = instantiateAttrs(group, rng);
      const id = createNode(w, "molly", { kind: "entity", type: group.name, pos, attrs });
      for (const n of loose) createEdge(w, "molly", { type: rule.memberEdge, from: n.id, to: id });
    }
  }

  private recentre(groupId: NodeId, memberEdge: string): void {
    const g = this.world.graph;
    const members = g
      .edgesOf(groupId, memberEdge)
      .map((e) => g.node(e.from)?.pos)
      .filter((p): p is Vec2 => p !== undefined);
    if (members.length) emit(this.world, "molly", { kind: "node.moved", id: groupId, pos: centroid(members) });
  }

  private num(src: NumberSource, scope: Scope): number {
    if ("literal" in src) return src.literal;
    const v = evaluate(src.expr, { scope });
    if (typeof v !== "number") throw new Error(`expression "${src.expr.source}" must give a number`);
    return v;
  }
}

function centroid(ps: Vec2[]): Vec2 {
  const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
  const y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
