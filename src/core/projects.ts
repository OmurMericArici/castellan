import type { GraphNode, NodeId } from "./graph";
import type { BuildRule, TypeDef } from "./packs";
import type { World } from "./world";

/**
 * Read-only helpers about building projects and knowledge, shared by Adam and
 * Molly. They read the graph; they never change it.
 */
export function buildTypes(world: World): TypeDef[] {
  return [...world.registry.types.values()].filter((t) => t.build);
}

export interface Plan {
  readonly node: GraphNode;
  readonly rule: BuildRule;
  /** Material not yet delivered to the site (what they carry still counts as missing). */
  readonly missing: number;
  readonly ready: boolean;
}

/** The person's unfinished project (a planned concept they are linked to as planner). */
export function planOf(world: World, person: NodeId): Plan | undefined {
  const g = world.graph;
  for (const t of buildTypes(world)) {
    const rule = t.build!;
    for (const e of g.edgesOf(person, rule.planner)) {
      if (e.from !== person) continue;
      const node = g.node(e.to);
      if (!node || node.type !== t.name || node.attrs["state"] !== "planned") continue;
      const stock = num(node.attrs["stock"]);
      return { node, rule, missing: Math.max(0, rule.amount - stock), ready: stock >= rule.amount };
    }
  }
  return undefined;
}

/** The finished thing the person lives in, if any. */
export function homeOf(world: World, person: NodeId): GraphNode | undefined {
  const g = world.graph;
  for (const t of buildTypes(world)) {
    for (const e of g.edgesOf(person, t.build!.resident)) {
      if (e.from !== person) continue;
      const node = g.node(e.to);
      if (node && node.attrs["state"] === "built") return node;
    }
  }
  return undefined;
}

/** Things the person knows of (through shared claims), optionally of one type. */
export function knownSubjects(world: World, person: NodeId, type?: string): GraphNode[] {
  const g = world.graph;
  const out: GraphNode[] = [];
  const seen = new Set<NodeId>();
  for (const k of g.edgesOf(person, "knows")) {
    if (k.from !== person) continue;
    for (const a of g.edgesOf(k.to, "about")) {
      const s = g.node(a.to);
      if (!s || seen.has(s.id) || (type && s.type !== type)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

export function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
