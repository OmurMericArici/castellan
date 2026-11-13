import { instantiateAttrs, requireType } from "./archie";
import { evaluate } from "./expr";
import type { Scope, Value } from "./expr";
import type { Attrs, EdgeId, GraphNode, NodeId, Vec2 } from "./graph";
import { isLazy, lazy, readLazy, timeToReach, withRate } from "./lazy";
import type { LazyValue } from "./lazy";
import type { NumberSource, TypeDef } from "./packs";
import { findPath, passable, pathLength, pointAlong } from "./path";
import type { Ticket } from "./queue";
import { createRng, hash2, hashString } from "./rng";
import { SpatialIndex } from "./spatial";
import { isNight } from "./time";
import { createEdge, createNode, emit, schedule } from "./world";
import type { Handler, World } from "./world";

/**
 * Adam runs the people (ADR-0020, ADR-0024): wakes them on their events, scores
 * their goals, picks an action, walks them leg by leg, and records what they see
 * as shared knowledge. Packs decide what people want and why; Adam is the machinery.
 */
export interface AdamOptions {
  /** Walking speed in cells per day. */
  speed: number;
  sightDay: number;
  sightNight: number;
  /** Longest time a person goes without re-thinking, in days. */
  maxIdle: number;
}

export const DEFAULT_ADAM: AdamOptions = { speed: 160, sightDay: 6, sightNight: 2, maxIdle: 0.25 };

/** A tier-1 goal above this (plus the person's determination) takes over. */
const URGENT = 0.6;
/** How much determination raises the bar for being interrupted (ADR-0016 addendum). */
const DETERMINATION_SHIELD = 0.3;
/** Bonus for keeping the current action, scaled by determination × commitment. */
const COMMIT_BONUS = 0.25;
/** A sighting older than this (days) is worth refreshing when seen again. */
const REFRESH_AFTER = 5;

interface Runtime {
  wake?: Ticket;
  leg: Ticket[];
  heading?: number;
  needEdges: Map<string, EdgeId>;
  known: Set<NodeId>;
  knownPositions: Vec2[];
  knownCounts: Map<string, number>;
}

export interface Choice {
  action: string;
  score: number;
}

export class Adam {
  readonly handlers: ReadonlyMap<string, Handler>;
  /** Last decision per person, for the UI and tests. Engine-side, not world truth. */
  readonly lastChoice = new Map<NodeId, { reason: string; scores: Choice[] }>();
  private readonly rt = new Map<NodeId, Runtime>();
  private readonly mindNodes = new Map<string, NodeId>();
  private index: SpatialIndex | undefined;
  private indexedNodes = -1;

  constructor(
    private readonly world: World,
    private readonly opts: AdamOptions = DEFAULT_ADAM,
  ) {
    const reg = world.registry;
    requireType(reg, "Person", "entity");
    requireType(reg, "Sighting", "knowledge");
    for (const e of ["knows", "about", "has"]) {
      if (!reg.edges.has(e)) throw new Error(`Adam needs the "${e}" edge type (from the core pack)`);
    }
    this.handlers = new Map<string, Handler>([
      ["adam.wake", (_w, d) => this.decide((d as { person: NodeId }).person, (d as { reason: string }).reason)],
      ["adam.arrive", (_w, d) => this.arrive(d as { person: NodeId; depart: number })],
      ["adam.see", (_w, d) => this.see(d as { person: NodeId; subject: NodeId })],
    ]);
  }

  private get types(): TypeDef[] {
    return [...this.world.registry.types.values()];
  }

  people(): GraphNode[] {
    return [...this.world.graph.nodes({ kind: "entity", type: "Person" })];
  }

  /** Give everyone their mind and wake them, slightly staggered. */
  start(): void {
    const w = this.world;
    for (const t of this.types.filter((t) => t.kind === "mind")) {
      const existing = [...w.graph.nodes({ kind: "mind", type: t.name })][0];
      this.mindNodes.set(t.name, existing ? existing.id : createNode(w, "adam", { kind: "mind", type: t.name, attrs: {} }));
    }
    for (const p of this.people()) {
      const rt = this.runtime(p.id);
      const rng = createRng(w.seed).fork(hash2(p.id, 0x61646d31));
      for (const t of this.types) {
        if (t.role !== "need" && t.role !== "goal") continue;
        const mind = this.mindNodes.get(t.name)!;
        if (w.graph.edgesOf(p.id, "has").some((e) => e.to === mind)) continue;
        const fromData: Attrs = {};
        if (t.need) fromData["level"] = lazy(this.num(t.need.start, { self: selfScope(p) }, rng), 0, w.time, 0, 1);
        const id = createEdge(w, "adam", { type: "has", from: p.id, to: mind, fromData });
        if (t.need) rt.needEdges.set(t.name, id);
      }
      schedule(w, w.time + rng.next() * 0.01, { handler: "adam.wake", data: { person: p.id, reason: "start" } });
    }
  }

  /** Molly's signals (dusk, dawn) reach everyone at once. */
  wakeAll(reason: string): void {
    for (const p of this.people()) this.decide(p.id, reason);
  }

  /** Where a person is at time t (interpolated along their leg while walking). */
  positionOf(id: NodeId, t = this.world.time): Vec2 | undefined {
    const leg = this.world.activities.get(id)?.leg;
    const node = this.world.graph.node(id);
    if (!leg) return node?.pos;
    if (t <= leg.depart) return leg.path[0];
    if (t >= leg.arrive) return leg.path[leg.path.length - 1];
    const len = pathLength(leg.path);
    return pointAlong(leg.path, ((t - leg.depart) / (leg.arrive - leg.depart)) * len);
  }

  needLevels(id: NodeId, t = this.world.time): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, eid] of this.runtime(id).needEdges) {
      const level = this.world.graph.edge(eid)?.fromData["level"];
      if (isLazy(level)) out[name] = readLazy(level, t);
    }
    return out;
  }

  knownCount(id: NodeId): number {
    return this.runtime(id).known.size;
  }

  // ---------------------------------------------------------------- deciding

  private decide(id: NodeId, reason: string): void {
    const w = this.world;
    const person = w.graph.node(id);
    if (!person || !w.space) return;
    const rt = this.runtime(id);
    if (rt.wake) w.queue.cancel(rt.wake);
    rt.wake = undefined;

    const now = w.time;
    const act = w.activities.get(id);
    const current = act?.action ?? "";
    const legDone = act?.leg ? now >= act.leg.arrive - 1e-9 : false;
    const ongoing = act !== undefined && !legDone;
    const commitment = !ongoing ? 0 : act.leg ? 0.5 + 0.5 * clamp01((now - act.leg.depart) / (act.leg.arrive - act.leg.depart)) : 0.5;
    const determination = typeof person.attrs["determination"] === "number" ? person.attrs["determination"] : 0.5;

    const scope = this.scope(person, current);
    const goals = this.types
      .filter((t) => t.goal)
      .map((t) => ({ name: t.name, tier: t.goal!.tier, weight: clamp01(this.num(t.goal!.weight, scope)) }));
    const bar = URGENT + determination * commitment * DETERMINATION_SHIELD;
    const urgent = goals.filter((g) => g.tier === 1 && g.weight > bar).map((g) => g.name);

    const scores: Choice[] = [];
    for (const t of this.types) {
      if (!t.action) continue;
      let score = 0;
      let helpsUrgent = false;
      for (const g of goals) {
        const src = t.action.serves.get(g.name);
        if (!src) continue;
        const c = this.num(src, scope);
        score += g.weight * c;
        if (c > 0 && urgent.includes(g.name)) helpsUrgent = true;
      }
      if (urgent.length && !helpsUrgent) continue;
      if (t.name === current && ongoing) score += determination * commitment * COMMIT_BONUS;
      scores.push({ action: t.name, score });
    }
    scores.sort((a, b) => b.score - a.score);
    this.lastChoice.set(id, { reason, scores });
    const chosen = scores[0]?.action ?? current;

    if (!(chosen === current && ongoing)) {
      this.interrupt(id, rt);
      this.begin(person, chosen, rt);
    }
    this.updateRates(person, rt);
    this.scheduleWake(person, rt, determination);
  }

  private interrupt(id: NodeId, rt: Runtime): void {
    const w = this.world;
    const leg = w.activities.get(id)?.leg;
    for (const t of rt.leg) w.queue.cancel(t);
    rt.leg = [];
    if (leg) {
      const pos = this.positionOf(id)!;
      emit(w, "adam", { kind: "node.moved", id, pos: round2(pos) });
    }
  }

  private begin(person: GraphNode, action: string, rt: Runtime): void {
    const type = this.world.registry.types.get(action);
    const verb = type?.action?.verb ?? "rest";
    if (verb === "explore" && this.walk(person, action, this.exploreTarget(person, rt), rt)) return;
    if ((verb === "wander" || verb === "explore") && this.walk(person, action, this.wanderTarget(person), rt)) return;
    emit(this.world, "adam", { kind: "activity", person: person.id, activity: { action, startedAt: this.world.time } });
  }

  private walk(person: GraphNode, action: string, targets: Vec2[], rt: Runtime): boolean {
    const w = this.world;
    const from = person.pos!;
    for (const to of targets) {
      const path = findPath(w.space!, from, to);
      if (!path || path.length < 2) continue;
      const len = pathLength(path);
      if (len < 0.5) continue;
      const depart = w.time;
      const arrive = depart + len / this.opts.speed;
      const leg = { path: path.map(round2), depart, arrive };
      emit(w, "adam", { kind: "activity", person: person.id, activity: { action, startedAt: depart, leg } });
      rt.heading = Math.atan2(to.y - from.y, to.x - from.x);
      rt.leg.push(schedule(w, arrive, { handler: "adam.arrive", data: { person: person.id, depart } }));
      this.scheduleSights(person.id, leg, rt);
      return true;
    }
    return false;
  }

  private arrive(d: { person: NodeId; depart: number }): void {
    const w = this.world;
    const leg = w.activities.get(d.person)?.leg;
    if (!leg || leg.depart !== d.depart) return;
    this.runtime(d.person).leg = [];
    emit(w, "adam", { kind: "node.moved", id: d.person, pos: leg.path[leg.path.length - 1]! });
    this.decide(d.person, "arrived");
  }

  private updateRates(person: GraphNode, rt: Runtime): void {
    const w = this.world;
    const doing = w.activities.get(person.id)?.action ?? "";
    const scope = this.scope(person, doing);
    for (const [name, eid] of rt.needEdges) {
      const rule = w.registry.types.get(name)?.need;
      const edge = w.graph.edge(eid);
      const level = edge?.fromData["level"];
      if (!rule || !edge || !isLazy(level)) continue;
      const rate = this.num(rule.rate, scope);
      if (rate !== level.rate) {
        emit(w, "adam", { kind: "edge.data", id: eid, end: "from", data: { level: withRate(level, w.time, rate) } });
      }
    }
  }

  /** Wake again when a need crosses a line that matters, or after maxIdle at the latest. */
  private scheduleWake(person: GraphNode, rt: Runtime, determination: number): void {
    const w = this.world;
    const now = w.time;
    let at = now + this.opts.maxIdle;
    const leg = w.activities.get(person.id)?.leg;
    if (leg && leg.arrive > now) at = Math.max(at, leg.arrive + 1e-6);
    for (const [name, eid] of rt.needEdges) {
      const rule = w.registry.types.get(name)?.need;
      const level = w.graph.edge(eid)?.fromData["level"];
      if (!rule || !isLazy(level)) continue;
      for (const line of [rule.urgentAt, Math.min(0.99, rule.urgentAt + determination * DETERMINATION_SHIELD), 0.05]) {
        const t = timeToReach(level as LazyValue, line, now);
        if (t !== undefined && t > now + 1e-6 && t < at) at = t;
      }
    }
    rt.wake = schedule(w, at, { handler: "adam.wake", data: { person: person.id, reason: "need" } });
  }

  // ---------------------------------------------------------------- choosing where to go

  private rngFor(id: NodeId, salt: string) {
    return createRng(this.world.seed).fork(hash2(hash2(id, Math.floor(this.world.time * 10_000)), hashString(salt)));
  }

  /** Toward the unknown, biased by fertile land and the current heading; leg length is Lévy-like. */
  private exploreTarget(person: GraphNode, rt: Runtime): Vec2[] {
    const space = this.world.space!;
    const rng = this.rngFor(person.id, "explore");
    const from = person.pos!;
    const fertility = space.fields.get("fertility");
    const dist = Math.min(40, 6 * Math.pow(1 - rng.next(), -1 / 1.5));
    const base = rng.next() * Math.PI * 2;
    const options: { p: Vec2; score: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = base + (i * Math.PI * 2) / 12;
      const p = { x: from.x + Math.cos(a) * dist, y: from.y + Math.sin(a) * dist };
      if (!passable(space, p.x, p.y, { maxWater: 0.3, slopeCost: 0 })) continue;
      let nearest = 20;
      for (const k of rt.knownPositions) nearest = Math.min(nearest, Math.hypot(k.x - p.x, k.y - p.y));
      const novelty = nearest / 20;
      const fert = fertility?.sample(p.x, p.y) ?? 0.5;
      const persist = rt.heading === undefined ? 0.5 : (Math.cos(a - rt.heading) + 1) / 2;
      options.push({ p, score: 0.5 * novelty + 0.3 * fert + 0.2 * persist + 0.1 * rng.next() });
    }
    return options.sort((a, b) => b.score - a.score).slice(0, 4).map((o) => o.p);
  }

  private wanderTarget(person: GraphNode): Vec2[] {
    const space = this.world.space!;
    const rng = this.rngFor(person.id, "wander");
    const from = person.pos!;
    const out: Vec2[] = [];
    for (let i = 0; i < 8; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 2 + rng.next() * 6;
      const p = { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d };
      if (passable(space, p.x, p.y, { maxWater: 0.3, slopeCost: 0 })) out.push(p);
    }
    return out;
  }

  // ---------------------------------------------------------------- seeing and knowing

  private spatial(): SpatialIndex {
    const g = this.world.graph;
    if (!this.index || this.indexedNodes !== g.nodeCount) {
      const memorable = new Set(this.types.filter((t) => t.memorable).map((t) => t.name));
      this.index = new SpatialIndex(8);
      for (const n of g.nodes({ kind: "entity" })) if (n.pos && memorable.has(n.type)) this.index.insert(n.id, n.pos);
      this.indexedNodes = g.nodeCount;
    }
    return this.index;
  }

  /** Everything that will come into view along the leg gets a sight event at that moment. */
  private scheduleSights(id: NodeId, leg: { path: readonly Vec2[]; depart: number; arrive: number }, rt: Runtime): void {
    const w = this.world;
    const r = isNight(leg.depart) ? this.opts.sightNight : this.opts.sightDay;
    const xs = leg.path.map((p) => p.x);
    const ys = leg.path.map((p) => p.y);
    const len = pathLength(leg.path);
    const candidates = this.spatial().inBox(Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r);
    for (const c of candidates) {
      if (rt.known.has(c.id) && !this.stale(id, c.id)) continue;
      for (let d = 0; d <= len + 1e-9; d += 0.5) {
        const p = pointAlong(leg.path, d);
        if (Math.hypot(p.x - c.pos.x, p.y - c.pos.y) <= r) {
          const t = leg.depart + (len === 0 ? 0 : (d / len) * (leg.arrive - leg.depart));
          rt.leg.push(schedule(w, Math.max(t, w.time), { handler: "adam.see", data: { person: id, subject: c.id } }));
          break;
        }
      }
    }
  }

  private stale(person: NodeId, subject: NodeId): boolean {
    const edge = this.knowsEdge(person, subject);
    const learnedAt = edge?.fromData["learnedAt"];
    return typeof learnedAt === "number" && this.world.time - learnedAt > REFRESH_AFTER;
  }

  private knowsEdge(person: NodeId, subject: NodeId) {
    const g = this.world.graph;
    for (const about of g.edgesOf(subject, "about")) {
      const claim = about.from;
      const k = g.edgesOf(person, "knows").find((e) => e.to === claim);
      if (k) return k;
    }
    return undefined;
  }

  /** A shared claim per thing-at-a-place; seeing it again refreshes the person's link (ADR-0015). */
  private see(d: { person: NodeId; subject: NodeId }): void {
    const w = this.world;
    const g = w.graph;
    const subject = g.node(d.subject);
    if (!subject?.pos || !g.node(d.person)) return;
    const at = round2(subject.pos);
    let claim = g
      .edgesOf(d.subject, "about")
      .map((e) => g.node(e.from))
      .find((c) => c && c.type === "Sighting" && c.attrs["x"] === at.x && c.attrs["y"] === at.y)?.id;
    if (claim === undefined) {
      const sighting = requireType(w.registry, "Sighting", "knowledge");
      claim = createNode(w, "adam", { kind: "knowledge", type: "Sighting", attrs: instantiateAttrs(sighting, createRng(0), { x: at.x, y: at.y }) });
      createEdge(w, "adam", { type: "about", from: claim, to: d.subject });
    }
    const existing = g.edgesOf(d.person, "knows").find((e) => e.to === claim);
    if (existing) {
      emit(w, "adam", { kind: "edge.data", id: existing.id, end: "from", data: { learnedAt: w.time } });
    } else {
      createEdge(w, "adam", { type: "knows", from: d.person, to: claim, fromData: { learnedAt: w.time, confidence: 1 } });
    }
    const rt = this.runtime(d.person);
    if (!rt.known.has(d.subject)) {
      rt.known.add(d.subject);
      rt.knownPositions.push(at);
      rt.knownCounts.set(subject.type, (rt.knownCounts.get(subject.type) ?? 0) + 1);
    }
  }

  // ---------------------------------------------------------------- helpers

  private runtime(id: NodeId): Runtime {
    let rt = this.rt.get(id);
    if (rt) return rt;
    rt = { leg: [], needEdges: new Map(), known: new Set(), knownPositions: [], knownCounts: new Map() };
    // Rebuild from the graph, so Adam can pick up a world that already ran.
    const g = this.world.graph;
    for (const e of g.edgesOf(id, "has")) {
      const mind = g.node(e.to);
      if (mind && this.world.registry.types.get(mind.type)?.need) rt.needEdges.set(mind.type, e.id);
    }
    for (const k of g.edgesOf(id, "knows")) {
      for (const about of g.edgesOf(k.to, "about")) {
        const s = g.node(about.to);
        if (!s?.pos || rt.known.has(s.id)) continue;
        rt.known.add(s.id);
        rt.knownPositions.push(s.pos);
        rt.knownCounts.set(s.type, (rt.knownCounts.get(s.type) ?? 0) + 1);
      }
    }
    this.rt.set(id, rt);
    return rt;
  }

  private scope(person: GraphNode, doing: string): Scope {
    const rt = this.runtime(person.id);
    const knows: Scope = {};
    for (const t of this.types) if (t.memorable) knows[t.name] = rt.knownCounts.get(t.name) ?? 0;
    return {
      needs: this.needLevels(person.id),
      night: isNight(this.world.time),
      knows,
      self: selfScope(person),
      doing,
    };
  }

  private num(src: NumberSource, scope: Scope, rng?: ReturnType<typeof createRng>): number {
    if ("literal" in src) return src.literal;
    const v: Value = evaluate(src.expr, rng ? { scope, rng } : { scope });
    if (typeof v !== "number") throw new Error(`expression "${src.expr.source}" must give a number, got ${JSON.stringify(v)}`);
    return v;
  }
}

function selfScope(n: GraphNode): Scope {
  const out: Scope = {};
  for (const [k, v] of Object.entries(n.attrs)) if (v === null || typeof v !== "object") out[k] = v;
  return out;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function round2(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}
