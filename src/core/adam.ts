import { instantiateAttrs, requireType } from "./archie";
import { evaluate } from "./expr";
import type { Compiled, Scope, Value } from "./expr";
import type { Attrs, EdgeId, GraphNode, NodeId, Vec2 } from "./graph";
import { isLazy, lazy, readLazy, timeToReach, withRate, withValue } from "./lazy";
import type { LazyValue } from "./lazy";
import type { Effect, NumberSource, ReactionEvent, Ref, Step, Target, TypeDef } from "./packs";
import { REACTION_EVENTS } from "./packs";
import { findPath, passable, pathLength, pointAlong } from "./path";
import { homeOf, num, planOf } from "./projects";
import type { Ticket } from "./queue";
import { createRng, hash2, hashString } from "./rng";
import type { Rng } from "./rng";
import { SpatialIndex } from "./spatial";
import { isNight } from "./time";
import { createEdge, createNode, emit, schedule } from "./world";
import type { Handler, World } from "./world";

/**
 * Adam runs the people (ADR-0020, 0024, 0026). He knows no actions, only steps:
 * walking (with sight and meetings computed ahead), timed work, moving values,
 * effects. Packs say what an action is made of, when people want it, how they
 * react and how they remember. Adam is the machinery (ADR-0027).
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
/** Close enough to a target to count as there. */
const THERE = 1;
/** Two people don't "meet" again within this many days. */
const MEET_COOLDOWN = 0.5;
/** A knowledge link without a memory rule is refreshed when seen again after this many days. */
const REFRESH_AFTER = 5;

/** A running action: which step, and what it is aimed at. Engine-side; re-deciding rebuilds it. */
interface Program {
  readonly action: string;
  readonly steps: readonly Step[];
  index: number;
  target?: NodeId;
  /** How many times the person has re-followed a moving target in this step. */
  chase?: number;
}

interface Runtime {
  wake?: Ticket;
  /** Tickets for the current step (arrival, sights, meetings, work done). */
  step: Ticket[];
  program?: Program;
  heading?: number;
  needEdges: Map<string, EdgeId>;
  lastMet: Map<NodeId, number>;
  /** Guards against actions that finish instantly over and over at the same moment. */
  instant: { t: number; n: number };
  /** After the guard trips, the next re-think happens no later than this. */
  pauseUntil?: number;
}

export interface Choice {
  action: string;
  score: number;
}

export interface AdamHooks {
  /** A derived entity was finished (Molly recognises groups, Entropy starts wear). */
  onBuilt?: (node: NodeId) => void;
  /** A pack raised a world event (Molly decides who notices it). */
  onEvent?: (name: string, actor: NodeId, about: NodeId | undefined) => void;
}

/** What a reaction knows about why it fired. */
export interface ReactionContext {
  it?: NodeId;
  other?: NodeId;
  action?: string;
  event?: { name: string; known: boolean };
}

/** What a person knows of one thing: the claim, where it says the thing is, and what they remember of it. */
interface Known {
  subject: NodeId;
  claim: NodeId;
  pos: Vec2;
  it: Scope;
}

export class Adam {
  readonly handlers: ReadonlyMap<string, Handler>;
  /** Last decision per person, for the UI and tests. Engine-side, not world truth. */
  readonly lastChoice = new Map<NodeId, { reason: string; scores: Choice[] }>();
  /**
   * Runtime problems in pack rules (an expression reading something that isn't there).
   * The rule is skipped and the world keeps running; the UI shows these.
   */
  readonly warnings: string[] = [];
  hooks: AdamHooks = {};
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
      ["adam.done", (_w, d) => this.done(d as { person: NodeId; startedAt: number })],
      ["adam.see", (_w, d) => this.see(d as { person: NodeId; subject: NodeId })],
      ["adam.meet", (_w, d) => this.meet(d as { a: NodeId; b: NodeId })],
      ["adam.forget", (_w, d) => this.forget(d as { edge: EdgeId; since: number })],
    ]);
  }

  private get types(): TypeDef[] {
    return [...this.world.registry.types.values()];
  }

  /** Living people. The dead stay in the graph and the history but no longer act. */
  people(): GraphNode[] {
    return [...this.world.graph.nodes({ kind: "entity", type: "Person" })].filter((p) => p.attrs["dead"] !== true);
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
        if (t.role !== "need" && t.role !== "goal" && t.role !== "trait") continue;
        const mind = this.mindNodes.get(t.name)!;
        if (w.graph.edgesOf(p.id, "has").some((e) => e.to === mind)) continue;
        const fromData: Attrs = {};
        if (t.need) fromData["level"] = lazy(this.num(t.need.start, { self: selfScope(p) }, rng), 0, w.time, 0, 1);
        // Traits: Adam draws each person's value from the pack's distribution (ADR-0030).
        if (t.role === "trait") fromData["value"] = this.drawTrait(t, p, rng);
        const id = createEdge(w, "adam", { type: "has", from: p.id, to: mind, fromData });
        if (t.need) rt.needEdges.set(t.name, id);
      }
      schedule(w, w.time + rng.next() * 0.01, { handler: "adam.wake", data: { person: p.id, reason: "start" } });
    }
  }

  private drawTrait(t: TypeDef, p: GraphNode, rng: Rng): number {
    const d = t.distribution;
    if (!d) return 0;
    if (d.kind === "expr") return this.num(d.expr, { self: selfScope(p) }, rng);
    const total = d.bins.reduce((a, b) => a + b[2], 0);
    let r = rng.next() * total;
    for (const [from, to, weight] of d.bins) {
      if (r < weight) return from + rng.next() * (to - from);
      r -= weight;
    }
    const last = d.bins[d.bins.length - 1]!;
    return last[1];
  }

  /** A person's trait values. */
  traits(id: NodeId): Record<string, number> {
    const g = this.world.graph;
    const out: Record<string, number> = {};
    for (const e of g.edgesOf(id, "has")) {
      const mind = g.node(e.to);
      if (mind && this.world.registry.types.get(mind.type)?.role === "trait") out[mind.type] = num(e.fromData["value"]);
    }
    return out;
  }

  /** Molly's signals (dusk, dawn) reach everyone at once; packs may react to them. */
  wakeAll(reason: string): void {
    for (const p of this.people()) {
      if ((REACTION_EVENTS as readonly string[]).includes(reason)) this.react(reason as ReactionEvent, p.id, {});
      this.decide(p.id, reason);
    }
  }

  wake(person: NodeId, reason: string): void {
    this.decide(person, reason);
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

  private knowCache = new Map<NodeId, { at: number; list: Known[] }>();
  private scopeCache = new Map<string, { at: number; scope: Scope }>();

  /** Everything the person knows of, newest version of each thing. Cached until the world changes. */
  knowledge(person: NodeId, type?: string): Known[] {
    const at = this.world.log.length;
    let hit = this.knowCache.get(person);
    if (!hit || hit.at !== at) {
      hit = { at, list: this.readKnowledge(person) };
      this.knowCache.set(person, hit);
    }
    if (!type) return hit.list;
    const g = this.world.graph;
    return hit.list.filter((k) => g.node(k.subject)?.type === type);
  }

  private readKnowledge(person: NodeId): Known[] {
    const g = this.world.graph;
    const out: Known[] = [];
    for (const k of g.edgesOf(person, "knows")) {
      if (k.from !== person) continue;
      const claim = g.node(k.to);
      if (!claim) continue;
      for (const a of g.edgesOf(claim.id, "about")) {
        const s = g.node(a.to);
        if (!s) continue;
        out.push({ subject: s.id, claim: claim.id, pos: { x: num(claim.attrs["x"]), y: num(claim.attrs["y"]) }, it: { ...attrScope(claim.attrs), id: s.id } });
      }
    }
    return out;
  }

  knownCount(id: NodeId): number {
    return this.knowledge(id).length;
  }

  /** What a person's mind expressions see right now (also used by Molly). */
  scopeFor(person: GraphNode, doing = this.world.activities.get(person.id)?.action ?? ""): Scope {
    const key = `${person.id}:${doing}`;
    const at = this.world.log.length + this.world.time;
    const hit = this.scopeCache.get(key);
    if (hit && hit.at === at) return hit.scope;
    const scope = this.computeScope(person, doing);
    this.scopeCache.set(key, { at, scope });
    return scope;
  }

  private computeScope(person: GraphNode, doing: string): Scope {
    const knows: Scope = {};
    for (const t of this.types) if (t.memorable) knows[t.name] = 0;
    for (const k of this.knowledge(person.id)) {
      const type = this.world.graph.node(k.subject)?.type;
      if (type && typeof knows[type] === "number") knows[type] = (knows[type] as number) + 1;
    }
    const plan = planOf(this.world, person.id);
    return {
      needs: this.needLevels(person.id),
      night: isNight(this.world.time),
      knows,
      self: selfScope(person),
      doing,
      plan: {
        active: plan !== undefined,
        missing: plan?.missing ?? 0,
        ready: plan?.ready ?? false,
        workLeft: plan ? Math.max(0, plan.rule.work - num(plan.node.attrs["worked"])) : 0,
      },
      home: homeOf(this.world, person.id) !== undefined,
      traits: this.traits(person.id),
      links: this.linkCounts(person.id),
      field: this.fieldsAt(this.positionOf(person.id) ?? person.pos),
    };
  }

  private linkCounts(id: NodeId): Scope {
    const out: Scope = {};
    for (const name of this.world.registry.edges.keys()) out[name] = 0;
    for (const e of this.world.graph.edgesOf(id)) {
      if (e.from !== id) continue;
      const other = this.world.graph.node(e.to);
      if (other?.attrs["dead"] === true) continue;
      out[e.type] = (out[e.type] as number) + 1;
    }
    return out;
  }

  private fieldsAt(pos: Vec2 | undefined): Scope {
    const out: Scope = {};
    const space = this.world.space;
    if (!space || !pos) return out;
    for (const [name, f] of space.fields) out[name] = f.sample(pos.x, pos.y);
    return out;
  }

  /** The person's own end of each edge toward `other`: declared fields default to 0. */
  private bondWith(id: NodeId, other: NodeId | undefined): Scope {
    const out: Scope = {};
    for (const [name, def] of this.world.registry.edges) {
      const rec: Scope = {};
      for (const [f, a] of def.fromData) rec[f] = a.type === "number" ? 0 : a.type === "boolean" ? false : "";
      out[name] = rec;
    }
    if (other === undefined) return out;
    for (const e of this.world.graph.edgesOf(id)) {
      if (e.from !== id || e.to !== other) continue;
      out[e.type] = { ...(out[e.type] as Scope), ...attrScope(e.fromData) };
    }
    return out;
  }

  private relWith(id: NodeId, other: NodeId | undefined): Scope {
    const rel: Scope = {};
    for (const name of this.world.registry.edges.keys()) rel[name] = false;
    if (other !== undefined) for (const e of this.world.graph.edgesOf(id)) if (e.from === id && e.to === other) rel[e.type] = true;
    return rel;
  }

  // ---------------------------------------------------------------- deciding

  /** `finished`: the current action just ended, so it no longer counts as ongoing. */
  private decide(id: NodeId, reason: string, finished = false): void {
    const w = this.world;
    const person = w.graph.node(id);
    if (!person || !w.space || person.attrs["dead"] === true) return;
    const rt = this.runtime(id);
    if (rt.wake) w.queue.cancel(rt.wake);
    rt.wake = undefined;

    const now = w.time;
    const act = w.activities.get(id);
    const current = rt.program?.action ?? "";
    const ongoing = rt.program !== undefined && !finished;
    const commitment = !ongoing ? 0 : act?.leg ? 0.5 + 0.5 * clamp01((now - act.leg.depart) / (act.leg.arrive - act.leg.depart)) : 0.5;
    const determination = typeof person.attrs["determination"] === "number" ? person.attrs["determination"] : 0.5;

    const scope = this.scopeFor(person, act?.action ?? "");
    const goals = this.types
      .filter((t) => t.goal)
      .map((t) => ({ name: t.name, tier: t.goal!.tier, weight: clamp01(this.safeNum(t.goal!.weight, scope, `${t.name}.weight`)) }));
    const bar = URGENT + determination * commitment * DETERMINATION_SHIELD;
    let urgent = goals.filter((g) => g.tier === 1 && g.weight > bar).map((g) => g.name);
    const helps = (t: TypeDef) =>
      urgent.some((u) => {
        const src = t.action?.serves.get(u);
        return src !== undefined && this.safeNum(src, scope, `${t.name}.serves.${u}`) > 0;
      });
    // If nothing the person can do helps the urgent goal, urgency can't narrow the choice.
    if (urgent.length && !this.types.some((t) => t.action && helps(t))) urgent = [];

    const scores: Choice[] = [];
    for (const t of this.types) {
      if (!t.action) continue;
      // An action that can't even start (nowhere to go first) is not a choice (ADR-0029 #1).
      const first = t.action.steps[0];
      if (first?.kind === "goto" && !first.optional && !(t.name === current && ongoing)) {
        if (this.firstDestinations(person, first.targets, { action: t.name, steps: t.action.steps, index: 0 }, rt).length === 0) continue;
      }
      let score = 0;
      for (const g of goals) {
        const src = t.action.serves.get(g.name);
        if (src) score += g.weight * this.safeNum(src, scope, `${t.name}.serves.${g.name}`);
      }
      if (urgent.length && !helps(t)) continue;
      if (t.name === current && ongoing) score += determination * commitment * COMMIT_BONUS;
      scores.push({ action: t.name, score });
    }
    scores.sort((a, b) => b.score - a.score);
    this.lastChoice.set(id, { reason, scores });
    const chosen = scores[0]?.action;

    if (chosen && !(chosen === current && ongoing)) {
      this.interrupt(id, rt);
      this.begin(person, chosen, rt);
    }
    if (w.graph.node(id)) {
      this.updateRates(person, rt);
      this.scheduleWake(person, rt, determination);
    }
  }

  private interrupt(id: NodeId, rt: Runtime): void {
    const w = this.world;
    const act = w.activities.get(id);
    for (const t of rt.step) w.queue.cancel(t);
    rt.step = [];
    const prog = rt.program;
    const step = prog?.steps[prog.index];
    // Work done so far on something counts.
    if (step?.kind === "work" && step.progress && prog?.target !== undefined && act && !act.leg) {
      this.addTo(prog.target, step.progress, w.time - act.startedAt);
    }
    rt.program = undefined;
    if (act?.leg && w.time < act.leg.arrive) {
      emit(w, "adam", { kind: "node.moved", id, pos: round2(this.positionOf(id)!) });
    }
  }

  private begin(person: GraphNode, action: string, rt: Runtime): void {
    const steps = this.world.registry.types.get(action)?.action?.steps;
    if (!steps) return;
    if (rt.instant.t === this.world.time && rt.instant.n >= 3) {
      // The same moment keeps producing actions that end at once: pause briefly, then think again.
      const w = this.world;
      emit(w, "adam", { kind: "activity", person: person.id, activity: { action, startedAt: w.time } });
      rt.program = undefined;
      rt.pauseUntil = w.time + 0.05;
      return;
    }
    rt.program = { action, steps, index: 0 };
    this.run(person.id, rt);
  }

  // ---------------------------------------------------------------- running steps

  /** Run instant steps until one takes time, or the program ends. */
  private run(id: NodeId, rt: Runtime): void {
    const w = this.world;
    const prog = rt.program;
    if (!prog) return;
    while (prog.index < prog.steps.length) {
      const person = w.graph.node(id);
      if (!person?.pos) return;
      const step = prog.steps[prog.index]!;
      try {
      switch (step.kind) {
        case "goto": {
          const dests = this.firstDestinations(person, step.targets, prog, rt);
          if (dests.length === 0) {
            if (step.optional) break;
            return this.end(id, rt, "nothing to go to");
          }
          const near = dests.find((d) => dist(person.pos!, d.pos) <= THERE);
          if (near) {
            if (near.node !== undefined) prog.target = near.node;
            // Within reach: take the last step without a walking leg.
            if (near.node === undefined && dist(person.pos!, near.pos) > 0.05) emit(w, "adam", { kind: "node.moved", id, pos: round2(near.pos) });
            break;
          }
          if (this.walk(person, prog.action, dests, rt)) return;
          if (step.optional) break;
          return this.end(id, rt, "couldn't get there");
        }
        case "work": {
          const d = this.num(step.duration, this.stepScope(person, prog), this.rngFor(id, `step${prog.index}`));
          if (d > 0) {
            this.work(id, prog.action, d, rt);
            return;
          }
          break;
        }
        case "take": {
          const target = prog.target !== undefined ? w.graph.node(prog.target) : undefined;
          if (!target) return this.end(id, rt, "nothing to take from");
          const available = num(target.attrs[step.from]);
          if (available <= 0) {
            // What they remembered was out of date: they see it as it is now.
            this.see({ person: id, subject: target.id });
            this.react("found-empty", id, { it: target.id });
            return this.end(id, rt, "found it empty");
          }
          const amount = Math.min(available, Math.max(0, this.num(step.amount, this.stepScope(person, prog), this.rngFor(id, `step${prog.index}`))));
          if (amount > 0) {
            emit(w, "adam", { kind: "node.attrs", id: target.id, attrs: { [step.from]: available - amount, lastTakenBy: id } });
            if (step.to) this.addTo(id, step.to, amount);
          }
          break;
        }
        case "give": {
          const target = prog.target !== undefined ? w.graph.node(prog.target) : undefined;
          if (!target) return this.end(id, rt, "nobody to give to");
          const have = num(person.attrs[step.from]);
          const amount = Math.min(have, Math.max(0, this.num(step.amount, this.stepScope(person, prog), this.rngFor(id, `step${prog.index}`))));
          if (amount > 0) {
            this.addTo(id, step.from, -amount);
            this.addTo(target.id, step.to, amount);
          }
          break;
        }
        case "effect": {
          const target = prog.target !== undefined ? w.graph.node(prog.target) : undefined;
          const other = target?.type === "Person" ? target.id : undefined;
          this.apply(id, step.effects, this.stepScope(person, prog), prog.target, other, this.rngFor(id, `step${prog.index}`));
          break;
        }
        case "if":
          if (evaluate(step.cond, { scope: this.stepScope(person, prog), rng: this.rngFor(id, `step${prog.index}`) }) !== true) return this.end(id, rt, "stopped");
          break;
        case "finish":
          this.finishPlan(id);
          break;
        case "stay":
          this.stay(id, prog.action, rt);
          return;
      }
      } catch (e) {
        this.warn(`${prog.action} step ${prog.index + 1} (${step.kind})`, e);
        return this.end(id, rt, "error");
      }
      prog.index++;
    }
    this.end(id, rt, "finished");
  }

  /** The program is over; react and choose again. */
  private end(id: NodeId, rt: Runtime, reason: string): void {
    const action = rt.program?.action ?? "";
    rt.program = undefined;
    const now = this.world.time;
    rt.instant = rt.instant.t === now ? { t: now, n: rt.instant.n + 1 } : { t: now, n: 1 };
    if (reason === "finished") this.react("finished", id, { action });
    this.decide(id, reason, true);
  }

  private stay(id: NodeId, action: string, rt: Runtime): void {
    const w = this.world;
    const act = w.activities.get(id);
    if (!(act && act.action === action && !act.leg)) {
      emit(w, "adam", { kind: "activity", person: id, activity: { action, startedAt: w.time } });
    }
    if (!rt.program) rt.program = { action, steps: [{ kind: "stay" }], index: 0 };
  }

  private work(id: NodeId, action: string, duration: number, rt: Runtime): void {
    const w = this.world;
    const startedAt = w.time;
    emit(w, "adam", { kind: "activity", person: id, activity: { action, startedAt } });
    rt.step.push(schedule(w, startedAt + duration, { handler: "adam.done", data: { person: id, startedAt } }));
  }

  private walk(person: GraphNode, action: string, dests: { pos: Vec2; node?: NodeId }[], rt: Runtime): boolean {
    const w = this.world;
    const from = person.pos!;
    for (const d of dests.slice(0, 4)) {
      const path = findPath(w.space!, from, d.pos);
      if (!path || path.length < 2 || pathLength(path) < 0.3) continue;
      const depart = w.time;
      const arrive = depart + pathLength(path) / this.opts.speed;
      const leg = { path: path.map(round2), depart, arrive };
      emit(w, "adam", { kind: "activity", person: person.id, activity: { action, startedAt: depart, leg } });
      rt.heading = Math.atan2(d.pos.y - from.y, d.pos.x - from.x);
      if (rt.program && d.node !== undefined) rt.program.target = d.node;
      rt.step.push(schedule(w, arrive, { handler: "adam.arrive", data: { person: person.id, depart } }));
      this.scheduleSights(person.id, leg, rt);
      this.scheduleMeetings(person.id, leg, rt);
      return true;
    }
    return false;
  }

  private arrive(d: { person: NodeId; depart: number }): void {
    const w = this.world;
    const leg = w.activities.get(d.person)?.leg;
    if (!leg || leg.depart !== d.depart) return;
    const rt = this.runtime(d.person);
    rt.step = [];
    emit(w, "adam", { kind: "node.moved", id: d.person, pos: leg.path[leg.path.length - 1]! });
    const prog = rt.program;
    if (!prog) return this.decide(d.person, "arrived", true);
    // Walking to a person who moved on: follow them again, a few times at most.
    const target = prog.target !== undefined ? w.graph.node(prog.target) : undefined;
    if (prog.steps[prog.index]?.kind === "goto" && target?.type === "Person") {
      const there = this.positionOf(target.id);
      const here = w.graph.node(d.person)!.pos!;
      if (target.attrs["dead"] === true || !there) return this.end(d.person, rt, "lost them");
      if (dist(here, there) > THERE * 2) {
        prog.chase = (prog.chase ?? 0) + 1;
        if (prog.chase > 3) return this.end(d.person, rt, "lost them");
        if (this.walk(w.graph.node(d.person)!, prog.action, [{ pos: there, node: target.id }], rt)) return;
        return this.end(d.person, rt, "lost them");
      }
    }
    prog.chase = 0;
    prog.index++;
    this.run(d.person, rt);
  }

  private done(d: { person: NodeId; startedAt: number }): void {
    const act = this.world.activities.get(d.person);
    if (!act || act.startedAt !== d.startedAt) return;
    const rt = this.runtime(d.person);
    rt.step = [];
    const prog = rt.program;
    if (!prog) return this.decide(d.person, "done", true);
    const step = prog.steps[prog.index];
    if (step?.kind === "work" && step.progress && prog.target !== undefined) this.addTo(prog.target, step.progress, this.world.time - act.startedAt);
    prog.index++;
    this.run(d.person, rt);
  }

  /** The first alternative target that has anywhere to go. */
  private firstDestinations(person: GraphNode, targets: readonly Target[], prog: Program, rt: Runtime): { pos: Vec2; node?: NodeId }[] {
    for (const t of targets) {
      const d = this.destinations(person, t, prog, rt);
      if (d.length) return d;
    }
    return [];
  }

  /** Where a goto step may lead, best first. */
  private destinations(person: GraphNode, target: Target, prog: Program, rt: Runtime): { pos: Vec2; node?: NodeId }[] {
    const w = this.world;
    const from = person.pos!;
    switch (target.kind) {
      case "known": {
        const base = this.scopeFor(person);
        return this.knowledge(person.id, target.type)
          .filter((k) => !target.where || this.test(target.where, { ...base, it: k.it }, "goto.where"))
          .sort((a, b) => dist(from, a.pos) - dist(from, b.pos))
          .map((k) => ({ pos: k.pos, node: k.subject }));
      }
      case "home": {
        const h = homeOf(w, person.id);
        return h?.pos ? [{ pos: h.pos, node: h.id }] : [];
      }
      case "plan": {
        const p = planOf(w, person.id);
        return p?.node.pos ? [{ pos: p.node.pos, node: p.node.id }] : [];
      }
      case "target": {
        const n = prog.target !== undefined ? w.graph.node(prog.target) : undefined;
        const pos = n ? (n.type === "Person" ? this.positionOf(n.id) : n.pos) : undefined;
        return pos && n && n.attrs["dead"] !== true ? [{ pos, node: n.id }] : [];
      }
      case "person": {
        const base = this.scopeFor(person);
        return this.people()
          .filter((o) => o.id !== person.id)
          .map((o) => ({ node: o.id, pos: this.positionOf(o.id)!, o }))
          .filter((d) => d.pos && dist(from, d.pos) <= target.within)
          .filter((d) => !target.where || this.test(target.where, { ...base, it: { ...attrScope(d.o.attrs), id: d.o.id }, rel: this.relWith(person.id, d.o.id), bond: this.bondWith(person.id, d.o.id) }, "goto.person.where"))
          .sort((a, b) => dist(from, a.pos) - dist(from, b.pos))
          .map((d) => ({ node: d.node, pos: d.pos }));
      }
      case "field": {
        const spot = this.nearField(from, target.field, target.above);
        return spot ? [{ pos: spot }] : [];
      }
      case "linked":
        return w.graph
          .edgesOf(person.id, target.edge)
          .filter((e) => e.from === person.id && w.graph.node(e.to)?.attrs["dead"] !== true)
          .map((e) => ({ node: e.to, pos: this.positionOf(e.to) }))
          .filter((d): d is { node: NodeId; pos: Vec2 } => d.pos !== undefined)
          .sort((a, b) => dist(from, a.pos) - dist(from, b.pos));
      case "explore":
        return this.exploreTargets(person, rt).map((pos) => ({ pos }));
      case "wander":
        return this.wanderTargets(person, target.radius).map((pos) => ({ pos }));
    }
  }

  /** The nearest walkable cell next to where a field is above a level (e.g. the shore of a lake). */
  private nearField(from: Vec2, field: string, above: number): Vec2 | undefined {
    const space = this.world.space!;
    const f = space.fields.get(field);
    if (!f) return undefined;
    const fx = Math.floor(from.x);
    const fy = Math.floor(from.y);
    for (let r = 0; r <= 40; r++) {
      let best: Vec2 | undefined;
      let bestD = Infinity;
      let bestWet = false;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = fx + dx + 0.5;
          const y = fy + dy + 0.5;
          if (!passable(space, x, y)) continue;
          const side = f.at(x, y) > above ? [0, 0] : [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([ax, ay]) => f.at(x + ax!, y + ay!) > above);
          if (!side) continue;
          // Stand at the edge of the cell, toward the water: the field reads above 0 there.
          const spot = { x: x + side[0]! * 0.45, y: y + side[1]! * 0.45 };
          const wet = f.sample(spot.x, spot.y) > 0;
          const d = Math.hypot(spot.x - from.x, spot.y - from.y);
          if ((wet && !bestWet) || (wet === bestWet && d < bestD)) {
            bestD = d;
            best = spot;
            bestWet = wet;
          }
        }
      }
      if (best) return best;
    }
    return undefined;
  }

  // ---------------------------------------------------------------- effects and reactions

  private stepScope(person: GraphNode, prog: Program): Scope {
    const target = prog.target !== undefined ? this.world.graph.node(prog.target) : undefined;
    return {
      ...this.scopeFor(person),
      target: target ? { ...attrScope(target.attrs), id: target.id } : {},
      bond: this.bondWith(person.id, target?.type === "Person" ? target.id : undefined),
    };
  }

  private apply(id: NodeId, effects: readonly Effect[], scope: Scope, target: NodeId | undefined, other: NodeId | undefined, rng?: Rng): void {
    const w = this.world;
    const g = w.graph;
    const resolve = (ref: Ref): NodeId | undefined => {
      if (ref.kind === "target") return target;
      if (ref.kind === "other") return other;
      const v = evaluate(ref.expr, rng ? { scope, rng } : { scope });
      return typeof v === "number" && g.node(v) ? v : undefined;
    };
    const who = (on: "self" | "target" | "other"): NodeId | undefined => (on === "self" ? id : on === "target" ? target : other);
    const touched = new Set<NodeId>();
    for (const e of effects) {
      if (e.kind === "need") {
        const on = who(e.on);
        if (on === undefined || g.node(on)?.attrs["dead"] === true) continue;
        const eid = this.runtime(on).needEdges.get(e.need);
        const level = eid !== undefined ? g.edge(eid)?.fromData["level"] : undefined;
        if (eid === undefined || !isLazy(level)) continue;
        const next = clamp01(readLazy(level, w.time) + this.num(e.delta, scope, rng));
        emit(w, "adam", { kind: "edge.data", id: eid, end: "from", data: { level: withValue(level, w.time, next) } });
        touched.add(on);
      } else if (e.kind === "set") {
        const on = who(e.on);
        if (on !== undefined && g.node(on)) emit(w, "adam", { kind: "node.attrs", id: on, attrs: { [e.attr]: this.num(e.value, scope, rng) } });
      } else if (e.kind === "link" || e.kind === "unlink") {
        const to = resolve(e.to);
        if (to === undefined || to === id) continue;
        const pairs: [NodeId, NodeId][] = e.mutual ? [[id, to], [to, id]] : [[id, to]];
        for (const [a, b] of pairs) {
          const existing = g.edgesOf(a, e.edge).filter((x) => x.from === a && x.to === b);
          if (e.kind === "unlink") {
            for (const x of existing) emit(w, "adam", { kind: "edge.removed", id: x.id });
            continue;
          }
          const edgeId = existing[0]?.id ?? createEdge(w, "adam", { type: e.edge, from: a, to: b });
          if (e.add.size || e.set.size) {
            const edge = g.edge(edgeId)!;
            const data: Attrs = {};
            for (const [f, src] of e.add) data[f] = num(edge.fromData[f]) + this.num(src, scope, rng);
            for (const [f, src] of e.set) data[f] = this.num(src, scope, rng);
            emit(w, "adam", { kind: "edge.data", id: edgeId, end: "from", data });
          }
        }
      } else if (e.kind === "kill") {
        const victim = resolve(e.who);
        if (victim !== undefined) this.kill(victim, id);
      } else if (e.kind === "event") {
        this.hooks.onEvent?.(e.name, id, e.about ? resolve(e.about) : undefined);
      }
    }
    for (const t of touched) {
      const p = g.node(t);
      if (p) this.scheduleWake(p, this.runtime(t), typeof p.attrs["determination"] === "number" ? p.attrs["determination"] : 0.5);
    }
  }

  /** A person dies: they stop acting; the graph and the log keep them. */
  private kill(victim: NodeId, by: NodeId): void {
    const w = this.world;
    const node = w.graph.node(victim);
    if (!node || node.type !== "Person" || node.attrs["dead"] === true) return;
    const rt = this.runtime(victim);
    if (rt.wake) w.queue.cancel(rt.wake);
    for (const t of rt.step) w.queue.cancel(t);
    rt.step = [];
    rt.program = undefined;
    const pos = this.positionOf(victim);
    if (pos && w.activities.get(victim)?.leg) emit(w, "adam", { kind: "node.moved", id: victim, pos: round2(pos) });
    emit(w, "adam", { kind: "died", id: victim, by });
  }

  /** Run the packs' reactions to something that happened to a person (Molly calls this for events). */
  react(on: ReactionEvent, id: NodeId, ctx: ReactionContext): void {
    const w = this.world;
    const reactions = w.registry.reactions.filter((r) => r.on === on);
    if (!reactions.length) return;
    const person = w.graph.node(id);
    if (!person || person.attrs["dead"] === true) return;
    const it = ctx.it !== undefined ? w.graph.node(ctx.it) : undefined;
    const other = ctx.other !== undefined ? w.graph.node(ctx.other) : undefined;
    for (const r of reactions) {
      // Each reaction sees what the earlier ones did.
      const scope: Scope = {
        ...this.scopeFor(person),
        it: it ? { ...attrScope(it.attrs), id: it.id } : {},
        other: other ? { ...attrScope(other.attrs), id: other.id } : {},
        rel: this.relWith(id, other?.id),
        bond: this.bondWith(id, other?.id),
        action: ctx.action ?? "",
        event: ctx.event ? { name: ctx.event.name, known: ctx.event.known } : { name: "", known: false },
      };
      const label = `${r.pack} reactions[${r.index}] (${r.on})`;
      const rng = this.rngFor(id, `react:${r.pack}:${r.index}:${ctx.other ?? ""}:${ctx.it ?? ""}`);
      try {
        if (r.cond && evaluate(r.cond, { scope, rng }) !== true) continue;
      } catch (e) {
        this.warn(label, e);
        continue;
      }
      try {
        this.apply(id, r.effects, scope, ctx.it, ctx.other, rng);
      } catch (e) {
        this.warn(label, e);
      }
    }
  }

  private addTo(id: NodeId, attr: string, delta: number): void {
    const n = this.world.graph.node(id);
    if (n) emit(this.world, "adam", { kind: "node.attrs", id, attrs: { [attr]: num(n.attrs[attr]) + delta } });
  }

  private finishPlan(id: NodeId): void {
    const w = this.world;
    const plan = planOf(w, id);
    if (!plan || !plan.ready) return;
    emit(w, "adam", { kind: "node.attrs", id: plan.node.id, attrs: { state: "built" } });
    createEdge(w, "adam", { type: plan.rule.resident, from: id, to: plan.node.id });
    this.hooks.onBuilt?.(plan.node.id);
  }

  // ---------------------------------------------------------------- needs and waking

  private updateRates(person: GraphNode, rt: Runtime): void {
    const w = this.world;
    const scope = this.scopeFor(person);
    for (const [name, eid] of rt.needEdges) {
      const rule = w.registry.types.get(name)?.need;
      const level = w.graph.edge(eid)?.fromData["level"];
      if (!rule || !isLazy(level)) continue;
      const rate = this.safeNum(rule.rate, scope, `${name}.rate`);
      if (rate !== level.rate) emit(w, "adam", { kind: "edge.data", id: eid, end: "from", data: { level: withRate(level, w.time, rate) } });
    }
  }

  /** Wake again when a need crosses a line that matters, or after maxIdle at the latest. */
  private scheduleWake(person: GraphNode, rt: Runtime, determination: number): void {
    const w = this.world;
    if (rt.wake) w.queue.cancel(rt.wake);
    const now = w.time;
    let at = now + this.opts.maxIdle;
    if (rt.pauseUntil !== undefined && rt.pauseUntil > now) at = Math.min(at, rt.pauseUntil);
    const act = w.activities.get(person.id);
    if (act?.leg && act.leg.arrive > now) at = Math.max(at, act.leg.arrive + 1e-6);
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

  // ---------------------------------------------------------------- where to go

  private rngFor(id: NodeId, salt: string): Rng {
    return createRng(this.world.seed).fork(hash2(hash2(id, Math.floor(this.world.time * 10_000)), hashString(salt)));
  }

  /** Toward the unknown, biased by fertile land and the current heading; leg length is Lévy-like. */
  private exploreTargets(person: GraphNode, rt: Runtime): Vec2[] {
    const space = this.world.space!;
    const rng = this.rngFor(person.id, "explore");
    const from = person.pos!;
    const fertility = space.fields.get("fertility");
    const known = this.knowledge(person.id).map((k) => k.pos);
    const d = Math.min(40, 6 * Math.pow(1 - rng.next(), -1 / 1.5));
    const base = rng.next() * Math.PI * 2;
    const options: { p: Vec2; score: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = base + (i * Math.PI * 2) / 12;
      const p = { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d };
      if (!passable(space, p.x, p.y, { maxWater: 0.3, slopeCost: 0 })) continue;
      let nearest = 20;
      for (const k of known) nearest = Math.min(nearest, Math.hypot(k.x - p.x, k.y - p.y));
      const fert = fertility?.sample(p.x, p.y) ?? 0.5;
      const persist = rt.heading === undefined ? 0.5 : (Math.cos(a - rt.heading) + 1) / 2;
      options.push({ p, score: 0.5 * (nearest / 20) + 0.3 * fert + 0.2 * persist + 0.1 * rng.next() });
    }
    return options.sort((a, b) => b.score - a.score).map((o) => o.p);
  }

  private wanderTargets(person: GraphNode, radius: number): Vec2[] {
    const space = this.world.space!;
    const rng = this.rngFor(person.id, "wander");
    // Settled people stroll around their home.
    const home = homeOf(this.world, person.id);
    const centre = home?.pos && dist(home.pos, person.pos!) < radius * 2.5 ? home.pos : person.pos!;
    const out: Vec2[] = [];
    for (let i = 0; i < 8; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.min(2, radius / 3) + rng.next() * radius;
      const p = { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r };
      if (passable(space, p.x, p.y, { maxWater: 0.3, slopeCost: 0 })) out.push(p);
    }
    return out;
  }

  // ---------------------------------------------------------------- seeing, meeting, remembering

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

  private sight(t: number): number {
    return isNight(t) ? this.opts.sightNight : this.opts.sightDay;
  }

  /** Everything that will come into view along the leg gets a sight event at that moment. */
  private scheduleSights(id: NodeId, leg: { path: readonly Vec2[]; depart: number; arrive: number }, rt: Runtime): void {
    const w = this.world;
    const r = this.sight(leg.depart);
    const xs = leg.path.map((p) => p.x);
    const ys = leg.path.map((p) => p.y);
    const len = pathLength(leg.path);
    const known = new Map(this.knowledge(id).map((k) => [k.subject, k]));
    const candidates = this.spatial().inBox(Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r);
    for (const c of candidates) {
      const k = known.get(c.id);
      if (k && !this.worthRefreshing(id, k)) continue;
      for (let d = 0; d <= len + 1e-9; d += 0.5) {
        const p = pointAlong(leg.path, d);
        if (Math.hypot(p.x - c.pos.x, p.y - c.pos.y) <= r) {
          const t = leg.depart + (len === 0 ? 0 : (d / len) * (leg.arrive - leg.depart));
          rt.step.push(schedule(w, Math.max(t, w.time), { handler: "adam.see", data: { person: id, subject: c.id } }));
          break;
        }
      }
    }
  }

  /** Seeing something already known matters if it changed, or the memory needs reinforcing. */
  private worthRefreshing(person: NodeId, k: Known): boolean {
    const g = this.world.graph;
    const subject = g.node(k.subject);
    const type = subject ? this.world.registry.types.get(subject.type) : undefined;
    if (subject && type?.remember.some((a) => subject.attrs[a] !== k.it[a])) return true;
    const edge = g.edgesOf(person, "knows").find((e) => e.to === k.claim);
    const learnedAt = edge?.fromData["learnedAt"];
    const memory = this.world.registry.types.get("Sighting")?.memory;
    const after = memory ? 1 : REFRESH_AFTER;
    return typeof learnedAt === "number" && this.world.time - learnedAt > after;
  }

  /** People who will come within sight of each other along this leg get a meeting at that moment. */
  private scheduleMeetings(id: NodeId, leg: { path: readonly Vec2[]; depart: number; arrive: number }, rt: Runtime): void {
    const w = this.world;
    if (!w.registry.reactions.some((r) => r.on === "meets")) return;
    const len = pathLength(leg.path);
    const span = leg.arrive - leg.depart;
    const steps = Math.max(1, Math.ceil(span / 0.003));
    for (const other of this.people()) {
      if (other.id === id) continue;
      const last = rt.lastMet.get(other.id);
      if (last !== undefined && w.time - last < MEET_COOLDOWN) continue;
      for (let i = 0; i <= steps; i++) {
        const t = leg.depart + (span * i) / steps;
        const a = pointAlong(leg.path, (len * i) / steps);
        const b = this.positionOf(other.id, t);
        if (b && Math.hypot(a.x - b.x, a.y - b.y) <= this.sight(t)) {
          rt.step.push(schedule(w, Math.max(t, w.time), { handler: "adam.meet", data: { a: id, b: other.id } }));
          break;
        }
      }
    }
  }

  private meet(d: { a: NodeId; b: NodeId }): void {
    const w = this.world;
    const pa = this.positionOf(d.a);
    const pb = this.positionOf(d.b);
    if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.y - pb.y) > this.sight(w.time) + 0.5) return;
    const ra = this.runtime(d.a);
    const rb = this.runtime(d.b);
    const last = ra.lastMet.get(d.b);
    if (last !== undefined && w.time - last < MEET_COOLDOWN) return;
    ra.lastMet.set(d.b, w.time);
    rb.lastMet.set(d.a, w.time);
    emit(w, "adam", { kind: "met", a: d.a, b: d.b });
    this.react("meets", d.a, { other: d.b });
    this.react("meets", d.b, { other: d.a });
  }

  /**
   * One shared claim per thing-at-a-place-as-seen (ADR-0015): what the person
   * remembers of it is part of the claim. Memory rules (ADR-0026) decide whether
   * it is kept, how fast it fades and how much seeing it again reinforces it.
   */
  private see(d: { person: NodeId; subject: NodeId }): void {
    const w = this.world;
    const g = w.graph;
    const subject = g.node(d.subject);
    const person = g.node(d.person);
    if (!subject?.pos || !person) return;
    const type = w.registry.types.get(subject.type);
    const at = round2(subject.pos);
    const remembered: Attrs = {};
    for (const a of type?.remember ?? []) remembered[a] = subject.attrs[a] ?? null;
    const sighting = requireType(w.registry, "Sighting", "knowledge");
    const memory = sighting.memory;
    const self = selfScope(person);

    const myOld = g.edgesOf(d.person, "knows").filter((k) => k.from === d.person && g.edgesOf(k.to, "about").some((a) => a.to === d.subject));
    const rng = createRng(w.seed).fork(hash2(hash2(d.person, d.subject), Math.floor(w.time * 10_000)));
    if (myOld.length === 0 && memory && rng.next() >= this.num(memory.recall, { self })) return;

    let claim = g
      .edgesOf(d.subject, "about")
      .map((e) => g.node(e.from))
      .find((c) => c && c.type === "Sighting" && c.attrs["x"] === at.x && c.attrs["y"] === at.y && Object.entries(remembered).every(([k, v]) => c.attrs[k] === v))?.id;
    if (claim === undefined) {
      claim = createNode(w, "adam", { kind: "knowledge", type: "Sighting", attrs: { ...instantiateAttrs(sighting, createRng(0), { x: at.x, y: at.y }), ...remembered } });
      createEdge(w, "adam", { type: "about", from: claim, to: d.subject });
    }

    // Confidence: reinforced if they already knew the thing, fresh otherwise.
    const prev = myOld.map((k) => k.fromData["confidence"]).find(isLazy);
    const fade = memory ? this.num(memory.fade, { self }) : 0;
    const base = prev && memory ? this.num(memory.reinforce, { self, confidence: readLazy(prev, w.time) }) : 1;
    const confidence = lazy(clamp01(base), fade, w.time, 0, 1);

    const same = myOld.find((k) => k.to === claim);
    for (const k of myOld) if (k !== same) emit(w, "adam", { kind: "edge.removed", id: k.id });
    let edgeId: EdgeId;
    if (same) {
      edgeId = same.id;
      emit(w, "adam", { kind: "edge.data", id: same.id, end: "from", data: { learnedAt: w.time, confidence } });
    } else {
      edgeId = createEdge(w, "adam", { type: "knows", from: d.person, to: claim, fromData: { learnedAt: w.time, confidence } });
    }
    if (memory && fade < 0) {
      const t = timeToReach(confidence, memory.forgetBelow, w.time);
      if (t !== undefined) schedule(w, t, { handler: "adam.forget", data: { edge: edgeId, since: w.time } });
    }
    if (myOld.length === 0) this.react("sees", d.person, { it: d.subject });
  }

  /** A memory faded below the pack's line: the person no longer knows it (Entropy, ADR-0021). */
  private forget(d: { edge: EdgeId; since: number }): void {
    const e = this.world.graph.edge(d.edge);
    const c = e?.fromData["confidence"];
    if (!e || !isLazy(c) || c.since !== d.since) return;
    emit(this.world, "entropy", { kind: "edge.removed", id: d.edge });
  }

  // ---------------------------------------------------------------- helpers

  private runtime(id: NodeId): Runtime {
    let rt = this.rt.get(id);
    if (rt) return rt;
    rt = { step: [], needEdges: new Map(), lastMet: new Map(), instant: { t: -1, n: 0 } };
    const g = this.world.graph;
    for (const e of g.edgesOf(id, "has")) {
      const mind = g.node(e.to);
      if (mind && this.world.registry.types.get(mind.type)?.need) rt.needEdges.set(mind.type, e.id);
    }
    this.rt.set(id, rt);
    return rt;
  }

  private num(src: NumberSource, scope: Scope, rng?: Rng): number {
    if ("literal" in src) return src.literal;
    return numberOf(src.expr, scope, rng);
  }

  /** A number from a pack rule, or 0 with a warning if the rule fails at runtime. */
  private safeNum(src: NumberSource, scope: Scope, label: string): number {
    try {
      return this.num(src, scope);
    } catch (e) {
      this.warn(label, e);
      return 0;
    }
  }

  /** A condition from a pack rule; a failing one counts as false, with a warning. */
  private test(cond: Compiled, scope: Scope, label: string): boolean {
    try {
      return evaluate(cond, { scope }) === true;
    } catch (e) {
      this.warn(label, e);
      return false;
    }
  }

  private warn(where: string, e: unknown): void {
    const msg = `${where}: ${e instanceof Error ? e.message : String(e)}`;
    if (this.warnings.includes(msg)) return;
    this.warnings.push(msg);
    if (this.warnings.length > 50) this.warnings.shift();
  }
}

function numberOf(expr: Compiled, scope: Scope, rng?: Rng): number {
  const v: Value = evaluate(expr, rng ? { scope, rng } : { scope });
  if (typeof v !== "number") throw new Error(`expression "${expr.source}" must give a number, got ${JSON.stringify(v)}`);
  return v;
}

function attrScope(attrs: Attrs): Scope {
  const out: Scope = {};
  for (const [k, v] of Object.entries(attrs)) if (v === null || typeof v !== "object") out[k] = v;
  return out;
}

function selfScope(n: GraphNode): Scope {
  return { ...attrScope(n.attrs), id: n.id };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round2(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}
