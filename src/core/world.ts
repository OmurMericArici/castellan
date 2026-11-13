import { Graph } from "./graph";
import type { Attrs, EdgeId, NodeId, NodeKind, Vec2 } from "./graph";
import { checkPacks, EMPTY_REGISTRY, formatPackError } from "./packs";
import type { Registry } from "./packs";
import { EventQueue } from "./queue";
import { hashString } from "./rng";
import { generateSpace } from "./space";
import type { Space, SpaceSpec } from "./space";

/**
 * Every change to the world is one of these (ADR-0013: one write channel).
 * Events are plain data, so the log can be saved, replayed and read as history.
 */
export type WorldEvent =
  | { kind: "pack.loaded"; source: unknown }
  | { kind: "space.defined"; spec: SpaceSpec }
  | { kind: "node.created"; node: NodeInit }
  | { kind: "edge.created"; edge: EdgeInit }
  | { kind: "edge.removed"; id: EdgeId }
  | { kind: "node.attrs"; id: NodeId; attrs: Attrs }
  | { kind: "node.moved"; id: NodeId; pos: Vec2 }
  /** Merge data into one end of an edge (a person's need level, a refreshed sighting). */
  | { kind: "edge.data"; id: EdgeId; end: "from" | "to"; data: Attrs }
  /** A person starts doing something; walking actions carry their whole leg. */
  | { kind: "activity"; person: NodeId; activity: Activity }
  /** Something Molly recognised that everyone can feel: dusk, dawn. */
  | { kind: "signal"; name: string };

/** What a person is doing right now. Position while walking is computed from the leg. */
export interface Activity {
  readonly action: string;
  readonly startedAt: number;
  readonly leg?: Leg;
}

export interface Leg {
  readonly path: readonly Vec2[];
  readonly depart: number;
  readonly arrive: number;
}

export interface NodeInit {
  id: NodeId;
  kind: NodeKind;
  type: string;
  pos?: Vec2;
  attrs: Attrs;
}

export interface EdgeInit {
  id: EdgeId;
  type: string;
  from: NodeId;
  to: NodeId;
  fromData: Attrs;
  toData: Attrs;
}

export interface LoggedEvent {
  /** World time in days. */
  readonly t: number;
  readonly seq: number;
  /** Who caused it: "noah", "molly", "entropy", "adam", "archie". */
  readonly by: string;
  readonly event: WorldEvent;
}

/** Something that will happen later; a handler turns it into events when its time comes. */
export interface Scheduled {
  readonly handler: string;
  readonly data?: unknown;
}

export type Handler = (world: World, data: unknown) => void;

export interface World {
  readonly seed: number;
  /** Current time in days (ADR-0022). */
  time: number;
  space: Space | undefined;
  /** Pack sources in load order, exactly as recorded in the log. */
  readonly packs: unknown[];
  /** Types and rules from the loaded packs (Archie). */
  registry: Registry;
  readonly graph: Graph;
  /** Current activity per person, set only by `activity` events. */
  readonly activities: Map<NodeId, Activity>;
  readonly log: LoggedEvent[];
  readonly queue: EventQueue<Scheduled>;
}

export function createWorld(seed: number): World {
  return {
    seed: seed >>> 0,
    time: 0,
    space: undefined,
    packs: [],
    registry: EMPTY_REGISTRY,
    graph: new Graph(),
    activities: new Map(),
    log: [],
    queue: new EventQueue<Scheduled>(),
  };
}

/** The only way to change a world: apply an event and record it. */
export function emit(world: World, by: string, event: WorldEvent): LoggedEvent {
  apply(world, event);
  const logged: LoggedEvent = { t: world.time, seq: world.log.length, by, event };
  world.log.push(logged);
  return logged;
}

function apply(world: World, event: WorldEvent): void {
  const g = world.graph;
  switch (event.kind) {
    case "pack.loaded": {
      const result = checkPacks([...world.packs, event.source]);
      if (!result.ok) throw new Error(`pack.loaded: ${result.errors.map(formatPackError).join("; ")}`);
      world.packs.push(event.source);
      world.registry = result.registry;
      return;
    }
    case "space.defined":
      if (world.space) throw new Error("the space is already defined");
      world.space = generateSpace(world.seed, event.spec);
      return;
    case "node.created": {
      const n = event.node;
      g.insertNode({ id: n.id, kind: n.kind, type: n.type, ...(n.pos ? { pos: n.pos } : {}), attrs: { ...n.attrs } });
      return;
    }
    case "edge.created": {
      const e = event.edge;
      g.insertEdge({ ...e, fromData: { ...e.fromData }, toData: { ...e.toData } });
      return;
    }
    case "edge.removed":
      g.removeEdge(event.id);
      return;
    case "node.attrs": {
      const n = g.node(event.id);
      if (!n) throw new Error(`node.attrs: node ${event.id} does not exist`);
      Object.assign(n.attrs, event.attrs);
      return;
    }
    case "node.moved": {
      const n = g.node(event.id);
      if (!n) throw new Error(`node.moved: node ${event.id} does not exist`);
      n.pos = event.pos;
      return;
    }
    case "edge.data": {
      const e = g.edge(event.id);
      if (!e) throw new Error(`edge.data: edge ${event.id} does not exist`);
      Object.assign(event.end === "from" ? e.fromData : e.toData, event.data);
      return;
    }
    case "activity":
      if (!g.node(event.person)) throw new Error(`activity: node ${event.person} does not exist`);
      world.activities.set(event.person, event.activity);
      return;
    case "signal":
      return;
  }
}

/** Create a node through an event and return its id. */
export function createNode(world: World, by: string, init: Omit<NodeInit, "id">): NodeId {
  const id = world.graph.allocateNodeId();
  emit(world, by, { kind: "node.created", node: { ...init, id } });
  return id;
}

/** Create an edge through an event and return its id. */
export function createEdge(
  world: World,
  by: string,
  init: Omit<EdgeInit, "id" | "fromData" | "toData"> & Partial<Pick<EdgeInit, "fromData" | "toData">>,
): EdgeId {
  const id = world.graph.allocateEdgeId();
  emit(world, by, {
    kind: "edge.created",
    edge: { ...init, id, fromData: init.fromData ?? {}, toData: init.toData ?? {} },
  });
  return id;
}

export function schedule(world: World, at: number, item: Scheduled) {
  if (at < world.time) throw new Error(`cannot schedule in the past (${at} < ${world.time})`);
  return world.queue.schedule(at, item);
}

/**
 * Run every scheduled happening up to and including `until`, in time order,
 * then set the clock to `until`. Quiet stretches cost nothing.
 */
export function runUntil(world: World, until: number, handlers: ReadonlyMap<string, Handler>): number {
  let processed = 0;
  for (;;) {
    const next = world.queue.peekTime();
    if (next === undefined || next > until) break;
    const popped = world.queue.pop();
    if (!popped) break;
    const handler = handlers.get(popped.item.handler);
    if (!handler) throw new Error(`no handler registered for "${popped.item.handler}"`);
    world.time = popped.time;
    handler(world, popped.item.data);
    processed++;
  }
  world.time = Math.max(world.time, until);
  return processed;
}

/** Rebuild a world from its log alone. Proves the log is the whole truth. */
export function replay(seed: number, log: readonly LoggedEvent[]): World {
  const world = createWorld(seed);
  for (const entry of log) {
    world.time = entry.t;
    emit(world, entry.by, entry.event);
  }
  return world;
}

/** A short fingerprint of a world's history; equal digests = equal worlds. */
export function digest(world: World): number {
  return hashString(JSON.stringify([world.seed, world.log]));
}
