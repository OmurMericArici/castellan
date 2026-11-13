import { describe, expect, it } from "vitest";
import { fbm } from "./noise";
import { generateSpace } from "./space";
import type { SpaceSpec } from "./space";
import { lazy, readLazy, timeToReach, withRate } from "./lazy";
import { EventQueue } from "./queue";
import { createEdge, createNode, createWorld, digest, emit, replay, runUntil, schedule } from "./world";
import type { Handler } from "./world";
import { genesis } from "./noah";
import { loadPacks } from "./archie";
import CORE from "../packs/core.json";
import type { NoahConfig } from "./noah";

const SPACE: SpaceSpec = {
  width: 64,
  height: 40,
  fields: [
    { name: "height", kind: "noise", scale: 20, octaves: 4 },
    { name: "water", kind: "below", from: "height", level: 0.4 },
    { name: "fertility", kind: "noise", scale: 10, mask: { field: "water", invert: true } },
  ],
};

const CONFIG: NoahConfig = {
  space: SPACE,
  leaves: [
    { type: "Tree", count: 80, prefer: "fertility", avoid: [{ field: "water", above: 0.1 }] },
    { type: "Stone", count: 20, avoid: [{ field: "water", above: 0.1 }] },
    { type: "Person", count: 5, avoid: [{ field: "water", above: 0.1 }] },
  ],
};

describe("noise", () => {
  it("is deterministic and stays in [0, 1]", () => {
    const a = fbm(5, 4);
    const b = fbm(5, 4);
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.11;
      expect(a(x, y)).toBe(b(x, y));
      expect(a(x, y)).toBeGreaterThanOrEqual(0);
      expect(a(x, y)).toBeLessThanOrEqual(1);
    }
  });
});

describe("space", () => {
  it("builds fields in order and derives water from height", () => {
    const s = generateSpace(1, SPACE);
    const h = s.field("height");
    const w = s.field("water");
    for (let i = 0; i < h.data.length; i++) {
      if ((h.data[i] ?? 0) > 0.45) expect(w.data[i]).toBe(0);
      if ((h.data[i] ?? 1) < 0.38) expect(w.data[i]).toBe(1);
    }
  });

  it("rejects a field that refers to one defined later", () => {
    expect(() =>
      generateSpace(1, { width: 4, height: 4, fields: [{ name: "w", kind: "below", from: "h", level: 0.5 }] }),
    ).toThrow(/not defined before/);
  });
});

describe("lazy values", () => {
  it("are computed when read and clamp to their range", () => {
    const hunger = lazy(0.2, 0.1, 10, 0, 1);
    expect(readLazy(hunger, 10)).toBeCloseTo(0.2);
    expect(readLazy(hunger, 13)).toBeCloseTo(0.5);
    expect(readLazy(hunger, 100)).toBe(1);
  });

  it("predict when a threshold is crossed", () => {
    const need = lazy(0.2, 0.1, 0, 0, 1);
    expect(timeToReach(need, 0.6, 0)).toBeCloseTo(4);
    expect(timeToReach(need, 0.1, 0)).toBeUndefined();
    const calmer = withRate(need, 2, 0.05);
    expect(readLazy(calmer, 2)).toBeCloseTo(0.4);
    expect(timeToReach(calmer, 0.6, 2)).toBeCloseTo(6);
  });
});

describe("event queue", () => {
  it("pops earliest first, ties in scheduling order, skipping cancelled", () => {
    const q = new EventQueue<string>();
    q.schedule(5, "c");
    const t = q.schedule(1, "x");
    q.schedule(2, "a");
    q.schedule(2, "b");
    q.cancel(t);
    expect(q.size).toBe(3);
    expect([q.pop()?.item, q.pop()?.item, q.pop()?.item, q.pop()]).toEqual(["a", "b", "c", undefined]);
  });
});

describe("world", () => {
  it("only changes through logged events, and edges read from both ends", () => {
    const w = createWorld(3);
    const person = createNode(w, "noah", { kind: "entity", type: "Person", pos: { x: 1, y: 1 }, attrs: {} });
    const claim = createNode(w, "adam", { kind: "knowledge", type: "Sighting", attrs: { subject: 99 } });
    const e = createEdge(w, "adam", { type: "knows", from: person, to: claim, fromData: { confidence: 0.9 } });
    const edge = w.graph.edge(e)!;
    expect(w.graph.edgesOf(claim, "knows")).toHaveLength(1);
    expect(w.graph.other(edge, claim)).toBe(person);
    expect(w.graph.endData(edge, person)).toEqual({ confidence: 0.9 });
    expect(w.log.map((l) => l.event.kind)).toEqual(["node.created", "node.created", "edge.created"]);
  });

  it("runs scheduled happenings in time order and skips quiet time", () => {
    const w = createWorld(1);
    const seen: number[] = [];
    const handlers = new Map<string, Handler>([["mark", (world) => seen.push(world.time)]]);
    schedule(w, 30, { handler: "mark" });
    schedule(w, 2, { handler: "mark" });
    expect(runUntil(w, 10, handlers)).toBe(1);
    expect(w.time).toBe(10);
    runUntil(w, 1000, handlers);
    expect(seen).toEqual([2, 30]);
  });

  it("can be rebuilt from its log alone, packs included", () => {
    const w = createWorld(11);
    loadPacks(w, [CORE]);
    genesis(w, CONFIG);
    const id = [...w.graph.nodes({ type: "Person" })][0]!.id;
    w.time = 4;
    emit(w, "adam", { kind: "node.moved", id, pos: { x: 3, y: 3 } });
    const r = replay(11, w.log);
    expect(digest(r)).toBe(digest(w));
    expect(r.graph.node(id)?.pos).toEqual({ x: 3, y: 3 });
    expect(r.graph.nodeCount).toBe(w.graph.nodeCount);
    expect(r.registry.types.has("Tree")).toBe(true);
  });
});

const fresh = (seed: number) => {
  const w = createWorld(seed);
  loadPacks(w, [CORE]);
  return w;
};

describe("Noah", () => {
  it("makes the same world from the same seed and config", () => {
    const a = fresh(7);
    const b = fresh(7);
    genesis(a, CONFIG);
    genesis(b, CONFIG);
    expect(digest(a)).toBe(digest(b));
    const c = fresh(8);
    genesis(c, CONFIG);
    expect(digest(c)).not.toBe(digest(a));
  });

  it("places leaves only where the fields allow", () => {
    const w = fresh(7);
    const report = genesis(w, CONFIG);
    const water = w.space!.field("water");
    for (const n of w.graph.nodes({ kind: "entity" })) {
      expect(water.sample(n.pos!.x, n.pos!.y)).toBeLessThanOrEqual(0.1);
    }
    expect(report.placed.find((p) => p.type === "Person")?.placed).toBe(5);
  });

  it("refuses to run twice", () => {
    const w = fresh(7);
    genesis(w, CONFIG);
    expect(() => genesis(w, CONFIG)).toThrow(/empty world/);
  });

  it("gives each leaf its pack defaults, reproducibly", () => {
    const w = fresh(7);
    genesis(w, CONFIG);
    for (const t of w.graph.nodes({ type: "Tree" })) {
      const wood = t.attrs["wood"] as number;
      expect(Number.isInteger(wood) && wood >= 4 && wood <= 12).toBe(true);
    }
    const again = fresh(7);
    genesis(again, CONFIG);
    expect(digest(again)).toBe(digest(w));
  });

  it("only places leaf types that packs define", () => {
    expect(() => genesis(createWorld(1), CONFIG)).toThrow(/load packs first/);
    expect(() => genesis(fresh(1), { ...CONFIG, leaves: [{ type: "House", count: 1 }] })).toThrow(/unknown type "House"/);
    expect(() => genesis(fresh(1), { ...CONFIG, leaves: [{ type: "Sighting", count: 1 }] })).toThrow(/knowledge type/);
    const nonLeaf = { pack: "town", version: "0.1.0", types: { House: { kind: "entity" } } };
    const w = createWorld(1);
    loadPacks(w, [CORE, nonLeaf]);
    expect(() => genesis(w, { ...CONFIG, leaves: [{ type: "House", count: 1 }] })).toThrow(/not a leaf type/);
    expect(w.space).toBeUndefined();
  });
});
