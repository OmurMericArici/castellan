// Public surface of the core. No DOM access anywhere under src/core (enforced by tsconfig.core.json).
export { createRng, hash2, hashString } from "./rng";
export type { Rng } from "./rng";
export { fbm, valueNoise } from "./noise";
export { Field, generateSpace } from "./space";
export type { FieldSpec, Space, SpaceSpec } from "./space";
export { isLazy, lazy, readLazy, timeToReach, withRate, withValue } from "./lazy";
export type { LazyValue } from "./lazy";
export { EventQueue } from "./queue";
export type { Ticket } from "./queue";
export { Graph } from "./graph";
export type { AttrValue, Attrs, EdgeId, GraphEdge, GraphNode, NodeId, NodeKind, Vec2 } from "./graph";
export { createEdge, createNode, createWorld, digest, emit, replay, runUntil, schedule } from "./world";
export type { EdgeInit, Handler, LoggedEvent, NodeInit, Scheduled, World, WorldEvent } from "./world";
export { genesis } from "./noah";
export type { GenesisReport, LeafSpec, NoahConfig } from "./noah";
