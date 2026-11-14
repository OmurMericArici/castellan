import { compile, ExprError, suggest } from "./expr";
import type { Compiled } from "./expr";
import type { NodeKind } from "./graph";

/**
 * Pack format v0.1 (ADR-0018, docs/PACKS.md). Packs are plain data (JSON);
 * Archie checks them here and turns them into a registry of types.
 * Nothing in a pack is ever run as code.
 */

export type AttrType = "number" | "string" | "boolean";

export interface AttrDef {
  readonly name: string;
  readonly type: AttrType;
  readonly min?: number;
  readonly max?: number;
  readonly default?: { literal: number | string | boolean } | { expr: Compiled };
  /** Entity number attributes: amount regained per day, up to `max` (Entropy). */
  readonly regrow?: number;
  readonly description?: string;
}

export type MindRole = "need" | "emotion" | "goal" | "action" | "trait";

/** A number written as a literal or an expression. */
export type NumberSource = { literal: number } | { expr: Compiled };

/** How a need behaves (ADR-0024): a level in [0, 1] that moves at a rate. */
export interface NeedRule {
  readonly start: NumberSource;
  /** Change per day; may depend on night, what the person is doing, etc. */
  readonly rate: NumberSource;
  /** Above this the need counts as urgent; people are woken when they cross it. */
  readonly urgentAt: number;
}

export interface GoalRule {
  /** 1 survive, 2 secure, 3 belong, 4 grow. Lower tiers can pre-empt higher ones. */
  readonly tier: number;
  readonly weight: NumberSource;
}

export interface ActionRule {
  /** What the action does, step by step (ADR-0026). */
  readonly steps: readonly Step[];
  /** How much the action helps each goal. */
  readonly serves: ReadonlyMap<string, NumberSource>;
  /** Facts that must hold before it can be done, besides those its steps imply (ADR-0033). */
  readonly requires: readonly string[];
  /** Facts it makes true; `known.*` means it can make the person know any memorable thing. */
  readonly gives: readonly string[];
  /** What holds people back from it, 0..1 (1: never). Emotions and traits can scale it. */
  readonly restraint?: NumberSource;
  /** Planning cost (default 1); divided by the person's preference for the method. */
  readonly cost: number;
  /** Who knows the method: the chance to know it from birth, and to learn it by watching. */
  readonly knowhow: KnowHow;
  /** How logs and stories put the method into words (ADR-0037). */
  readonly words: Words;
}

/** A method in words: "gathering wood", "gathered wood", "(to) build a house", "(learned to) cut wood". */
export interface Words {
  readonly doing?: string;
  readonly did?: string;
  readonly purpose?: string;
  readonly name?: string;
}

/** Methods are know-how (ADR-0032): known from birth by some, learned by watching or being taught. */
export interface KnowHow {
  readonly innate: NumberSource;
  readonly watch: number;
}

/** A named fact about what a person believes, written as an expression (ADR-0033). */
export interface FactDef {
  readonly name: string;
  readonly pack: string;
  readonly expr: Compiled;
}

/** Where a `goto` step leads. */
export type Target =
  | { readonly kind: "known"; readonly type: string; readonly where?: Compiled }
  | { readonly kind: "home" }
  | { readonly kind: "plan" }
  | { readonly kind: "explore" }
  | { readonly kind: "wander"; readonly radius: number }
  | { readonly kind: "linked"; readonly edge: string }
  | { readonly kind: "person"; readonly within: number; readonly where?: Compiled }
  | { readonly kind: "field"; readonly field: string; readonly above: number }
  | { readonly kind: "target" };

/** One step of an action. The engine knows steps, never mechanics (ADR-0027). */
export type Step =
  /** The first alternative that has somewhere to go is used (ADR-0029 #8). */
  | { readonly kind: "goto"; readonly targets: readonly Target[]; readonly optional: boolean }
  | { readonly kind: "work"; readonly duration: NumberSource; readonly progress?: string }
  | { readonly kind: "take"; readonly from: string; readonly to?: string; readonly amount: NumberSource }
  | { readonly kind: "give"; readonly from: string; readonly to: string; readonly amount: NumberSource }
  | { readonly kind: "effect"; readonly effects: readonly Effect[] }
  | { readonly kind: "if"; readonly cond: Compiled }
  | { readonly kind: "finish" }
  | { readonly kind: "stay" };

/** Who an effect's link points at: the current target, the other person (meets), or an id expression. */
export type Ref = { readonly kind: "target" } | { readonly kind: "other" } | { readonly kind: "expr"; readonly expr: Compiled };

export type Who = "self" | "target" | "other";

export type Effect =
  /** Adds to a need's or an emotion's level. */
  | { readonly kind: "need"; readonly on: Who; readonly need: string; readonly role: "need" | "emotion"; readonly delta: NumberSource }
  | { readonly kind: "set"; readonly on: Who; readonly attr: string; readonly value: NumberSource }
  | {
      readonly kind: "link" | "unlink";
      readonly edge: string;
      readonly to: Ref;
      /** Also the same edge back, from them to the person. */
      readonly mutual: boolean;
      /** Add to / set data on the person's end of the edge (and theirs, if mutual). */
      readonly add: ReadonlyMap<string, NumberSource>;
      readonly set: ReadonlyMap<string, NumberSource>;
    }
  | { readonly kind: "kill"; readonly who: Ref }
  /** Changes how much someone prefers a method; at 0 they forget it. `method: "action"` means the action that just ended. */
  | { readonly kind: "prefer"; readonly on: Who; readonly method: string; readonly add: NumberSource }
  /** Passes on a method the person knows and the other doesn't ("any": a random one). */
  | { readonly kind: "teach"; readonly to: Ref; readonly method: string; readonly mutual: boolean }
  /** Passes on knowledge: links the other to claims the person holds (ADR-0015: telling is adding a link). */
  | { readonly kind: "tell"; readonly to: Ref; readonly what: string; readonly count: number; readonly mutual: boolean }
  | { readonly kind: "event"; readonly name: string; readonly about?: Ref };

/** A world event a pack can raise; Molly decides who notices it (ADR-0030). */
export interface EventDef {
  readonly name: string;
  readonly pack: string;
  /** People within this many cells are witnesses. */
  readonly seenWithin: number;
  /** Who else hears of it: everyone, people of the same village, or nobody. */
  readonly heard: "everyone" | "village" | "nobody";
}

/** How a trait's value is drawn for each person (ADR-0030). */
export type Distribution = { readonly kind: "expr"; readonly expr: NumberSource } | { readonly kind: "histogram"; readonly bins: readonly (readonly [number, number, number])[] };

/** Events a pack can react to. */
export const REACTION_EVENTS = ["sees", "meets", "found-empty", "finished", "failed", "dusk", "dawn", "witness", "hears", "learned"] as const;
export type ReactionEvent = (typeof REACTION_EVENTS)[number];

export interface Reaction {
  readonly pack: string;
  readonly index: number;
  readonly on: ReactionEvent;
  readonly cond?: Compiled;
  readonly effects: readonly Effect[];
}

/** How people remember a kind of knowledge (ADR-0026). Confidence is a lazy value on `knows`. */
export interface MemoryRule {
  /** Chance a new sighting is remembered at all. */
  readonly recall: NumberSource;
  /** Confidence change per day. */
  readonly fade: NumberSource;
  /** New confidence when seen again (reads `confidence`). */
  readonly reinforce: NumberSource;
  /** Below this the person forgets (the `knows` link is removed). */
  readonly forgetBelow: number;
}

/** Names a mind expression may read. */
export const MIND_SCOPE = ["needs", "emotions", "night", "knows", "reports", "self", "doing", "plan", "home", "traits", "links", "field"] as const;
/** Inside steps the current target is readable too, and the person's bond data toward it. */
export const STEP_SCOPE = [...MIND_SCOPE, "target", "bond"] as const;
/** A `known` target's `where` reads what the person remembers of the thing as `it`. */
export const WHERE_SCOPE = [...MIND_SCOPE, "it"] as const;
/** A `person` target's `where` reads the other person as `it` and the person's edges to them. */
export const PERSON_WHERE_SCOPE = [...MIND_SCOPE, "it", "rel", "bond", "did"] as const;
/** Reactions see the thing (`it`), the other person (`other`), relations and bonds to them, what they know the other did, the action and the event. */
export const REACTION_SCOPE = [...MIND_SCOPE, "it", "other", "rel", "bond", "did", "action", "reason", "event", "method"] as const;
/** What a pack log can be triggered by (ADR-0037). Lines are derived from the world's event log. */
export const LOG_TRIGGERS = ["started", "happened", "witness", "hears", "met", "linked", "unlinked", "learned", "died", "created", "signal"] as const;
export type LogTrigger = (typeof LOG_TRIGGERS)[number];
/** Names a pack log's `if` and `text` may read. All of them always have a value. */
export const LOG_SCOPE = ["self", "other", "about", "teller", "event", "action", "purpose", "edge", "method", "how", "by", "type", "signal", "rel", "words", "traits", "needs", "emotions"] as const;
/** Table rows that are not people only see their own attributes. */
export const ROW_SCOPE = ["self"] as const;
export const EMPHASIS = ["strong", "normal", "quiet"] as const;
export type Emphasis = (typeof EMPHASIS)[number];

/** Text with expressions in braces: "{self.name} killed {about.name}". */
export type TextPart = string | Compiled;

/** "Track these": one row per node of a type, one column per expression. */
export interface WatchTable {
  readonly name: string;
  readonly rows: string;
  readonly where?: Compiled;
  readonly columns: readonly { readonly name: string; readonly expr: Compiled }[];
  /** Column to sort by, highest first. */
  readonly sort?: string;
}

/** "This triggers this log": a log type inside a group. */
export interface WatchLog {
  readonly pack: string;
  readonly group: string;
  readonly name: string;
  readonly on: LogTrigger;
  readonly cond?: Compiled;
  readonly text: readonly TextPart[];
  /** The pack's suggestion for whether the line also shows in the world log. */
  readonly global: boolean;
  readonly emphasis: Emphasis;
}

/** A pack's own watchers and logs (ADR-0037). */
export interface WatchDef {
  readonly pack: string;
  readonly color: string;
  readonly mark?: string;
  readonly tables: readonly WatchTable[];
  readonly logs: readonly WatchLog[];
}

/** A `scales` expression reads the scaling type's own value. */
export const SCALE_SCOPE = ["value"] as const;
/** Fields of `plan` in mind expressions (the person's current build project). */
export const PLAN_FIELDS = ["active", "missing", "ready", "workLeft"] as const;
/** Names a build `spot` expression may read: `field.fertility` etc. at the candidate spot. */
export const SPOT_SCOPE = ["field"] as const;

/**
 * How a derived entity comes to exist through work (ADR-0025). Molly places a
 * concept when need, material and spot line up; a person gathers and builds it.
 */
export interface BuildRule {
  /** The need it meets once built (its resident's need falls). */
  readonly meets: string;
  /** A memorable entity type that holds the material, and the attribute holding the amount. */
  readonly material: string;
  readonly materialAttr: string;
  /** Material units needed. */
  readonly amount: number;
  /** Days of building once all material is there. */
  readonly work: number;
  /** Edge from the person to the concept they are building, and to the finished thing they live in. */
  readonly planner: string;
  readonly resident: string;
  /** How much the person needs it, 0..1 (mind scope). */
  readonly when: NumberSource;
  /** How good a spot is, 0..1 (reads `field.*`). */
  readonly spot: NumberSource;
  /** Spacing from others of the same type: never closer than `min`, best within `prefer`. */
  readonly near: { readonly min: number; readonly prefer: number };
  /** Condition lost per day once built (Entropy). */
  readonly wear: number;
}

/** How Molly recognises a group (ADR-0025): members close together become one node. */
export interface RecognizeRule {
  readonly members: string;
  readonly radius: number;
  /** Membership ramps from `min` members (just possible) to `full` members (certain). */
  readonly min: number;
  readonly full: number;
  /** Forms at or above this degree. */
  readonly formAt: number;
  readonly memberEdge: string;
}

/** How Entropy spreads a leaf (new trees near old ones). */
export interface SpreadRule {
  /** Every this many days. */
  readonly every: number;
  readonly count: number;
  readonly radius: number;
  /** Only where this field is above 0.3. */
  readonly field?: string;
}

export interface TypeDef {
  readonly name: string;
  readonly kind: NodeKind;
  readonly pack: string;
  /** Entities only: may Noah place it from outside? (ADR-0006) */
  readonly leaf: boolean;
  readonly role?: MindRole;
  /** Entities only: people form Sighting knowledge when they see it. */
  readonly memorable: boolean;
  /** Memorable entities: attributes people remember when they see it (readable as `it.*`). */
  readonly remember: readonly string[];
  /** Knowledge types: how people remember it. */
  readonly memory?: MemoryRule;
  /** Trait types: how the value is distributed over people. */
  readonly distribution?: Distribution;
  /** Needs and emotions: how the level moves. */
  readonly need?: NeedRule;
  /** Needs, emotions and traits: multipliers on other parts of the mind (ADR-0033). */
  readonly scales?: ReadonlyMap<string, NumberSource>;
  readonly goal?: GoalRule;
  readonly action?: ActionRule;
  readonly build?: BuildRule;
  readonly recognize?: RecognizeRule;
  readonly spread?: SpreadRule;
  /** Entities: the word for several of them in logs and stories ("people"). */
  readonly plural?: string;
  readonly attrs: ReadonlyMap<string, AttrDef>;
  readonly description?: string;
}

export interface EdgeTypeDef {
  readonly name: string;
  readonly pack: string;
  readonly from: NodeKind | "any";
  readonly to: NodeKind | "any";
  readonly fromData: ReadonlyMap<string, AttrDef>;
  readonly toData: ReadonlyMap<string, AttrDef>;
  readonly description?: string;
}

/** A pack's suggestion for how many of a leaf Noah places at the start. */
export interface PlaceDef {
  readonly type: string;
  readonly pack: string;
  readonly count: number;
  readonly prefer?: string;
  readonly avoid: readonly { field: string; above: number }[];
}

export interface Registry {
  readonly packs: readonly { id: string; version: string }[];
  readonly types: ReadonlyMap<string, TypeDef>;
  readonly edges: ReadonlyMap<string, EdgeTypeDef>;
  readonly reactions: readonly Reaction[];
  readonly events: ReadonlyMap<string, EventDef>;
  readonly facts: ReadonlyMap<string, FactDef>;
  /** Later packs override earlier ones for the same type. */
  readonly place: ReadonlyMap<string, PlaceDef>;
  /** Watchers and logs by pack id (ADR-0037). */
  readonly watch: ReadonlyMap<string, WatchDef>;
}

export interface PackError {
  /** Which pack, or "(packs)" for problems between packs. */
  readonly pack: string;
  /** Where inside the pack, e.g. "types.Tree.attrs.wood.default". */
  readonly path: string;
  readonly message: string;
}

export type CheckResult = { ok: true; registry: Registry } | { ok: false; errors: PackError[] };

export const EMPTY_REGISTRY: Registry = { packs: [], types: new Map(), edges: new Map(), reactions: [], events: new Map(), facts: new Map(), place: new Map(), watch: new Map() };

export function formatPackError(e: PackError): string {
  return e.path ? `${e.pack} › ${e.path}: ${e.message}` : `${e.pack}: ${e.message}`;
}

// ------------------------------------------------------------------ helpers

const KINDS: readonly NodeKind[] = ["entity", "knowledge", "mind"];
const ROLES: readonly MindRole[] = ["need", "emotion", "goal", "action", "trait"];
const ATTR_TYPES: readonly AttrType[] = ["number", "string", "boolean"];
const PACK_ID = /^[a-z][a-z0-9-]{0,39}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const TYPE_NAME = /^[A-Z][A-Za-z0-9]{0,39}$/;
const MEMBER_NAME = /^[a-z][A-Za-z0-9]{0,39}$/;

/** Names a default expression may read. Nothing for now: defaults are made at creation time. */
const DEFAULT_SCOPE: readonly string[] = [];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

class Checker {
  readonly errors: PackError[] = [];
  constructor(readonly pack: string) {}

  err(path: string, message: string): void {
    this.errors.push({ pack: this.pack, path, message });
  }

  /** Report keys that aren't allowed, with a hint for typos. */
  keys(obj: Obj, path: string, allowed: readonly string[]): void {
    for (const k of Object.keys(obj)) {
      if (!allowed.includes(k)) {
        this.err(path ? `${path}.${k}` : k, `unknown key "${k}"${suggest(k, allowed)}; allowed: ${allowed.join(", ")}`);
      }
    }
  }

  optString(obj: Obj, key: string, path: string): string | undefined {
    const v = obj[key];
    if (v === undefined) return undefined;
    if (typeof v !== "string") {
      this.err(`${path}.${key}`, `must be text`);
      return undefined;
    }
    return v;
  }
}

function numberSource(c: Checker, raw: unknown, path: string, scope: readonly string[]): NumberSource | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return { literal: raw };
  if (typeof raw === "string") {
    try {
      return { expr: compile(raw, scope) };
    } catch (e) {
      c.err(path, e instanceof ExprError ? e.message : String(e));
      return undefined;
    }
  }
  if (isObj(raw)) {
    c.keys(raw, path, ["expr"]);
    if (typeof raw["expr"] === "string") {
      try {
        return { expr: compile(raw["expr"], scope) };
      } catch (e) {
        c.err(`${path}.expr`, e instanceof ExprError ? e.message : String(e));
        return undefined;
      }
    }
  }
  c.err(path, `must be a number or an expression ("needs.Hunger * 2" or { "expr": "..." })`);
  return undefined;
}

const ENTITY_RULE_KEYS = ["build", "recognize", "spread"] as const;

function numberIn(c: Checker, obj: Obj, key: string, path: string, o: { min?: number; max?: number; int?: boolean; def?: number }): number | undefined {
  const v = obj[key] ?? o.def;
  const bad = typeof v !== "number" || !Number.isFinite(v) || (o.int && !Number.isInteger(v)) || (o.min !== undefined && v < o.min) || (o.max !== undefined && v > o.max);
  if (bad) {
    const range = o.min !== undefined && o.max !== undefined ? ` between ${o.min} and ${o.max}` : o.min !== undefined ? ` ≥ ${o.min}` : "";
    c.err(`${path}.${key}`, `must be ${o.int ? "a whole number" : "a number"}${range}`);
    return undefined;
  }
  return v as number;
}

function nameIn(c: Checker, obj: Obj, key: string, path: string): string | undefined {
  const v = obj[key];
  if (typeof v !== "string" || v === "") {
    c.err(`${path}.${key}`, "must be a name");
    return undefined;
  }
  return v;
}

function checkBuild(c: Checker, raw: unknown, p: string): BuildRule | undefined {
  if (!isObj(raw)) {
    c.err(p, "must be an object");
    return undefined;
  }
  c.keys(raw, p, ["meets", "material", "materialAttr", "amount", "work", "planner", "resident", "when", "spot", "near", "wear"]);
  const meets = nameIn(c, raw, "meets", p);
  const material = nameIn(c, raw, "material", p);
  const materialAttr = nameIn(c, raw, "materialAttr", p);
  const planner = nameIn(c, raw, "planner", p);
  const resident = nameIn(c, raw, "resident", p);
  const amount = numberIn(c, raw, "amount", p, { min: 1, int: true });
  const work = numberIn(c, raw, "work", p, { min: 0 });
  const wear = numberIn(c, raw, "wear", p, { min: 0, max: 1, def: 0 });
  const when = numberSource(c, raw["when"], `${p}.when`, MIND_SCOPE);
  const spot = numberSource(c, raw["spot"], `${p}.spot`, SPOT_SCOPE);
  let near: BuildRule["near"] | undefined = { min: 0, prefer: Infinity };
  if (raw["near"] !== undefined) {
    const n = raw["near"];
    if (!isObj(n)) {
      c.err(`${p}.near`, `must be an object like { "min": 3, "prefer": 8 }`);
      near = undefined;
    } else {
      c.keys(n, `${p}.near`, ["min", "prefer"]);
      const min = numberIn(c, n, "min", `${p}.near`, { min: 0 });
      const prefer = numberIn(c, n, "prefer", `${p}.near`, { min: 0 });
      near = min !== undefined && prefer !== undefined ? { min, prefer } : undefined;
    }
  }
  if ([meets, material, materialAttr, planner, resident, amount, work, wear, when, spot, near].some((x) => x === undefined)) return undefined;
  return { meets: meets!, material: material!, materialAttr: materialAttr!, amount: amount!, work: work!, planner: planner!, resident: resident!, when: when!, spot: spot!, near: near!, wear: wear! };
}

function checkRecognize(c: Checker, raw: unknown, p: string): RecognizeRule | undefined {
  if (!isObj(raw)) {
    c.err(p, "must be an object");
    return undefined;
  }
  c.keys(raw, p, ["members", "radius", "min", "full", "formAt", "memberEdge"]);
  const members = nameIn(c, raw, "members", p);
  const memberEdge = nameIn(c, raw, "memberEdge", p);
  const radius = numberIn(c, raw, "radius", p, { min: 0 });
  const min = numberIn(c, raw, "min", p, { min: 1, int: true });
  const full = numberIn(c, raw, "full", p, { min: 1, int: true });
  const formAt = numberIn(c, raw, "formAt", p, { min: 0, max: 1, def: 0.5 });
  if (min !== undefined && full !== undefined && full < min) c.err(`${p}.full`, `must be at least min (${min})`);
  if ([members, memberEdge, radius, min, full, formAt].some((x) => x === undefined)) return undefined;
  return { members: members!, memberEdge: memberEdge!, radius: radius!, min: min!, full: full!, formAt: formAt! };
}

function checkSpread(c: Checker, raw: unknown, p: string): SpreadRule | undefined {
  if (!isObj(raw)) {
    c.err(p, "must be an object");
    return undefined;
  }
  c.keys(raw, p, ["every", "count", "radius", "field"]);
  const every = numberIn(c, raw, "every", p, { min: 0.1 });
  const count = numberIn(c, raw, "count", p, { min: 0, int: true });
  const radius = numberIn(c, raw, "radius", p, { min: 0 });
  const field = raw["field"];
  if (field !== undefined && typeof field !== "string") c.err(`${p}.field`, "must be a field name");
  if ([every, count, radius].some((x) => x === undefined)) return undefined;
  return { every: every!, count: count!, radius: radius!, ...(typeof field === "string" ? { field } : {}) };
}

const MIND_KEYS: Record<MindRole, readonly string[]> = {
  need: ["start", "rate", "urgentAt", "scales"],
  emotion: ["start", "rate", "urgentAt", "scales"],
  goal: ["tier", "weight"],
  action: ["steps", "serves", "requires", "gives", "restraint", "cost", "knowhow", "words"],
  trait: ["distribution", "scales"],
};
const WORD_KEYS = ["doing", "did", "purpose", "name"] as const;
const ALL_MIND_KEYS: readonly string[] = [...new Set(Object.values(MIND_KEYS).flat())];
/** What a `scales` key may point at. */
const SCALE_TARGET = /^(restraint|(goal|action|restraint|need|emotion|trait)\.[A-Z][A-Za-z0-9]*)$/;

function checkScales(c: Checker, raw: unknown, p: string): Map<string, NumberSource> | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw)) {
    c.err(p, `must look like { "goal.Vent": "1 + value", "restraint": "1 - value * 0.5" }`);
    return undefined;
  }
  const out = new Map<string, NumberSource>();
  for (const [k, v] of Object.entries(raw)) {
    if (!SCALE_TARGET.test(k)) {
      c.err(`${p}.${k}`, `scales keys are "goal.<Goal>", "action.<Action>", "restraint", "restraint.<Action>", "need.<Need>", "emotion.<Emotion>" or "trait.<Trait>"`);
      continue;
    }
    const src = numberSource(c, v, `${p}.${k}`, SCALE_SCOPE);
    if (src) out.set(k, src);
  }
  return out;
}

function factList(c: Checker, raw: unknown, p: string): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || x === "")) {
    c.err(p, `must be a list of fact names, e.g. ["hasLoad"]`);
    return [];
  }
  return raw as string[];
}

function checkMind(c: Checker, spec: Obj, p: string, role: MindRole): Pick<TypeDef, "need" | "goal" | "action" | "distribution" | "scales"> {
  const ownerOf = (k: string) => (Object.keys(MIND_KEYS) as MindRole[]).filter((r) => MIND_KEYS[r].includes(k)).join(" or ");
  for (const k of ALL_MIND_KEYS) {
    if (k in spec && !MIND_KEYS[role].includes(k)) c.err(`${p}.${k}`, `"${k}" belongs to ${ownerOf(k)} types, not ${role} types`);
  }
  const scales = MIND_KEYS[role].includes("scales") ? checkScales(c, spec["scales"], `${p}.scales`) : undefined;
  const out = checkMindRole(c, spec, p, role);
  return scales && scales.size ? { ...out, scales } : out;
}

function checkMindRole(c: Checker, spec: Obj, p: string, role: MindRole): Pick<TypeDef, "need" | "goal" | "action" | "distribution"> {
  if (role === "trait") {
    const raw = spec["distribution"];
    if (raw === undefined) return {};
    if (isObj(raw) && "histogram" in raw) {
      c.keys(raw, `${p}.distribution`, ["histogram"]);
      const bins = raw["histogram"];
      const ok =
        Array.isArray(bins) &&
        bins.length > 0 &&
        bins.every((b) => Array.isArray(b) && b.length === 3 && b.every((x) => typeof x === "number" && Number.isFinite(x)) && b[0] <= b[1] && b[2] >= 0);
      if (!ok) {
        c.err(`${p}.distribution.histogram`, "must be a list of [from, to, weight] bins, e.g. [[0, 0.1, 95], [0.6, 1, 5]]");
        return {};
      }
      if ((bins as number[][]).every((b) => b[2] === 0)) c.err(`${p}.distribution.histogram`, "at least one bin needs a weight above 0");
      return { distribution: { kind: "histogram", bins: bins as [number, number, number][] } };
    }
    const expr = numberSource(c, raw, `${p}.distribution`, ["self"]);
    return expr ? { distribution: { kind: "expr", expr } } : {};
  }
  if (role === "need" || role === "emotion") {
    const start = spec["start"] === undefined ? { literal: 0 } : numberSource(c, spec["start"], `${p}.start`, ["self"]);
    const rate = spec["rate"] === undefined ? { literal: 0 } : numberSource(c, spec["rate"], `${p}.rate`, MIND_SCOPE);
    const urgentAt = spec["urgentAt"] ?? 0.7;
    if (typeof urgentAt !== "number" || urgentAt <= 0 || urgentAt > 1) c.err(`${p}.urgentAt`, "must be a number in (0, 1]");
    return start && rate && typeof urgentAt === "number" ? { need: { start, rate, urgentAt } } : {};
  }
  if (role === "goal") {
    const tier = spec["tier"];
    const tierOk = typeof tier === "number" && Number.isInteger(tier) && tier >= 1 && tier <= 4;
    if (!tierOk) c.err(`${p}.tier`, "goals need a tier: 1 survive, 2 secure, 3 belong, 4 grow");
    const weight = numberSource(c, spec["weight"], `${p}.weight`, MIND_SCOPE);
    return weight && tierOk ? { goal: { tier: tier as number, weight } } : {};
  }
  if (role === "action") {
    const steps = checkSteps(c, spec["steps"], `${p}.steps`);
    const serves = new Map<string, NumberSource>();
    const raw = spec["serves"];
    // No `serves`: a method only ever done on the way to another (ADR-0033); it then needs `gives`.
    if (raw === undefined) {
      if (spec["gives"] === undefined && !impliedGives(steps ?? []).length) c.err(p, `an action needs "serves" (which goals it helps) or "gives" (which facts it makes true for other methods)`);
    } else if (!isObj(raw)) {
      c.err(`${p}.serves`, `must be an object like { "Survive": 1 }`);
    } else {
      for (const [goal, v] of Object.entries(raw)) {
        const src = numberSource(c, v, `${p}.serves.${goal}`, MIND_SCOPE);
        if (src) serves.set(goal, src);
      }
    }
    const requires = factList(c, spec["requires"], `${p}.requires`);
    const gives = factList(c, spec["gives"], `${p}.gives`);
    const restraint = spec["restraint"] === undefined ? undefined : numberSource(c, spec["restraint"], `${p}.restraint`, MIND_SCOPE);
    const cost = numberIn(c, spec, "cost", p, { min: 0.01, def: 1 }) ?? 1;
    let knowhow: KnowHow = { innate: { literal: 1 }, watch: 0 };
    const kh = spec["knowhow"];
    if (kh !== undefined) {
      if (!isObj(kh)) c.err(`${p}.knowhow`, `must look like { "innate": 0.5, "watch": 0.3 }`);
      else {
        c.keys(kh, `${p}.knowhow`, ["innate", "watch"]);
        const innate = kh["innate"] === undefined ? { literal: 1 } : numberSource(c, kh["innate"], `${p}.knowhow.innate`, ["self", "traits"]);
        const watch = numberIn(c, kh, "watch", `${p}.knowhow`, { min: 0, max: 1, def: 0 });
        if (innate && watch !== undefined) knowhow = { innate, watch };
      }
    }
    const words: { -readonly [K in keyof Words]: string } = {};
    const rw = spec["words"];
    if (rw !== undefined) {
      if (!isObj(rw)) c.err(`${p}.words`, `must look like { "doing": "gathering wood", "did": "gathered wood", "purpose": "build a house", "name": "cut wood" }`);
      else {
        c.keys(rw, `${p}.words`, WORD_KEYS);
        for (const k of WORD_KEYS) {
          const v = c.optString(rw, k, `${p}.words`);
          if (v !== undefined) words[k] = v;
        }
      }
    }
    return steps ? { action: { steps, serves, requires, gives, ...(restraint ? { restraint } : {}), cost, knowhow, words } } : {};
  }
  return {};
}

function checkAttrs(c: Checker, raw: unknown, path: string): Map<string, AttrDef> {
  const out = new Map<string, AttrDef>();
  if (raw === undefined) return out;
  if (!isObj(raw)) {
    c.err(path, "must be an object of attribute definitions");
    return out;
  }
  for (const [name, spec] of Object.entries(raw)) {
    const p = `${path}.${name}`;
    if (!MEMBER_NAME.test(name)) {
      c.err(p, `attribute names start with a lowercase letter and use letters/digits only (camelCase)`);
      continue;
    }
    if (!isObj(spec)) {
      c.err(p, `must be an object like { "type": "number" }`);
      continue;
    }
    c.keys(spec, p, ["type", "default", "min", "max", "regrow", "description"]);
    const type = spec["type"];
    if (typeof type !== "string" || !ATTR_TYPES.includes(type as AttrType)) {
      c.err(`${p}.type`, `must be one of ${ATTR_TYPES.join(", ")}`);
      continue;
    }
    const attrType = type as AttrType;
    const min = spec["min"];
    const max = spec["max"];
    for (const [k, v] of [["min", min], ["max", max]] as const) {
      if (v === undefined) continue;
      if (attrType !== "number") c.err(`${p}.${k}`, `only number attributes can have ${k}`);
      else if (typeof v !== "number" || !Number.isFinite(v)) c.err(`${p}.${k}`, `must be a number`);
    }
    if (typeof min === "number" && typeof max === "number" && min > max) c.err(p, `min (${min}) is greater than max (${max})`);

    let def: AttrDef["default"];
    const d = spec["default"];
    if (d !== undefined) {
      if (isObj(d)) {
        c.keys(d, `${p}.default`, ["expr"]);
        if (typeof d["expr"] !== "string") {
          c.err(`${p}.default`, `an expression default looks like { "expr": "rand_int(1, 6)" }`);
        } else {
          try {
            def = { expr: compile(d["expr"], DEFAULT_SCOPE) };
          } catch (e) {
            c.err(`${p}.default.expr`, e instanceof ExprError ? e.message : String(e));
          }
        }
      } else if (typeof d === attrType) {
        def = { literal: d as number | string | boolean };
      } else {
        c.err(`${p}.default`, `must be a ${attrType} or { "expr": "…" }`);
      }
    }
    const regrow = spec["regrow"];
    if (regrow !== undefined) {
      if (attrType !== "number" || typeof regrow !== "number" || regrow <= 0) c.err(`${p}.regrow`, "must be a positive number (per day) on a number attribute");
      else if (typeof max !== "number") c.err(`${p}.regrow`, `needs "max": regrowing stops there`);
    }
    const description = c.optString(spec, "description", p);
    out.set(name, {
      name,
      type: attrType,
      ...(typeof regrow === "number" && regrow > 0 && typeof max === "number" ? { regrow } : {}),
      ...(typeof min === "number" ? { min } : {}),
      ...(typeof max === "number" ? { max } : {}),
      ...(def ? { default: def } : {}),
      ...(description ? { description } : {}),
    });
  }
  return out;
}

interface PackParts {
  id: string;
  version: string;
  requires: string[];
  types: TypeDef[];
  edges: EdgeTypeDef[];
  reactions: Reaction[];
  events: EventDef[];
  place: PlaceDef[];
  facts: FactDef[];
  watch?: WatchDef;
}

function checkOne(raw: unknown, index: number): { parts?: PackParts; errors: PackError[] } {
  if (!isObj(raw)) return { errors: [{ pack: `(pack #${index + 1})`, path: "", message: "a pack must be a JSON object" }] };
  const idRaw = raw["pack"];
  const id = typeof idRaw === "string" ? idRaw : `(pack #${index + 1})`;
  const c = new Checker(id);
  c.keys(raw, "", ["pack", "version", "description", "requires", "types", "extends", "edges", "reactions", "events", "place", "facts", "watch"]);

  if (typeof idRaw !== "string" || !PACK_ID.test(idRaw)) {
    c.err("pack", `the pack id must be lowercase letters, digits and dashes, starting with a letter (e.g. "firearms")`);
  }
  const version = raw["version"];
  if (typeof version !== "string" || !VERSION.test(version)) c.err("version", `must look like "1.0.0"`);
  c.optString(raw, "description", "");

  const requires: string[] = [];
  const req = raw["requires"];
  if (req !== undefined) {
    if (!Array.isArray(req) || req.some((r) => typeof r !== "string")) c.err("requires", "must be a list of pack ids");
    else requires.push(...(req as string[]));
  }

  const types: TypeDef[] = [];
  const rawTypes = raw["types"];
  if (rawTypes !== undefined && !isObj(rawTypes)) c.err("types", "must be an object of type definitions");
  for (const [name, spec] of Object.entries(isObj(rawTypes) ? rawTypes : {})) {
    const p = `types.${name}`;
    if (!TYPE_NAME.test(name)) {
      c.err(p, "type names start with a capital letter and use letters/digits only (PascalCase)");
      continue;
    }
    if (!isObj(spec)) {
      c.err(p, `must be an object like { "kind": "entity" }`);
      continue;
    }
    if ("do" in spec) c.err(`${p}.do`, `"do" was replaced by "steps" in format 0.4 (see PACKS.md, "Steps")`);
    c.keys(spec, p, ["kind", "leaf", "memorable", "remember", "memory", "role", "attrs", "description", "plural", "do", ...ALL_MIND_KEYS, ...ENTITY_RULE_KEYS]);
    const kind = spec["kind"];
    if (typeof kind !== "string" || !KINDS.includes(kind as NodeKind)) {
      c.err(`${p}.kind`, `must be one of ${KINDS.join(", ")}`);
      continue;
    }
    const leaf = spec["leaf"];
    if (leaf !== undefined && typeof leaf !== "boolean") c.err(`${p}.leaf`, "must be true or false");
    if (leaf === true && kind !== "entity") c.err(`${p}.leaf`, "only entities can be leaves");
    const role = spec["role"];
    if (kind === "mind") {
      if (typeof role !== "string" || !ROLES.includes(role as MindRole)) c.err(`${p}.role`, `mind types need a role: ${ROLES.join(", ")}`);
    } else if (role !== undefined) {
      c.err(`${p}.role`, "only mind types have a role");
    }
    const memorable = spec["memorable"];
    if (memorable !== undefined && typeof memorable !== "boolean") c.err(`${p}.memorable`, "must be true or false");
    if (memorable === true && kind !== "entity") c.err(`${p}.memorable`, "only entities can be memorable");
    const mindRole =
      kind === "mind" && typeof role === "string" && ROLES.includes(role as MindRole) ? (role as MindRole) : undefined;
    if (kind !== "mind") {
      for (const k of ALL_MIND_KEYS) if (k in spec) c.err(`${p}.${k}`, `only mind types have "${k}"`);
    }
    const mind = mindRole ? checkMind(c, spec, p, mindRole) : {};
    const rules: { build?: BuildRule; recognize?: RecognizeRule; spread?: SpreadRule } = {};
    for (const k of ENTITY_RULE_KEYS) {
      if (spec[k] === undefined) continue;
      if (kind !== "entity") {
        c.err(`${p}.${k}`, `only entity types have "${k}"`);
        continue;
      }
      if (k === "build") {
        if (leaf === true) c.err(`${p}.build`, "a leaf can't have a build rule: leaves are placed, built things are derived");
        const r = checkBuild(c, spec[k], `${p}.build`);
        if (r) rules.build = r;
      } else if (k === "recognize") {
        if (leaf === true) c.err(`${p}.recognize`, "a leaf can't be recognised as a group");
        const r = checkRecognize(c, spec[k], `${p}.recognize`);
        if (r) rules.recognize = r;
      } else {
        const r = checkSpread(c, spec[k], `${p}.spread`);
        if (r) rules.spread = r;
      }
    }
    const remember: string[] = [];
    if (spec["remember"] !== undefined) {
      const r = spec["remember"];
      if (memorable !== true) c.err(`${p}.remember`, `only memorable entities have "remember"`);
      if (!Array.isArray(r) || r.some((x) => typeof x !== "string")) c.err(`${p}.remember`, "must be a list of attribute names");
      else remember.push(...(r as string[]));
    }
    let memory: MemoryRule | undefined;
    if (spec["memory"] !== undefined) {
      if (kind !== "knowledge") c.err(`${p}.memory`, `only knowledge types have "memory"`);
      else memory = checkMemory(c, spec["memory"], `${p}.memory`);
    }
    const description = c.optString(spec, "description", p);
    const plural = c.optString(spec, "plural", p);
    if (plural !== undefined && kind !== "entity") c.err(`${p}.plural`, `only entity types have "plural"`);
    types.push({
      name,
      kind: kind as NodeKind,
      pack: id,
      leaf: leaf === true,
      memorable: memorable === true,
      remember,
      ...(memory ? { memory } : {}),
      ...mind,
      ...rules,
      ...(mindRole ? { role: mindRole } : {}),
      attrs: checkAttrs(c, spec["attrs"], `${p}.attrs`),
      ...(description ? { description } : {}),
      ...(plural ? { plural } : {}),
    });
  }

  const edges: EdgeTypeDef[] = [];
  const rawEdges = raw["edges"];
  if (rawEdges !== undefined && !isObj(rawEdges)) c.err("edges", "must be an object of edge definitions");
  for (const [name, spec] of Object.entries(isObj(rawEdges) ? rawEdges : {})) {
    const p = `edges.${name}`;
    if (!MEMBER_NAME.test(name)) {
      c.err(p, "edge names start with a lowercase letter and use letters/digits only (camelCase)");
      continue;
    }
    if (!isObj(spec)) {
      c.err(p, `must be an object like { "from": "entity", "to": "knowledge" }`);
      continue;
    }
    c.keys(spec, p, ["from", "to", "fromData", "toData", "description"]);
    const ends = ["from", "to"].map((k) => {
      const v = spec[k];
      if (typeof v !== "string" || !(v === "any" || KINDS.includes(v as NodeKind))) {
        c.err(`${p}.${k}`, `must be one of ${[...KINDS, "any"].join(", ")}`);
        return "any" as const;
      }
      return v as NodeKind | "any";
    });
    const description = c.optString(spec, "description", p);
    edges.push({
      name,
      pack: id,
      from: ends[0]!,
      to: ends[1]!,
      fromData: checkAttrs(c, spec["fromData"], `${p}.fromData`),
      toData: checkAttrs(c, spec["toData"], `${p}.toData`),
      ...(description ? { description } : {}),
    });
  }

  const reactions: Reaction[] = [];
  const rawReactions = raw["reactions"];
  if (rawReactions !== undefined) {
    if (!Array.isArray(rawReactions)) c.err("reactions", "must be a list");
    else rawReactions.forEach((r, i) => {
      const rp = `reactions[${i}]`;
      if (!isObj(r)) return c.err(rp, `must be an object like { "on": "sees", "do": { ... } }`);
      c.keys(r, rp, ["on", "if", "do", "description"]);
      const on = r["on"];
      if (typeof on !== "string" || !(REACTION_EVENTS as readonly string[]).includes(on)) {
        return c.err(`${rp}.on`, `must be one of ${REACTION_EVENTS.join(", ")}${typeof on === "string" ? suggest(on, REACTION_EVENTS) : ""}`);
      }
      const cond = r["if"] === undefined ? undefined : condition(c, r["if"], `${rp}.if`, REACTION_SCOPE);
      const effects = checkEffects(c, r["do"], `${rp}.do`, REACTION_SCOPE);
      if (effects) reactions.push({ pack: id, index: i, on: on as ReactionEvent, ...(cond ? { cond } : {}), effects });
    });
  }

  const events: EventDef[] = [];
  const rawEvents = raw["events"];
  if (rawEvents !== undefined && !isObj(rawEvents)) c.err("events", "must be an object of event definitions");
  for (const [name, spec] of Object.entries(isObj(rawEvents) ? rawEvents : {})) {
    const ep = `events.${name}`;
    if (!TYPE_NAME.test(name)) {
      c.err(ep, "event names are PascalCase, e.g. Murder");
      continue;
    }
    if (!isObj(spec)) {
      c.err(ep, `must look like { "seenWithin": 6, "heard": "everyone" }`);
      continue;
    }
    c.keys(spec, ep, ["seenWithin", "heard", "description"]);
    const seenWithin = numberIn(c, spec, "seenWithin", ep, { min: 0, def: 6 });
    const heard = spec["heard"] ?? "nobody";
    if (heard !== "everyone" && heard !== "village" && heard !== "nobody") c.err(`${ep}.heard`, `must be "everyone", "village" or "nobody"`);
    else if (seenWithin !== undefined) events.push({ name, pack: id, seenWithin, heard });
  }

  const place: PlaceDef[] = [];
  const rawPlace = raw["place"];
  if (rawPlace !== undefined && !isObj(rawPlace)) c.err("place", `must look like { "Bush": { "count": 60, "prefer": "fertility" } }`);
  for (const [type, spec] of Object.entries(isObj(rawPlace) ? rawPlace : {})) {
    const pp = `place.${type}`;
    if (!isObj(spec)) {
      c.err(pp, `must look like { "count": 60, "prefer": "fertility", "avoid": { "water": 0.05 } }`);
      continue;
    }
    c.keys(spec, pp, ["count", "prefer", "avoid"]);
    const count = numberIn(c, spec, "count", pp, { min: 0, int: true });
    const prefer = spec["prefer"];
    if (prefer !== undefined && typeof prefer !== "string") c.err(`${pp}.prefer`, "must be a field name");
    const avoid: { field: string; above: number }[] = [];
    const ra = spec["avoid"] ?? { water: 0.05 };
    if (!isObj(ra) || Object.values(ra).some((v) => typeof v !== "number")) c.err(`${pp}.avoid`, `must look like { "water": 0.05 }`);
    else for (const [f, v] of Object.entries(ra)) avoid.push({ field: f, above: v as number });
    if (count !== undefined) place.push({ type, pack: id, count, ...(typeof prefer === "string" ? { prefer } : {}), avoid });
  }

  const facts: FactDef[] = [];
  const rawFacts = raw["facts"];
  if (rawFacts !== undefined && !isObj(rawFacts)) c.err("facts", `must look like { "hasLoad": "self.carrying >= 4" }`);
  for (const [name, src] of Object.entries(isObj(rawFacts) ? rawFacts : {})) {
    if (!MEMBER_NAME.test(name)) {
      c.err(`facts.${name}`, "fact names are camelCase, e.g. hasLoad");
      continue;
    }
    const expr = condition(c, src, `facts.${name}`, MIND_SCOPE);
    if (expr) facts.push({ name, pack: id, expr });
  }

  const watch = raw["watch"] === undefined ? undefined : checkWatch(c, raw["watch"], id);

  if (c.errors.length) return { errors: c.errors };
  return { parts: { id, version: version as string, requires, types, edges, reactions, events, place, facts, ...(watch ? { watch } : {}) }, errors: [] };
}

// ------------------------------------------------------------------ watchers and logs (ADR-0037)

const COLOR = /^#[0-9a-fA-F]{6}$/;
const LABEL = /^[A-Za-z][A-Za-z0-9 ]{0,29}$/;

/** "{self.name} killed {about.name}" → text and compiled expressions, in order. */
function checkText(c: Checker, raw: unknown, path: string, scope: readonly string[]): TextPart[] | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    c.err(path, `must be a line of text; expressions go in braces: "{self.name} killed {about.name}"`);
    return undefined;
  }
  const parts: TextPart[] = [];
  let ok = true;
  let i = 0;
  while (i < raw.length) {
    const open = raw.indexOf("{", i);
    if (open < 0) {
      parts.push(raw.slice(i));
      break;
    }
    if (open > i) parts.push(raw.slice(i, open));
    const close = raw.indexOf("}", open);
    if (close < 0) {
      c.err(path, `a "{" is never closed`);
      return undefined;
    }
    try {
      parts.push(compile(raw.slice(open + 1, close), scope));
    } catch (e) {
      c.err(path, `in {${raw.slice(open + 1, close)}}: ${e instanceof ExprError ? e.message : String(e)}`);
      ok = false;
    }
    i = close + 1;
  }
  return ok ? parts : undefined;
}

function checkWatch(c: Checker, raw: unknown, pack: string): WatchDef | undefined {
  const p = "watch";
  if (!isObj(raw)) {
    c.err(p, `must look like { "color": "#a23b3b", "tables": { ... }, "logs": { ... } }`);
    return undefined;
  }
  c.keys(raw, p, ["color", "mark", "tables", "logs"]);
  const color = raw["color"] ?? "#888888";
  if (typeof color !== "string" || !COLOR.test(color)) c.err(`${p}.color`, `must be a colour like "#a23b3b"`);
  const mark = c.optString(raw, "mark", p);
  if (mark !== undefined && [...mark].length > 2) c.err(`${p}.mark`, "must be one or two characters");

  const tables: WatchTable[] = [];
  const rawTables = raw["tables"];
  if (rawTables !== undefined && !isObj(rawTables)) c.err(`${p}.tables`, "must be an object of tables, by name");
  for (const [name, spec] of Object.entries(isObj(rawTables) ? rawTables : {})) {
    const tp = `${p}.tables.${name}`;
    if (!LABEL.test(name)) c.err(tp, "table names are letters, digits and spaces, starting with a letter");
    if (!isObj(spec)) {
      c.err(tp, `must look like { "rows": "Person", "columns": { "Hunger": "needs.Hunger" } }`);
      continue;
    }
    c.keys(spec, tp, ["rows", "where", "columns", "sort"]);
    const rows = spec["rows"];
    if (typeof rows !== "string" || !TYPE_NAME.test(rows)) {
      c.err(`${tp}.rows`, `must be an entity type name, e.g. "Person"`);
      continue;
    }
    // People are seen through their mind; anything else only has its own attributes.
    const scope: readonly string[] = rows === "Person" ? MIND_SCOPE : ROW_SCOPE;
    const where = spec["where"] === undefined ? undefined : condition(c, spec["where"], `${tp}.where`, scope);
    const columns: { name: string; expr: Compiled }[] = [];
    const rawCols = spec["columns"];
    if (!isObj(rawCols) || Object.keys(rawCols).length === 0) c.err(`${tp}.columns`, `must look like { "Hunger": "needs.Hunger" }, with at least one column`);
    for (const [col, src] of Object.entries(isObj(rawCols) ? rawCols : {})) {
      if (!LABEL.test(col)) c.err(`${tp}.columns.${col}`, "column names are letters, digits and spaces, starting with a letter");
      const expr = condition(c, src, `${tp}.columns.${col}`, scope);
      if (expr) columns.push({ name: col, expr });
    }
    const sort = c.optString(spec, "sort", tp);
    if (sort !== undefined && isObj(rawCols) && !(sort in rawCols)) c.err(`${tp}.sort`, `"${sort}" is not one of this table's columns${suggest(sort, Object.keys(rawCols))}`);
    tables.push({ name, rows, ...(where ? { where } : {}), columns, ...(sort !== undefined ? { sort } : {}) });
  }

  const logs: WatchLog[] = [];
  const rawLogs = raw["logs"];
  if (rawLogs !== undefined && !isObj(rawLogs)) c.err(`${p}.logs`, "must be an object of groups, each an object of log types");
  for (const [group, types] of Object.entries(isObj(rawLogs) ? rawLogs : {})) {
    const gp = `${p}.logs.${group}`;
    if (!LABEL.test(group)) c.err(gp, "group names are letters, digits and spaces, starting with a letter");
    if (!isObj(types)) {
      c.err(gp, `a group holds log types: { "Killing": { "on": "happened", "text": "..." } }`);
      continue;
    }
    for (const [name, spec] of Object.entries(types)) {
      const lp = `${gp}.${name}`;
      if (!LABEL.test(name)) c.err(lp, "log type names are letters, digits and spaces, starting with a letter");
      if (!isObj(spec)) {
        c.err(lp, `must look like { "on": "happened", "text": "{self.name} killed {about.name}" }`);
        continue;
      }
      c.keys(spec, lp, ["on", "if", "text", "global", "emphasis"]);
      const on = spec["on"];
      if (typeof on !== "string" || !(LOG_TRIGGERS as readonly string[]).includes(on)) {
        c.err(`${lp}.on`, `must be one of ${LOG_TRIGGERS.join(", ")}${typeof on === "string" ? suggest(on, LOG_TRIGGERS) : ""}`);
        continue;
      }
      const cond = spec["if"] === undefined ? undefined : condition(c, spec["if"], `${lp}.if`, LOG_SCOPE);
      const text = checkText(c, spec["text"], `${lp}.text`, LOG_SCOPE);
      const global = spec["global"] ?? false;
      if (typeof global !== "boolean") c.err(`${lp}.global`, "must be true or false");
      const emphasis = spec["emphasis"] ?? "normal";
      if (typeof emphasis !== "string" || !(EMPHASIS as readonly string[]).includes(emphasis)) c.err(`${lp}.emphasis`, `must be one of ${EMPHASIS.join(", ")}`);
      if (text) logs.push({ pack, group, name, on: on as LogTrigger, ...(cond ? { cond } : {}), text, global: global === true, emphasis: emphasis as Emphasis });
    }
  }
  return { pack, color: color as string, ...(mark !== undefined ? { mark } : {}), tables, logs };
}

/** Names that watch expressions read must exist across all loaded packs. */
function crossCheckWatch(watch: ReadonlyMap<string, WatchDef>, types: ReadonlyMap<string, TypeDef>, edges: ReadonlyMap<string, EdgeTypeDef>): PackError[] {
  const errors: PackError[] = [];
  const all = [...types.values()];
  const names = (pred: (t: TypeDef) => boolean) => all.filter(pred).map((t) => t.name);
  const lists: Record<string, { what: string; names: string[] }> = {
    traits: { what: "trait type", names: names((t) => t.role === "trait") },
    needs: { what: "need type", names: names((t) => t.role === "need") },
    emotions: { what: "emotion type", names: names((t) => t.role === "emotion") },
    knows: { what: "memorable entity type", names: names((t) => t.memorable) },
    links: { what: "edge type", names: [...edges.keys()] },
    rel: { what: "edge type", names: [...edges.keys()] },
  };
  const check = (pack: string, path: string, expr: Compiled) => {
    for (const read of expr.paths) {
      const [root, name = ""] = read.split(".");
      const list = lists[root!];
      if (list && !list.names.includes(name)) errors.push({ pack, path, message: `"${read}": "${name}" is not a ${list.what}${suggest(name, list.names)}` });
    }
  };
  for (const w of watch.values()) {
    for (const t of w.tables) {
      const tp = `watch.tables.${t.name}`;
      const rows = types.get(t.rows);
      if (!rows || rows.kind !== "entity") errors.push({ pack: w.pack, path: `${tp}.rows`, message: `"${t.rows}" is not an entity type${suggest(t.rows, names((x) => x.kind === "entity"))}` });
      if (t.where) check(w.pack, `${tp}.where`, t.where);
      for (const col of t.columns) check(w.pack, `${tp}.columns.${col.name}`, col.expr);
    }
    for (const l of w.logs) {
      const lp = `watch.logs.${l.group}.${l.name}`;
      if (l.cond) check(w.pack, `${lp}.if`, l.cond);
      for (const part of l.text) if (typeof part !== "string") check(w.pack, `${lp}.text`, part);
    }
  }
  return errors;
}

/**
 * Archie's check: every pack on its own, then between packs (missing or circular
 * requirements, the same type defined twice). Returns a registry or every error found.
 */
export function checkPacks(input: readonly unknown[]): CheckResult {
  const pre = orderAndExtend(input);
  if (pre.errors.length) return { ok: false, errors: pre.errors };
  const result = checkOrdered(pre.sources);
  if (result.ok || pre.changedBy.size === 0) return result;
  // Point at the packs that changed a type, not only at its owner.
  return {
    ok: false,
    errors: result.errors.map((e) => {
      const m = /^types\.([A-Za-z0-9]+)/.exec(e.path);
      const by = m ? pre.changedBy.get(m[1]!) : undefined;
      return by ? { ...e, message: `${e.message} (${m![1]} was changed by: ${by.join(", ")})` } : e;
    }),
  };
}

function checkOrdered(sources: readonly unknown[]): CheckResult {
  const errors: PackError[] = [];
  const parts: PackParts[] = [];
  sources.forEach((s, i) => {
    const r = checkOne(s, i);
    errors.push(...r.errors);
    if (r.parts) parts.push(r.parts);
  });
  if (errors.length) return { ok: false, errors };

  const byId = new Map<string, PackParts>();
  for (const p of parts) {
    if (byId.has(p.id)) errors.push({ pack: p.id, path: "pack", message: `pack "${p.id}" is loaded twice` });
    byId.set(p.id, p);
  }
  for (const p of parts) {
    for (const r of p.requires) {
      if (!byId.has(r)) {
        errors.push({ pack: p.id, path: "requires", message: `needs pack "${r}", which is not loaded${suggest(r, byId.keys())}` });
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  // Order by requirements so a pack always comes after the packs it needs.
  const ordered: PackParts[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (p: PackParts, chain: string[]): void => {
    const s = state.get(p.id);
    if (s === "done") return;
    if (s === "visiting") {
      errors.push({ pack: "(packs)", path: "", message: `circular requirement: ${[...chain, p.id].join(" → ")}` });
      return;
    }
    state.set(p.id, "visiting");
    for (const r of p.requires) visit(byId.get(r)!, [...chain, p.id]);
    state.set(p.id, "done");
    ordered.push(p);
  };
  for (const p of parts) visit(p, []);
  if (errors.length) return { ok: false, errors };

  const types = new Map<string, TypeDef>();
  const edges = new Map<string, EdgeTypeDef>();
  for (const p of ordered) {
    for (const t of p.types) {
      const prev = types.get(t.name);
      if (prev) errors.push({ pack: p.id, path: `types.${t.name}`, message: `type "${t.name}" is already defined by pack "${prev.pack}"` });
      else types.set(t.name, t);
    }
    for (const e of p.edges) {
      const prev = edges.get(e.name);
      if (prev) errors.push({ pack: p.id, path: `edges.${e.name}`, message: `edge "${e.name}" is already defined by pack "${prev.pack}"` });
      else edges.set(e.name, e);
    }
  }
  if (errors.length) return { ok: false, errors };
  const reactions = ordered.flatMap((p) => p.reactions);
  const events = new Map<string, EventDef>();
  for (const p of ordered) {
    for (const e of p.events) {
      const prev = events.get(e.name);
      if (prev) errors.push({ pack: p.id, path: `events.${e.name}`, message: `event "${e.name}" is already defined by pack "${prev.pack}"` });
      else events.set(e.name, e);
    }
  }
  const facts = new Map<string, FactDef>();
  for (const p of ordered) {
    for (const f of p.facts) {
      const prev = facts.get(f.name);
      if (prev) errors.push({ pack: p.id, path: `facts.${f.name}`, message: `fact "${f.name}" is already defined by pack "${prev.pack}"` });
      else facts.set(f.name, f);
    }
  }
  const place = new Map<string, PlaceDef>();
  for (const p of ordered) for (const pl of p.place) place.set(pl.type, pl);
  for (const pl of place.values()) {
    const t = types.get(pl.type);
    if (!t || t.kind !== "entity" || !t.leaf) errors.push({ pack: pl.pack, path: `place.${pl.type}`, message: `"${pl.type}" is not a leaf entity type; only leaves can be placed${suggest(pl.type, [...types.values()].filter((x) => x.leaf).map((x) => x.name))}` });
  }
  if (errors.length) return { ok: false, errors };
  const watch = new Map<string, WatchDef>();
  for (const p of ordered) if (p.watch) watch.set(p.id, p.watch);
  errors.push(...crossCheckMind(types), ...crossCheckEntityRules(types, edges), ...crossCheckBehaviour(types, edges, reactions, events), ...crossCheckPlanning(types, edges, facts), ...crossCheckWatch(watch, types, edges));
  if (errors.length) return { ok: false, errors };

  return { ok: true, registry: { packs: ordered.map((p) => ({ id: p.id, version: p.version })), types, edges, reactions, events, facts, place, watch } };
}

/** Names used inside mind expressions and `serves` must exist across all loaded packs. */
function crossCheckMind(types: ReadonlyMap<string, TypeDef>): PackError[] {
  const errors: PackError[] = [];
  const all = [...types.values()];
  const names = (pred: (t: TypeDef) => boolean) => all.filter(pred).map((t) => t.name);
  const goals = names((t) => t.role === "goal");
  const needs = names((t) => t.role === "need");
  const emotions = names((t) => t.role === "emotion");
  const memorables = names((t) => t.memorable);

  for (const t of all) {
    const sources: [string, NumberSource][] = [];
    if (t.need) sources.push(["rate", t.need.rate]);
    if (t.goal) sources.push(["weight", t.goal.weight]);
    if (t.action?.restraint) sources.push(["restraint", t.action.restraint]);
    for (const [goal, src] of t.action?.serves ?? []) {
      sources.push([`serves.${goal}`, src]);
      if (!goals.includes(goal)) {
        errors.push({ pack: t.pack, path: `types.${t.name}.serves.${goal}`, message: `"${goal}" is not a goal type${suggest(goal, goals)}` });
      }
    }
    for (const [where, src] of sources) {
      if (!("expr" in src)) continue;
      for (const path of src.expr.paths) {
        const [root, name = ""] = path.split(".");
        const plan: readonly string[] = PLAN_FIELDS;
        const list = root === "needs" ? needs : root === "emotions" ? emotions : root === "knows" ? memorables : root === "plan" ? plan : undefined;
        if (list && !list.includes(name)) {
          const what = root === "needs" ? "need type" : root === "emotions" ? "emotion type" : root === "knows" ? "memorable entity type" : "plan field";
          const moved = root === "needs" && emotions.includes(name) ? ` ("${name}" is an emotion now: use emotions.${name})` : "";
          errors.push({ pack: t.pack, path: `types.${t.name}.${where}`, message: `"${path}": "${name}" is not a ${what}${moved}${suggest(name, list)}` });
        }
      }
    }
  }
  return errors;
}

/** Names inside build / recognise / spread rules must exist and fit. */
function crossCheckEntityRules(types: ReadonlyMap<string, TypeDef>, edges: ReadonlyMap<string, EdgeTypeDef>): PackError[] {
  const errors: PackError[] = [];
  const all = [...types.values()];
  const err = (t: TypeDef, path: string, message: string) => errors.push({ pack: t.pack, path: `types.${t.name}.${path}`, message });
  const edgeOk = (t: TypeDef, path: string, name: string, from: string, to: string) => {
    const e = edges.get(name);
    if (!e) err(t, path, `edge "${name}" is not defined${suggest(name, edges.keys())}`);
    else if ((e.from !== "any" && e.from !== from) || (e.to !== "any" && e.to !== to)) err(t, path, `edge "${name}" must go from ${from} to ${to}`);
  };
  for (const t of all) {
    const b = t.build;
    if (b) {
      const need = types.get(b.meets);
      if (!need || need.role !== "need") err(t, "build.meets", `"${b.meets}" is not a need type${suggest(b.meets, all.filter((x) => x.role === "need").map((x) => x.name))}`);
      const mat = types.get(b.material);
      if (!mat || !mat.memorable) err(t, "build.material", `"${b.material}" must be a memorable entity type (people have to find it)`);
      else if (mat.attrs.get(b.materialAttr)?.type !== "number") err(t, "build.materialAttr", `"${b.material}" has no number attribute "${b.materialAttr}"`);
      edgeOk(t, "build.planner", b.planner, "entity", "entity");
      edgeOk(t, "build.resident", b.resident, "entity", "entity");
      if ("expr" in b.when) {
        for (const path of b.when.expr.paths) {
          const [root, name = ""] = path.split(".");
          if (root === "needs" && types.get(name)?.role !== "need") err(t, "build.when", `"${path}": "${name}" is not a need type`);
        }
      }
    }
    const r = t.recognize;
    if (r) {
      const m = types.get(r.members);
      if (!m || m.kind !== "entity") err(t, "recognize.members", `"${r.members}" is not an entity type`);
      edgeOk(t, "recognize.memberEdge", r.memberEdge, "entity", "entity");
    }
  }
  return errors;
}

// ------------------------------------------------------------------ behaviour (ADR-0026)

function condition(c: Checker, raw: unknown, path: string, scope: readonly string[]): Compiled | undefined {
  const src = typeof raw === "string" ? raw : isObj(raw) && typeof raw["expr"] === "string" ? raw["expr"] : undefined;
  if (src === undefined) {
    c.err(path, "must be an expression, e.g. \"target.food > 0\"");
    return undefined;
  }
  try {
    return compile(src, scope);
  } catch (e) {
    c.err(path, e instanceof ExprError ? e.message : String(e));
    return undefined;
  }
}

const STEP_KEYS = ["goto", "work", "take", "give", "effect", "if", "finish", "stay"] as const;

function checkTarget(c: Checker, raw: unknown, path: string): Target | undefined {
  if (raw === "home" || raw === "plan" || raw === "target") return { kind: raw };
  if (isObj(raw)) {
    if ("known" in raw) {
      c.keys(raw, path, ["known", "where", "pick"]);
      if (typeof raw["known"] !== "string") return void c.err(`${path}.known`, "must be an entity type name");
      if (raw["pick"] !== undefined && raw["pick"] !== "nearest") c.err(`${path}.pick`, `only "nearest" for now`);
      const where = raw["where"] === undefined ? undefined : condition(c, raw["where"], `${path}.where`, WHERE_SCOPE);
      return { kind: "known", type: raw["known"], ...(where ? { where } : {}) };
    }
    if ("explore" in raw) {
      c.keys(raw, path, ["explore"]);
      return { kind: "explore" };
    }
    if ("wander" in raw) {
      c.keys(raw, path, ["wander"]);
      const r = raw["wander"];
      if (typeof r !== "number" || r <= 0) return void c.err(`${path}.wander`, "must be a radius in cells");
      return { kind: "wander", radius: r };
    }
    if ("linked" in raw) {
      c.keys(raw, path, ["linked", "pick"]);
      if (typeof raw["linked"] !== "string") return void c.err(`${path}.linked`, "must be an edge name");
      return { kind: "linked", edge: raw["linked"] };
    }
    if ("person" in raw) {
      c.keys(raw, path, ["person", "where", "within"]);
      if (raw["person"] !== "nearest") c.err(`${path}.person`, `only "nearest" for now`);
      const within = raw["within"] ?? 15;
      if (typeof within !== "number" || within <= 0) return void c.err(`${path}.within`, "must be a distance in cells");
      const where = raw["where"] === undefined ? undefined : condition(c, raw["where"], `${path}.where`, PERSON_WHERE_SCOPE);
      return { kind: "person", within, ...(where ? { where } : {}) };
    }
    if ("field" in raw) {
      c.keys(raw, path, ["field", "above"]);
      if (typeof raw["field"] !== "string") return void c.err(`${path}.field`, "must be a field name");
      const above = raw["above"] ?? 0.5;
      if (typeof above !== "number") return void c.err(`${path}.above`, "must be a number");
      return { kind: "field", field: raw["field"], above };
    }
  }
  c.err(path, `must be "home", "plan", "target", { "known": Type, "where": "..." }, { "explore": true }, { "wander": radius }, { "linked": edge }, { "person": "nearest", "where": "..." }, { "field": name, "above": 0.5 }, or a list of these`);
  return undefined;
}

function checkRef(c: Checker, raw: unknown, path: string, scope: readonly string[]): Ref | undefined {
  if (raw === "target") return { kind: "target" };
  if (raw === "other") return { kind: "other" };
  const expr = condition(c, raw, path, scope);
  return expr ? { kind: "expr", expr } : undefined;
}

function checkEffects(c: Checker, raw: unknown, path: string, scope: readonly string[]): Effect[] | undefined {
  if (!isObj(raw)) {
    c.err(path, `must be an object like { "needs.Hunger": "-0.5" }`);
    return undefined;
  }
  const out: Effect[] = [];
  for (const [key, v] of Object.entries(raw)) {
    const p = `${path}.${key}`;
    if (key === "link" || key === "unlink") {
      if (!isObj(v) || typeof v["edge"] !== "string") {
        c.err(p, `must look like { "edge": "grudge", "to": "other" }`);
        continue;
      }
      c.keys(v, p, ["edge", "to", "mutual", "add", "set"]);
      const to = checkRef(c, v["to"] ?? "target", `${p}.to`, scope);
      const data = (k: "add" | "set"): Map<string, NumberSource> => {
        const m = new Map<string, NumberSource>();
        const d = v[k];
        if (d === undefined) return m;
        if (!isObj(d)) {
          c.err(`${p}.${k}`, `must look like { "warmth": 1 }`);
          return m;
        }
        for (const [f, x] of Object.entries(d)) {
          const src = numberSource(c, x, `${p}.${k}.${f}`, scope);
          if (src) m.set(f, src);
        }
        return m;
      };
      const add = data("add");
      const set = data("set");
      if (to) out.push({ kind: key, edge: v["edge"], to, mutual: v["mutual"] === true, add, set });
      continue;
    }
    if (key === "kill") {
      const who = checkRef(c, v, p, scope);
      if (who) out.push({ kind: "kill", who });
      continue;
    }
    if (key === "event") {
      if (!isObj(v) || typeof v["name"] !== "string") {
        c.err(p, `must look like { "name": "Murder", "about": "target" }`);
        continue;
      }
      c.keys(v, p, ["name", "about"]);
      const about = v["about"] === undefined ? undefined : checkRef(c, v["about"], `${p}.about`, scope);
      out.push({ kind: "event", name: v["name"], ...(about ? { about } : {}) });
      continue;
    }
    if (key === "prefer") {
      if (!isObj(v) || typeof v["method"] !== "string") {
        c.err(p, `must look like { "method": "Attack", "add": -0.2 } (method "action": the action that just ended)`);
        continue;
      }
      c.keys(v, p, ["method", "add", "on"]);
      const on = v["on"] ?? "self";
      if (on !== "self" && on !== "other" && on !== "target") c.err(`${p}.on`, `must be "self", "other" or "target"`);
      const add = numberSource(c, v["add"] ?? 0.1, `${p}.add`, [...scope, "preference"]);
      if (add) out.push({ kind: "prefer", on: on as Who, method: v["method"], add });
      continue;
    }
    if (key === "teach" || key === "tell") {
      if (!isObj(v)) {
        c.err(p, key === "teach" ? `must look like { "to": "other", "method": "any" }` : `must look like { "to": "other", "what": "any", "count": 2 }`);
        continue;
      }
      c.keys(v, p, key === "teach" ? ["to", "method", "mutual"] : ["to", "what", "count", "mutual"]);
      const to = checkRef(c, v["to"] ?? "other", `${p}.to`, scope);
      const mutual = v["mutual"] === true;
      if (key === "teach") {
        const method = v["method"] ?? "any";
        if (typeof method !== "string") c.err(`${p}.method`, `must be an action name or "any"`);
        else if (to) out.push({ kind: "teach", to, method, mutual });
      } else {
        const what = v["what"] ?? "any";
        const count = numberIn(c, v, "count", p, { min: 1, int: true, def: 1 });
        if (typeof what !== "string") c.err(`${p}.what`, `must be a memorable type, an event name or "any"`);
        else if (to && count !== undefined) out.push({ kind: "tell", to, what, count, mutual });
      }
      continue;
    }
    const parts = key.split(".");
    const [root, a, b] = parts;
    const level = (x: string | undefined) => x === "needs" || x === "emotions";
    const who: Who | undefined = level(root) ? "self" : root === "self" || root === "target" || root === "other" ? root : undefined;
    const isNeed = level(root) ? parts.length === 2 : level(a) && parts.length === 3;
    const isSet = !level(root) && !level(a) && parts.length === 2;
    if (!who || !(isNeed || isSet)) {
      c.err(p, `effect keys are "needs.<Need>", "emotions.<Emotion>", "other.needs.<Need>", "target.emotions.<Emotion>", "self.<attr>", "target.<attr>", "other.<attr>", "link", "unlink", "kill", "event", "prefer", "teach" or "tell"`);
      continue;
    }
    const value = numberSource(c, v, p, scope);
    if (!value) continue;
    const role = (level(root) ? root : a) === "emotions" ? "emotion" : "need";
    if (isNeed) out.push({ kind: "need", on: who, need: level(root) ? a! : b!, role, delta: value });
    else out.push({ kind: "set", on: who, attr: a!, value });
  }
  return out;
}

function checkSteps(c: Checker, raw: unknown, path: string): Step[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    c.err(path, `actions need "steps": a list like [{ "goto": { "explore": true } }]`);
    return undefined;
  }
  const out: Step[] = [];
  raw.forEach((step, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(step)) return c.err(p, "each step is an object with one of: " + STEP_KEYS.join(", "));
    const main = STEP_KEYS.filter((k) => k in step);
    if (main.length !== 1) return c.err(p, `each step needs exactly one of: ${STEP_KEYS.join(", ")}`);
    const kind = main[0]!;
    if (kind === "goto") {
      c.keys(step, p, ["goto", "optional"]);
      const raws = Array.isArray(step["goto"]) ? step["goto"] : [step["goto"]];
      const targets = raws.map((r, j) => checkTarget(c, r, Array.isArray(step["goto"]) ? `${p}.goto[${j}]` : `${p}.goto`));
      if (raws.length === 0) c.err(`${p}.goto`, "needs at least one target");
      else if (targets.every((t) => t)) out.push({ kind: "goto", targets: targets as Target[], optional: step["optional"] === true });
    } else if (kind === "work") {
      c.keys(step, p, ["work", "progress"]);
      const duration = numberSource(c, step["work"], `${p}.work`, STEP_SCOPE);
      const progress = step["progress"];
      if (progress !== undefined && typeof progress !== "string") c.err(`${p}.progress`, "must be an attribute name on the target");
      if (duration) out.push({ kind: "work", duration, ...(typeof progress === "string" ? { progress } : {}) });
    } else if (kind === "take" || kind === "give") {
      c.keys(step, p, [kind]);
      const t = step[kind];
      if (!isObj(t)) return c.err(`${p}.${kind}`, `must look like { "from": "food", "to": "carrying", "amount": 1 }`);
      c.keys(t, `${p}.${kind}`, ["from", "to", "amount"]);
      const amount = numberSource(c, t["amount"] ?? 1, `${p}.${kind}.amount`, STEP_SCOPE);
      if (typeof t["from"] !== "string") return c.err(`${p}.${kind}.from`, "must be an attribute name");
      if (kind === "give" && typeof t["to"] !== "string") return c.err(`${p}.give.to`, "must be an attribute name on the target");
      if (t["to"] !== undefined && typeof t["to"] !== "string") return c.err(`${p}.${kind}.to`, "must be an attribute name");
      if (!amount) return;
      if (kind === "take") out.push({ kind, from: t["from"], ...(typeof t["to"] === "string" ? { to: t["to"] } : {}), amount });
      else out.push({ kind, from: t["from"], to: t["to"] as string, amount });
    } else if (kind === "effect") {
      c.keys(step, p, ["effect"]);
      const effects = checkEffects(c, step["effect"], `${p}.effect`, STEP_SCOPE);
      if (effects) out.push({ kind: "effect", effects });
    } else if (kind === "if") {
      c.keys(step, p, ["if"]);
      const cond = condition(c, step["if"], `${p}.if`, STEP_SCOPE);
      if (cond) out.push({ kind: "if", cond });
    } else if (kind === "finish") {
      c.keys(step, p, ["finish"]);
      if (step["finish"] !== "plan") c.err(`${p}.finish`, `only "plan" can be finished for now`);
      out.push({ kind: "finish" });
    } else {
      c.keys(step, p, ["stay"]);
      out.push({ kind: "stay" });
    }
  });
  return out;
}

function checkMemory(c: Checker, raw: unknown, p: string): MemoryRule | undefined {
  if (!isObj(raw)) {
    c.err(p, "must be an object");
    return undefined;
  }
  c.keys(raw, p, ["recall", "fade", "reinforce", "forgetBelow"]);
  const recall = numberSource(c, raw["recall"] ?? 1, `${p}.recall`, ["self"]);
  const fade = numberSource(c, raw["fade"] ?? 0, `${p}.fade`, ["self"]);
  const reinforce = numberSource(c, raw["reinforce"] ?? 1, `${p}.reinforce`, ["self", "confidence"]);
  const forgetBelow = numberIn(c, raw, "forgetBelow", p, { min: 0, max: 1, def: 0 });
  if (!recall || !fade || !reinforce || forgetBelow === undefined) return undefined;
  return { recall, fade, reinforce, forgetBelow };
}

/** Names inside steps, effects and reactions must exist across all loaded packs. */
function crossCheckBehaviour(
  types: ReadonlyMap<string, TypeDef>,
  edges: ReadonlyMap<string, EdgeTypeDef>,
  reactions: readonly Reaction[],
  events: ReadonlyMap<string, EventDef>,
): PackError[] {
  const errors: PackError[] = [];
  const all = [...types.values()];
  const needs = all.filter((t) => t.role === "need").map((t) => t.name);
  const emotions = all.filter((t) => t.role === "emotion").map((t) => t.name);
  const traits = all.filter((t) => t.role === "trait").map((t) => t.name);
  const actions = all.filter((t) => t.role === "action").map((t) => t.name);
  const edgeErr = (pack: string, path: string, name: string) =>
    errors.push({ pack, path, message: `edge "${name}" is not defined${suggest(name, edges.keys())}` });
  const levelErr = (pack: string, path: string, root: string, name: string) => {
    const list = root === "emotions" ? emotions : needs;
    if (list.includes(name)) return;
    const other = root === "emotions" ? needs : emotions;
    const hint = other.includes(name) ? ` ("${name}" is ${root === "emotions" ? "a need: use needs" : "an emotion now: use emotions"}.${name})` : suggest(name, list);
    errors.push({ pack, path, message: `"${name}" is not ${root === "emotions" ? "an emotion" : "a need"} type${hint}` });
  };
  const checkEffectList = (pack: string, path: string, effects: readonly Effect[]) => {
    effects.forEach((e) => {
      if (e.kind === "need") levelErr(pack, `${path}.${e.role === "emotion" ? "emotions" : "needs"}.${e.need}`, e.role === "emotion" ? "emotions" : "needs", e.need);
      if (e.kind === "prefer" && e.method !== "action" && !actions.includes(e.method)) errors.push({ pack, path: `${path}.prefer.method`, message: `"${e.method}" is not an action type${suggest(e.method, actions)}` });
      if (e.kind === "teach" && e.method !== "any" && !actions.includes(e.method)) errors.push({ pack, path: `${path}.teach.method`, message: `"${e.method}" is not an action type${suggest(e.method, actions)}` });
      if (e.kind === "tell" && e.what !== "any" && !types.get(e.what)?.memorable && !events.has(e.what)) {
        errors.push({ pack, path: `${path}.tell.what`, message: `"${e.what}" is neither a memorable entity type nor an event${suggest(e.what, [...all.filter((t) => t.memorable).map((t) => t.name), ...events.keys()])}` });
      }
      if ((e.kind === "link" || e.kind === "unlink") && !edges.has(e.edge)) edgeErr(pack, `${path}.${e.kind}`, e.edge);
      if (e.kind === "event" && !events.has(e.name)) errors.push({ pack, path: `${path}.event`, message: `event "${e.name}" is not declared in any pack's "events"${suggest(e.name, events.keys())}` });
    });
  };
  const checkPaths = (pack: string, path: string, expr: Compiled | undefined) => {
    for (const ref of expr?.paths ?? []) {
      const [root, name = ""] = ref.split(".");
      if ((root === "rel" || root === "bond" || root === "links") && !edges.has(name)) errors.push({ pack, path, message: `"${ref}": edge "${name}" is not defined${suggest(name, edges.keys())}` });
      if (root === "needs" || root === "emotions") {
        const before = errors.length;
        levelErr(pack, path, root, name);
        if (errors.length > before) errors[errors.length - 1] = { ...errors[errors.length - 1]!, message: `"${ref}": ${errors[errors.length - 1]!.message}` };
      }
      if (root === "traits" && !traits.includes(name)) errors.push({ pack, path, message: `"${ref}": "${name}" is not a trait type${suggest(name, traits)}` });
      if ((root === "did" || root === "reports") && !events.has(name)) errors.push({ pack, path, message: `"${ref}": "${name}" is not an event${suggest(name, events.keys())}` });
    }
  };
  const sourcePaths = (pack: string, path: string, src: NumberSource | undefined) => {
    if (src && "expr" in src) checkPaths(pack, path, src.expr);
  };
  for (const t of all) {
    if (t.need) sourcePaths(t.pack, `types.${t.name}.rate`, t.need.rate);
    if (t.goal) sourcePaths(t.pack, `types.${t.name}.weight`, t.goal.weight);
    if (t.action?.restraint) sourcePaths(t.pack, `types.${t.name}.restraint`, t.action.restraint);
    for (const key of t.scales?.keys() ?? []) {
      const [what, name] = key.split(".");
      if (!name) continue;
      const role = what === "restraint" ? "action" : what;
      const target = types.get(name);
      if (target?.role !== role) {
        const list = all.filter((x) => x.role === role).map((x) => x.name);
        errors.push({ pack: t.pack, path: `types.${t.name}.scales.${key}`, message: `"${name}" is not ${role === "action" || role === "emotion" ? "an" : "a"} ${role} type${suggest(name, list)}` });
      }
    }
    for (const [g, src] of t.action?.serves ?? []) sourcePaths(t.pack, `types.${t.name}.serves.${g}`, src);
    t.action?.steps.forEach((s, i) => {
      const path = `types.${t.name}.steps[${i}]`;
      if (s.kind === "goto") {
        for (const target of s.targets) {
          if (target.kind === "known") {
            const tt = types.get(target.type);
            if (!tt?.memorable) {
              errors.push({ pack: t.pack, path: `${path}.goto.known`, message: `"${target.type}" must be a memorable entity type (people go only to what they know)` });
            } else {
              for (const ref of target.where?.paths ?? []) {
                const [root, name = ""] = ref.split(".");
                if (root === "it" && !tt.remember.includes(name)) {
                  errors.push({ pack: t.pack, path: `${path}.goto.where`, message: `"${ref}": people don't remember "${name}" of ${tt.name}; add it to ${tt.name}.remember` });
                }
              }
            }
          }
          if (target.kind === "linked" && !edges.has(target.edge)) edgeErr(t.pack, `${path}.goto.linked`, target.edge);
          if (target.kind === "person") checkPaths(t.pack, `${path}.goto.where`, target.where);
        }
      }
      if (s.kind === "effect") checkEffectList(t.pack, `${path}.effect`, s.effects);
      if (s.kind === "if") checkPaths(t.pack, `${path}.if`, s.cond);
    });
    for (const r of t.remember) {
      if (!t.attrs.has(r)) errors.push({ pack: t.pack, path: `types.${t.name}.remember`, message: `"${r}" is not an attribute of ${t.name}` });
    }
  }
  for (const r of reactions) {
    const path = `reactions[${r.index}]`;
    checkEffectList(r.pack, `${path}.do`, r.effects);
    checkPaths(r.pack, `${path}.if`, r.cond);
  }
  return errors;
}

// ------------------------------------------------------------------ planning (ADR-0033)

/**
 * Facts a method's steps imply it needs: a `goto` that isn't optional needs somewhere
 * to go. `known.Tree` holds when the person remembers a tree matching the step's `where`.
 */
export function impliedRequires(steps: readonly Step[]): { fact: string; target: Target }[] {
  const out: { fact: string; target: Target }[] = [];
  for (const s of steps) {
    if (s.kind !== "goto" || s.optional) continue;
    // Alternatives: any one will do, so only a single-target goto implies a fact.
    if (s.targets.length !== 1) continue;
    const t = s.targets[0]!;
    const fact = targetFact(t);
    if (fact) out.push({ fact, target: t });
  }
  return out;
}

/** The fact a goto target needs, if any. */
export function targetFact(t: Target): string | undefined {
  switch (t.kind) {
    case "known":
      return `known.${t.type}`;
    case "linked":
      return `linked.${t.edge}`;
    case "home":
    case "plan":
    case "person":
      return t.kind;
    default:
      return undefined;
  }
}

/** Facts a method's steps imply it gives: exploring can make a person know any memorable thing. */
export function impliedGives(steps: readonly Step[]): string[] {
  return steps.some((s) => s.kind === "goto" && s.targets.some((t) => t.kind === "explore")) ? ["known.*"] : [];
}

/** `requires` and `gives` name facts a pack declared, or facts the engine knows how to read. */
function crossCheckPlanning(types: ReadonlyMap<string, TypeDef>, edges: ReadonlyMap<string, EdgeTypeDef>, facts: ReadonlyMap<string, FactDef>): PackError[] {
  const errors: PackError[] = [];
  const all = [...types.values()];
  const memorables = all.filter((t) => t.memorable).map((t) => t.name);
  const valid = (f: string): boolean => {
    if (facts.has(f) || f === "home" || f === "plan" || f === "person" || f === "known.*") return true;
    const [root, name = ""] = f.split(".");
    if (root === "known") return memorables.includes(name);
    if (root === "linked") return edges.has(name);
    return false;
  };
  const known = [...facts.keys(), "home", "plan", "person", "known.*", ...memorables.map((m) => `known.${m}`), ...[...edges.keys()].map((e) => `linked.${e}`)];
  for (const t of all) {
    if (!t.action) continue;
    for (const key of ["requires", "gives"] as const) {
      for (const f of t.action[key]) {
        if (!valid(f)) errors.push({ pack: t.pack, path: `types.${t.name}.${key}`, message: `"${f}" is not a fact: declare it under "facts", or use known.<MemorableType>, known.*, linked.<edge>, home, plan or person${suggest(f, known)}` });
      }
    }
  }
  for (const f of facts.values()) {
    for (const ref of f.expr.paths) {
      const [root, name = ""] = ref.split(".");
      if (root === "needs" && types.get(name)?.role !== "need") errors.push({ pack: f.pack, path: `facts.${f.name}`, message: `"${ref}": "${name}" is not a need type` });
      if (root === "emotions" && types.get(name)?.role !== "emotion") errors.push({ pack: f.pack, path: `facts.${f.name}`, message: `"${ref}": "${name}" is not an emotion type` });
    }
  }
  return errors;
}

// ------------------------------------------------------------------ pack order and `extends` (ADR-0030)

/**
 * Before anything else: put packs in order (their given order, but always after
 * what they require), then apply `extends` in that order, so when several packs
 * change the same thing the later one wins. The result is a list of plain packs
 * with merged type definitions, checked as usual.
 */
function orderAndExtend(input: readonly unknown[]): { sources: unknown[]; errors: PackError[]; changedBy: Map<string, string[]> } {
  const errors: PackError[] = [];
  const changedBy = new Map<string, string[]>();
  const shells: { id: string; requires: string[]; raw: Obj }[] = [];
  input.forEach((raw, i) => {
    if (!isObj(raw) || typeof raw["pack"] !== "string") {
      shells.push({ id: `(pack #${i + 1})`, requires: [], raw: isObj(raw) ? raw : {} });
      return;
    }
    const req = Array.isArray(raw["requires"]) ? raw["requires"].filter((r): r is string => typeof r === "string") : [];
    shells.push({ id: raw["pack"], requires: req, raw });
  });
  const byId = new Map(shells.map((s) => [s.id, s]));
  const ordered: typeof shells = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (s: (typeof shells)[number]): void => {
    if (state.get(s.id)) return;
    state.set(s.id, "visiting");
    for (const r of s.requires) {
      const dep = byId.get(r);
      if (dep && state.get(r) !== "visiting") visit(dep);
    }
    state.set(s.id, "done");
    ordered.push(s);
  };
  for (const s of shells) visit(s);
  // Missing requirements and cycles are reported later with full detail.

  // Merge `extends` into the owners' type definitions, in order.
  const owners = new Map<string, { pack: string; spec: Obj }>();
  const merged = new Map<string, Map<string, Obj>>();
  for (const s of ordered) {
    const own = new Map<string, Obj>();
    const types = isObj(s.raw["types"]) ? s.raw["types"] : {};
    for (const [name, spec] of Object.entries(types)) {
      if (!isObj(spec)) continue;
      const copy = { ...spec };
      own.set(name, copy);
      if (!owners.has(name)) owners.set(name, { pack: s.id, spec: copy });
    }
    merged.set(s.id, own);
    const ext = s.raw["extends"];
    if (ext === undefined) continue;
    if (!isObj(ext)) {
      errors.push({ pack: s.id, path: "extends", message: `must look like { "Person": { "attrs": { ... } } }` });
      continue;
    }
    for (const [name, change] of Object.entries(ext)) {
      const owner = owners.get(name);
      if (!owner) {
        errors.push({ pack: s.id, path: `extends.${name}`, message: `there is no type "${name}" in a pack loaded before this one${suggest(name, owners.keys())}` });
        continue;
      }
      if (!isObj(change)) {
        errors.push({ pack: s.id, path: `extends.${name}`, message: "must be an object of the keys to change" });
        continue;
      }
      if ("kind" in change && change["kind"] !== owner.spec["kind"]) {
        errors.push({ pack: s.id, path: `extends.${name}.kind`, message: "the kind of a type can't be changed" });
        continue;
      }
      const next = mergeSpec(owner.spec, change);
      // Check the merged definition now, so problems are blamed on the extending pack.
      const probe = checkOne({ pack: s.id, version: "0.0.0", types: { [name]: next } }, 0);
      if (probe.errors.length) {
        for (const e of probe.errors) errors.push({ pack: s.id, path: e.path.replace(`types.${name}`, `extends.${name}`), message: e.message });
        continue;
      }
      for (const k of Object.keys(owner.spec)) delete owner.spec[k];
      Object.assign(owner.spec, next);
      changedBy.set(name, [...(changedBy.get(name) ?? []), s.id]);
    }
  }

  const sources = ordered.map((s) => {
    if (!isObj(s.raw) || !("types" in s.raw || "extends" in s.raw)) return s.raw;
    const { extends: _e, ...rest } = s.raw;
    const own = merged.get(s.id);
    return own && own.size ? { ...rest, types: Object.fromEntries(own) } : rest;
  });
  return { sources, errors, changedBy };
}

/** Maps (attrs, serves, edge data, place) merge key by key; everything else is replaced. */
function mergeSpec(base: Obj, change: Obj): Obj {
  const out: Obj = { ...base };
  for (const [k, v] of Object.entries(change)) {
    const b = base[k];
    if (["attrs", "serves", "scales"].includes(k) && isObj(b) && isObj(v)) out[k] = { ...b, ...v };
    else out[k] = v;
  }
  return out;
}
