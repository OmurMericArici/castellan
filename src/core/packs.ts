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
  /** The engine verb that carries the action out (Adam's machinery). */
  readonly verb: Verb;
  /** How much the action helps each goal. */
  readonly serves: ReadonlyMap<string, NumberSource>;
}

/** What Adam knows how to do physically. Packs decide when and why. */
export const VERBS = ["explore", "wander", "rest"] as const;
export type Verb = (typeof VERBS)[number];

/** Names a mind expression may read. */
export const MIND_SCOPE = ["needs", "night", "knows", "self", "doing"] as const;

export interface TypeDef {
  readonly name: string;
  readonly kind: NodeKind;
  readonly pack: string;
  /** Entities only: may Noah place it from outside? (ADR-0006) */
  readonly leaf: boolean;
  readonly role?: MindRole;
  /** Entities only: people form Sighting knowledge when they see it. */
  readonly memorable: boolean;
  readonly need?: NeedRule;
  readonly goal?: GoalRule;
  readonly action?: ActionRule;
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
}

export interface PackError {
  /** Which pack, or "(packs)" for problems between packs. */
  readonly pack: string;
  /** Where inside the pack, e.g. "types.Tree.attrs.wood.default". */
  readonly path: string;
  readonly message: string;
}

export type CheckResult = { ok: true; registry: Registry } | { ok: false; errors: PackError[] };

export const EMPTY_REGISTRY: Registry = { packs: [], types: new Map(), edges: new Map() };

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
  c.err(path, `must be a number or { "expr": "..." }`);
  return undefined;
}

const MIND_KEYS: Record<MindRole, readonly string[]> = {
  need: ["start", "rate", "urgentAt"],
  goal: ["tier", "weight"],
  action: ["do", "serves"],
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
    const verb = spec["do"];
    const verbOk = typeof verb === "string" && (VERBS as readonly string[]).includes(verb);
    if (!verbOk) {
      const hint = typeof verb === "string" ? suggest(verb, VERBS) : "";
      c.err(`${p}.do`, `actions need a verb Adam knows: ${VERBS.join(", ")}${hint}`);
    }
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
    return verbOk ? { action: { verb: verb as Verb, serves } } : {};
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
}

function checkOne(raw: unknown, index: number): { parts?: PackParts; errors: PackError[] } {
  if (!isObj(raw)) return { errors: [{ pack: `(pack #${index + 1})`, path: "", message: "a pack must be a JSON object" }] };
  const idRaw = raw["pack"];
  const id = typeof idRaw === "string" ? idRaw : `(pack #${index + 1})`;
  const c = new Checker(id);
  c.keys(raw, "", ["pack", "version", "description", "requires", "types", "edges"]);

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
    c.keys(spec, p, ["kind", "leaf", "memorable", "role", "attrs", "description", ...ALL_MIND_KEYS]);
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
    const description = c.optString(spec, "description", p);
    types.push({
      name,
      kind: kind as NodeKind,
      pack: id,
      leaf: leaf === true,
      memorable: memorable === true,
      ...mind,
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

  if (c.errors.length) return { errors: c.errors };
  return { parts: { id, version: version as string, requires, types, edges }, errors: [] };
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
  errors.push(...crossCheckMind(types));
  if (errors.length) return { ok: false, errors };

  return { ok: true, registry: { packs: ordered.map((p) => ({ id: p.id, version: p.version })), types, edges } };
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
        const list = root === "needs" ? needs : root === "knows" ? memorables : undefined;
        if (list && !list.includes(name)) {
          const what = root === "needs" ? "need type" : "memorable entity type";
          errors.push({ pack: t.pack, path: `types.${t.name}.${where}`, message: `"${path}": "${name}" is not a ${what}${suggest(name, list)}` });
        }
      }
    }
  }
  return errors;
}
