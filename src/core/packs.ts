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
  readonly description?: string;
}

export type MindRole = "need" | "goal" | "action" | "trait";

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
}

/** Where a `goto` step leads. */
export type Target =
  | { readonly kind: "known"; readonly type: string; readonly where?: Compiled }
  | { readonly kind: "home" }
  | { readonly kind: "plan" }
  | { readonly kind: "explore" }
  | { readonly kind: "wander"; readonly radius: number }
  | { readonly kind: "linked"; readonly edge: string }
  | { readonly kind: "target" };

/** One step of an action. The engine knows steps, never mechanics (ADR-0027). */
export type Step =
  | { readonly kind: "goto"; readonly target: Target; readonly optional: boolean }
  | { readonly kind: "work"; readonly duration: NumberSource; readonly progress?: string }
  | { readonly kind: "take"; readonly from: string; readonly to?: string; readonly amount: NumberSource }
  | { readonly kind: "give"; readonly from: string; readonly to: string; readonly amount: NumberSource }
  | { readonly kind: "effect"; readonly effects: readonly Effect[] }
  | { readonly kind: "if"; readonly cond: Compiled }
  | { readonly kind: "finish" }
  | { readonly kind: "stay" };

/** Who an effect's link points at: the current target, the other person (meets), or an id expression. */
export type Ref = { readonly kind: "target" } | { readonly kind: "other" } | { readonly kind: "expr"; readonly expr: Compiled };

export type Effect =
  | { readonly kind: "need"; readonly need: string; readonly delta: NumberSource }
  | { readonly kind: "set"; readonly on: "self" | "target"; readonly attr: string; readonly value: NumberSource }
  | { readonly kind: "link" | "unlink"; readonly edge: string; readonly to: Ref };

/** Events a pack can react to. */
export const REACTION_EVENTS = ["sees", "meets", "found-empty", "finished", "dusk", "dawn"] as const;
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
export const MIND_SCOPE = ["needs", "night", "knows", "self", "doing", "plan", "home"] as const;
/** Inside steps the current target is readable too. */
export const STEP_SCOPE = [...MIND_SCOPE, "target"] as const;
/** A `known` target's `where` reads what the person remembers of the thing as `it`. */
export const WHERE_SCOPE = [...MIND_SCOPE, "it"] as const;
/** Reactions see the thing (`it`), the other person (`other`), relations to them (`rel`) and the finished action. */
export const REACTION_SCOPE = [...MIND_SCOPE, "it", "other", "rel", "action"] as const;
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
  readonly need?: NeedRule;
  readonly goal?: GoalRule;
  readonly action?: ActionRule;
  readonly build?: BuildRule;
  readonly recognize?: RecognizeRule;
  readonly spread?: SpreadRule;
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

export interface Registry {
  readonly packs: readonly { id: string; version: string }[];
  readonly types: ReadonlyMap<string, TypeDef>;
  readonly edges: ReadonlyMap<string, EdgeTypeDef>;
  readonly reactions: readonly Reaction[];
}

export interface PackError {
  /** Which pack, or "(packs)" for problems between packs. */
  readonly pack: string;
  /** Where inside the pack, e.g. "types.Tree.attrs.wood.default". */
  readonly path: string;
  readonly message: string;
}

export type CheckResult = { ok: true; registry: Registry } | { ok: false; errors: PackError[] };

export const EMPTY_REGISTRY: Registry = { packs: [], types: new Map(), edges: new Map(), reactions: [] };

export function formatPackError(e: PackError): string {
  return e.path ? `${e.pack} › ${e.path}: ${e.message}` : `${e.pack}: ${e.message}`;
}

// ------------------------------------------------------------------ helpers

const KINDS: readonly NodeKind[] = ["entity", "knowledge", "mind"];
const ROLES: readonly MindRole[] = ["need", "goal", "action", "trait"];
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
  need: ["start", "rate", "urgentAt"],
  goal: ["tier", "weight"],
  action: ["steps", "serves"],
  trait: [],
};
const ALL_MIND_KEYS: readonly string[] = Object.values(MIND_KEYS).flat();

function checkMind(c: Checker, spec: Obj, p: string, role: MindRole): Pick<TypeDef, "need" | "goal" | "action"> {
  for (const k of ALL_MIND_KEYS) {
    if (k in spec && !MIND_KEYS[role].includes(k)) {
      const owner = (Object.keys(MIND_KEYS) as MindRole[]).find((r) => MIND_KEYS[r].includes(k));
      c.err(`${p}.${k}`, `"${k}" belongs to ${owner} types, not ${role} types`);
    }
  }
  if (role === "need") {
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
    if (!isObj(raw)) {
      c.err(`${p}.serves`, `must be an object like { "Survive": 1 }`);
    } else {
      for (const [goal, v] of Object.entries(raw)) {
        const src = numberSource(c, v, `${p}.serves.${goal}`, MIND_SCOPE);
        if (src) serves.set(goal, src);
      }
    }
    return steps ? { action: { steps, serves } } : {};
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
    c.keys(spec, p, ["type", "default", "min", "max", "description"]);
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
    const description = c.optString(spec, "description", p);
    out.set(name, {
      name,
      type: attrType,
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
}

function checkOne(raw: unknown, index: number): { parts?: PackParts; errors: PackError[] } {
  if (!isObj(raw)) return { errors: [{ pack: `(pack #${index + 1})`, path: "", message: "a pack must be a JSON object" }] };
  const idRaw = raw["pack"];
  const id = typeof idRaw === "string" ? idRaw : `(pack #${index + 1})`;
  const c = new Checker(id);
  c.keys(raw, "", ["pack", "version", "description", "requires", "types", "edges", "reactions"]);

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
    c.keys(spec, p, ["kind", "leaf", "memorable", "remember", "memory", "role", "attrs", "description", "do", ...ALL_MIND_KEYS, ...ENTITY_RULE_KEYS]);
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

  if (c.errors.length) return { errors: c.errors };
  return { parts: { id, version: version as string, requires, types, edges, reactions }, errors: [] };
}

/**
 * Archie's check: every pack on its own, then between packs (missing or circular
 * requirements, the same type defined twice). Returns a registry or every error found.
 */
export function checkPacks(sources: readonly unknown[]): CheckResult {
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
  errors.push(...crossCheckMind(types), ...crossCheckEntityRules(types, edges), ...crossCheckBehaviour(types, edges, reactions));
  if (errors.length) return { ok: false, errors };

  return { ok: true, registry: { packs: ordered.map((p) => ({ id: p.id, version: p.version })), types, edges, reactions } };
}

/** Names used inside mind expressions and `serves` must exist across all loaded packs. */
function crossCheckMind(types: ReadonlyMap<string, TypeDef>): PackError[] {
  const errors: PackError[] = [];
  const all = [...types.values()];
  const names = (pred: (t: TypeDef) => boolean) => all.filter(pred).map((t) => t.name);
  const goals = names((t) => t.role === "goal");
  const needs = names((t) => t.role === "need");
  const memorables = names((t) => t.memorable);

  for (const t of all) {
    const sources: [string, NumberSource][] = [];
    if (t.need) sources.push(["rate", t.need.rate]);
    if (t.goal) sources.push(["weight", t.goal.weight]);
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
        const list = root === "needs" ? needs : root === "knows" ? memorables : root === "plan" ? plan : undefined;
        if (list && !list.includes(name)) {
          const what = root === "needs" ? "need type" : root === "knows" ? "memorable entity type" : "plan field";
          errors.push({ pack: t.pack, path: `types.${t.name}.${where}`, message: `"${path}": "${name}" is not a ${what}${suggest(name, list)}` });
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
  }
  c.err(path, `must be "home", "plan", "target", { "known": Type, "where": "..." }, { "explore": true }, { "wander": radius } or { "linked": edge }`);
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
      c.keys(v, p, ["edge", "to"]);
      const to = checkRef(c, v["to"] ?? "target", `${p}.to`, scope);
      if (to) out.push({ kind: key, edge: v["edge"], to });
      continue;
    }
    const [root, name, extra] = key.split(".");
    if (!name || extra !== undefined || !["needs", "self", "target"].includes(root!)) {
      c.err(p, `effect keys are "needs.<Need>", "self.<attr>", "target.<attr>", "link" or "unlink"`);
      continue;
    }
    const value = numberSource(c, v, p, scope);
    if (!value) continue;
    if (root === "needs") out.push({ kind: "need", need: name, delta: value });
    else out.push({ kind: "set", on: root as "self" | "target", attr: name, value });
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
      const target = checkTarget(c, step["goto"], `${p}.goto`);
      if (target) out.push({ kind: "goto", target, optional: step["optional"] === true });
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
function crossCheckBehaviour(types: ReadonlyMap<string, TypeDef>, edges: ReadonlyMap<string, EdgeTypeDef>, reactions: readonly Reaction[]): PackError[] {
  const errors: PackError[] = [];
  const all = [...types.values()];
  const needs = all.filter((t) => t.role === "need").map((t) => t.name);
  const checkEffectList = (pack: string, path: string, effects: readonly Effect[]) => {
    effects.forEach((e) => {
      if (e.kind === "need" && !needs.includes(e.need)) errors.push({ pack, path: `${path}.needs.${e.need}`, message: `"${e.need}" is not a need type${suggest(e.need, needs)}` });
      if ((e.kind === "link" || e.kind === "unlink") && !edges.has(e.edge)) errors.push({ pack, path: `${path}.${e.kind}`, message: `edge "${e.edge}" is not defined${suggest(e.edge, edges.keys())}` });
    });
  };
  const checkPaths = (pack: string, path: string, expr: Compiled | undefined) => {
    for (const ref of expr?.paths ?? []) {
      const [root, name = ""] = ref.split(".");
      if (root === "rel" && !edges.has(name)) errors.push({ pack, path, message: `"${ref}": edge "${name}" is not defined${suggest(name, edges.keys())}` });
      if (root === "needs" && !needs.includes(name)) errors.push({ pack, path, message: `"${ref}": "${name}" is not a need type${suggest(name, needs)}` });
    }
  };
  for (const t of all) {
    t.action?.steps.forEach((s, i) => {
      const path = `types.${t.name}.steps[${i}]`;
      if (s.kind === "goto" && s.target.kind === "known") {
        const tt = types.get(s.target.type);
        if (!tt?.memorable) {
          errors.push({ pack: t.pack, path: `${path}.goto.known`, message: `"${s.target.type}" must be a memorable entity type (people go only to what they know)` });
        } else {
          for (const ref of s.target.where?.paths ?? []) {
            const [root, name = ""] = ref.split(".");
            if (root === "it" && !tt.remember.includes(name)) {
              errors.push({ pack: t.pack, path: `${path}.goto.where`, message: `"${ref}": people don't remember "${name}" of ${tt.name}; add it to ${tt.name}.remember` });
            }
          }
        }
      }
      if (s.kind === "goto" && s.target.kind === "linked" && !edges.has(s.target.edge)) {
        errors.push({ pack: t.pack, path: `${path}.goto.linked`, message: `edge "${s.target.edge}" is not defined${suggest(s.target.edge, edges.keys())}` });
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
