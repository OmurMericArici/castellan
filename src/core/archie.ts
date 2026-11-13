import { evaluate, ExprError } from "./expr";
import type { Attrs, AttrValue, NodeKind } from "./graph";
import { checkPacks, formatPackError } from "./packs";
import type { AttrDef, PackError, Registry, TypeDef } from "./packs";
import type { Rng } from "./rng";
import { emit } from "./world";
import type { World } from "./world";

/**
 * Archie, the architect (ADR-0018): loads packs into a world after checking them.
 * Loading is an event, so a world's log records which rules it ran under and
 * replays with exactly the same packs.
 */
export class PackLoadError extends Error {
  constructor(readonly errors: readonly PackError[]) {
    super(`Archie rejected the packs:\n${errors.map((e) => `  - ${formatPackError(e)}`).join("\n")}`);
  }
}

export function loadPacks(world: World, sources: readonly unknown[]): Registry {
  const result = checkPacks([...world.packs, ...sources]);
  if (!result.ok) throw new PackLoadError(result.errors);
  // Emit in dependency order, skipping packs the world already has.
  const already = new Set(world.registry.packs.map((p) => p.id));
  const byId = new Map(sources.map((s) => [(s as { pack: string }).pack, s]));
  for (const p of result.registry.packs) {
    if (already.has(p.id)) continue;
    const source = byId.get(p.id);
    if (source !== undefined) emit(world, "archie", { kind: "pack.loaded", source: JSON.parse(JSON.stringify(source)) as unknown });
  }
  return world.registry;
}

/** Look up a type, with a clear error if a rule or Noah names one that doesn't exist. */
export function requireType(registry: Registry, name: string, kind?: NodeKind): TypeDef {
  const t = registry.types.get(name);
  if (!t) {
    const known = [...registry.types.keys()];
    throw new Error(`unknown type "${name}"; loaded packs define: ${known.join(", ") || "nothing"}`);
  }
  if (kind && t.kind !== kind) throw new Error(`"${name}" is a ${t.kind} type, not ${kind}`);
  return t;
}

/**
 * Concrete attribute values for a new node: defaults from the pack (expressions
 * evaluated with the node's own generator), then overrides, all checked against
 * the type. The result goes into the creating event, so replay never re-rolls.
 */
export function instantiateAttrs(type: TypeDef, rng: Rng, overrides: Attrs = {}): Attrs {
  const out: Attrs = {};
  for (const [name, def] of type.attrs) {
    if (name in overrides) continue;
    if (!def.default) continue;
    if ("literal" in def.default) {
      out[name] = def.default.literal;
    } else {
      try {
        out[name] = checkValue(type.name, def, evaluate(def.default.expr, { rng }));
      } catch (e) {
        const msg = e instanceof ExprError ? e.message : String(e);
        throw new Error(`${type.pack} › types.${type.name}.attrs.${name}.default: ${msg}`);
      }
    }
  }
  for (const [name, value] of Object.entries(overrides)) {
    const def = type.attrs.get(name);
    if (!def) {
      const known = [...type.attrs.keys()];
      throw new Error(`type "${type.name}" has no attribute "${name}"; it has: ${known.join(", ") || "none"}`);
    }
    out[name] = checkValue(type.name, def, value);
  }
  return out;
}

function checkValue(typeName: string, def: AttrDef, value: AttrValue): AttrValue {
  if (typeof value !== def.type) {
    throw new Error(`${typeName}.${def.name} must be a ${def.type}, got ${JSON.stringify(value)}`);
  }
  if (typeof value === "number") {
    if (def.min !== undefined && value < def.min) return def.min;
    if (def.max !== undefined && value > def.max) return def.max;
  }
  return value;
}
