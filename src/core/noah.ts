import { instantiateAttrs, requireType } from "./archie";
import type { Attrs } from "./graph";
import type { Registry } from "./packs";
import { createRng, hash2, hashString } from "./rng";
import type { SpaceSpec } from "./space";
import { emit } from "./world";
import type { World } from "./world";

/**
 * Noah starts a world (ADR-0017): defines the space and places the first leaves.
 * The user configures Noah; nothing else from outside touches the world.
 */
export interface NoahConfig {
  space: SpaceSpec;
  leaves: LeafSpec[];
}

export interface LeafSpec {
  /** A leaf entity type from a loaded pack, e.g. "Tree". */
  type: string;
  count: number;
  attrs?: Attrs;
  /** Likelier where this field is high (acceptance chance = field value). */
  prefer?: string;
  /** Never where these fields are above the limit, e.g. no trees in water. */
  avoid?: { field: string; above: number }[];
}

export interface GenesisReport {
  /** How many of each spec could be placed; fewer than asked means the land didn't allow it. */
  placed: { type: string; requested: number; placed: number }[];
}

const TRIES_PER_LEAF = 200;

export function genesis(world: World, config: NoahConfig): GenesisReport {
  const used = world.space !== undefined || world.graph.nodeCount > 0;
  if (used) throw new Error("Noah only works on an empty world");
  if (world.registry.types.size === 0) throw new Error("load packs first: Noah can only place types that packs define");
  // Check every spec before touching the world, so a bad config changes nothing.
  for (const spec of config.leaves) {
    const type = requireType(world.registry, spec.type, "entity");
    if (!type.leaf) {
      throw new Error(`"${spec.type}" is not a leaf type (pack "${type.pack}"); Noah can only place leaves, derived things must emerge`);
    }
  }
  emit(world, "noah", { kind: "space.defined", spec: config.space });
  const space = world.space;
  if (!space) throw new Error("space was not created");

  const report: GenesisReport = { placed: [] };
  config.leaves.forEach((spec, index) => {
    if (!Number.isInteger(spec.count) || spec.count < 0) {
      throw new Error(`leaf "${spec.type}": count must be a whole number ≥ 0, got ${spec.count}`);
    }
    const type = requireType(world.registry, spec.type, "entity");
    const prefer = spec.prefer ? space.field(spec.prefer) : undefined;
    const avoid = (spec.avoid ?? []).map((a) => ({ field: space.field(a.field), above: a.above }));
    const rng = createRng(world.seed).fork(hash2(hashString(`noah:${spec.type}`), index));

    let placed = 0;
    for (let tries = 0; placed < spec.count && tries < spec.count * TRIES_PER_LEAF; tries++) {
      const x = rng.next() * space.width;
      const y = rng.next() * space.height;
      if (avoid.some((a) => a.field.sample(x, y) > a.above)) continue;
      if (prefer && rng.next() >= prefer.sample(x, y)) continue;
      const id = world.graph.allocateNodeId();
      const attrs = instantiateAttrs(type, createRng(world.seed).fork(hash2(id, 0x6e6f6168)), spec.attrs);
      emit(world, "noah", { kind: "node.created", node: { id, kind: "entity", type: spec.type, pos: { x, y }, attrs } });
      placed++;
    }
    report.placed.push({ type: spec.type, requested: spec.count, placed });
  });
  return report;
}

/**
 * Noah's configuration with the packs' placement suggestions filled in (ADR-0029):
 * leaves the config names keep the config's numbers; leaves only a pack suggests
 * are added; leaves of types no loaded pack defines are dropped.
 */
export function withPackPlacement(config: NoahConfig, registry: Registry): NoahConfig {
  const known = (t: string) => registry.types.get(t)?.leaf === true;
  const leaves = config.leaves.filter((l) => known(l.type));
  for (const p of registry.place.values()) {
    if (leaves.some((l) => l.type === p.type)) continue;
    leaves.push({ type: p.type, count: p.count, ...(p.prefer ? { prefer: p.prefer } : {}), avoid: [...p.avoid] });
  }
  return { ...config, leaves };
}
