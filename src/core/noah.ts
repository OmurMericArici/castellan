import type { Attrs } from "./graph";
import { createRng, hash2, hashString } from "./rng";
import type { SpaceSpec } from "./space";
import { createNode, emit } from "./world";
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
  /** A leaf type name, e.g. "Tree". From M2 on, Archie checks it is a leaf type from a loaded pack. */
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
  if (world.log.length > 0) throw new Error("Noah only works on an empty world");
  emit(world, "noah", { kind: "space.defined", spec: config.space });
  const space = world.space;
  if (!space) throw new Error("space was not created");

  const report: GenesisReport = { placed: [] };
  config.leaves.forEach((spec, index) => {
    if (!Number.isInteger(spec.count) || spec.count < 0) {
      throw new Error(`leaf "${spec.type}": count must be a whole number ≥ 0, got ${spec.count}`);
    }
    const prefer = spec.prefer ? space.field(spec.prefer) : undefined;
    const avoid = (spec.avoid ?? []).map((a) => ({ field: space.field(a.field), above: a.above }));
    const rng = createRng(world.seed).fork(hash2(hashString(`noah:${spec.type}`), index));

    let placed = 0;
    for (let tries = 0; placed < spec.count && tries < spec.count * TRIES_PER_LEAF; tries++) {
      const x = rng.next() * space.width;
      const y = rng.next() * space.height;
      if (avoid.some((a) => a.field.sample(x, y) > a.above)) continue;
      if (prefer && rng.next() >= prefer.sample(x, y)) continue;
      createNode(world, "noah", { kind: "entity", type: spec.type, pos: { x, y }, attrs: { ...spec.attrs } });
      placed++;
    }
    report.placed.push({ type: spec.type, requested: spec.count, placed });
  });
  return report;
}
