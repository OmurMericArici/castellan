import { describe, expect, it } from "vitest";
import { loadPacks } from "./archie";
import { genesis } from "./noah";
import type { NoahConfig } from "./noah";
import { checkPacks, formatPackError } from "./packs";
import { createSimulation } from "./sim";
import { DUSK } from "./time";
import { createWorld, digest, replay } from "./world";
import CORE from "../packs/core.json";

const CONFIG: NoahConfig = {
  space: {
    width: 96,
    height: 64,
    fields: [
      { name: "height", kind: "noise", scale: 30, octaves: 4 },
      { name: "water", kind: "below", from: "height", level: 0.38 },
      { name: "fertility", kind: "noise", scale: 12, mask: { field: "water", invert: true } },
    ],
  },
  leaves: [
    { type: "Tree", count: 150, prefer: "fertility", avoid: [{ field: "water", above: 0.05 }] },
    { type: "Stone", count: 30, avoid: [{ field: "water", above: 0.05 }] },
    { type: "Person", count: 6, avoid: [{ field: "water", above: 0.05 }] },
  ],
};

function running(seed: number, config = CONFIG) {
  const w = createWorld(seed);
  loadPacks(w, [CORE]);
  genesis(w, config);
  const sim = createSimulation(w);
  sim.start();
  return sim;
}

describe("Adam", () => {
  it("moves people, and they learn what they pass", () => {
    const sim = running(3);
    const start = new Map(sim.adam.people().map((p) => [p.id, p.pos]));
    sim.run(2);
    const w = sim.world;
    const moved = sim.adam.people().filter((p) => {
      const s = start.get(p.id)!;
      const now = sim.adam.positionOf(p.id)!;
      return Math.hypot(now.x - s!.x, now.y - s!.y) > 1;
    });
    expect(moved.length).toBeGreaterThan(3);
    const knows = [...w.graph.nodes({ kind: "entity", type: "Person" })].map((p) => w.graph.edgesOf(p.id, "knows").length);
    expect(Math.max(...knows)).toBeGreaterThan(0);
    // Nobody knows the whole world after two days.
    const trees = [...w.graph.nodes({ type: "Tree" })].length;
    expect(Math.max(...sim.adam.people().map((p) => sim.adam.knownCount(p.id)))).toBeLessThan(trees);
  });

  it("keeps one shared claim per thing, however many people know it", () => {
    const sim = running(5);
    sim.run(4);
    const g = sim.world.graph;
    // Things that stay put have one claim each; people are remembered where they were last seen.
    for (const subject of g.nodes({ kind: "entity" })) {
      if (subject.type === "Person") continue;
      expect(g.edgesOf(subject.id, "about").length).toBeLessThanOrEqual(1);
    }
    const claims = [...g.nodes({ type: "Sighting" })];
    const shared = claims.filter((c) => g.edgesOf(c.id, "knows").length > 1);
    expect(claims.length).toBeGreaterThan(0);
    expect(shared.length).toBeGreaterThan(0);
  });

  it("is deterministic and replays from the log", () => {
    const a = running(9);
    const b = running(9);
    a.run(3);
    b.run(3);
    expect(digest(a.world)).toBe(digest(b.world));
    const r = replay(9, a.world.log);
    expect(digest(r)).toBe(digest(a.world));
    expect([...r.activities]).toEqual([...a.world.activities]);
    for (const p of a.adam.people()) expect(r.graph.node(p.id)?.pos).toEqual(p.pos);
  });

  it("puts people to rest at night and gets them up in the morning", () => {
    const sim = running(7);
    sim.run(DUSK + 0.2); // deep in the first night
    const resting = sim.adam.people().filter((p) => sim.world.activities.get(p.id)?.action === "Rest");
    expect(resting.length).toBe(sim.adam.people().length);
    sim.run(1.4); // late morning of day 2
    const up = sim.adam.people().filter((p) => sim.world.activities.get(p.id)?.action !== "Rest");
    expect(up.length).toBeGreaterThan(sim.adam.people().length / 2);
  });

  it("lets determined people keep going a while after dark (determination is a trait)", () => {
    const config: NoahConfig = {
      ...CONFIG,
      leaves: [...CONFIG.leaves.filter((l) => l.type !== "Person"), { type: "Person", count: 16, avoid: [{ field: "water", above: 0.05 }] }],
    };
    // The same world twice: everyone fully determined, then no one.
    const meanRest = (d: number) => {
      const fixed = { pack: "fixed", version: "0.1.0", requires: ["core"], extends: { Determination: { distribution: { histogram: [[d, d, 1]] } } } };
      const w = createWorld(11);
      loadPacks(w, [CORE, fixed]);
      genesis(w, config);
      const sim = createSimulation(w);
      sim.start();
      sim.run(DUSK + 0.3);
      expect(sim.adam.people().every((p) => sim.adam.mind(p.id).traits["Determination"] === d)).toBe(true);
      const restAt = new Map<number, number>();
      for (const l of w.log) {
        if (l.event.kind === "activity" && l.event.activity.action === "Rest" && l.t >= DUSK && !restAt.has(l.event.person)) restAt.set(l.event.person, l.t);
      }
      const ts = sim.adam.people().map((p) => restAt.get(p.id) ?? DUSK);
      return ts.reduce((a, b) => a + b, 0) / ts.length;
    };
    expect(meanRest(1)).toBeGreaterThan(meanRest(0));
  });
});

describe("mind rules in packs", () => {
  it("explains wrong verbs, goals and need names", () => {
    const bad = {
      pack: "bad",
      version: "0.1.0",
      requires: ["core"],
      types: {
        Hunger: { kind: "mind", role: "need", rate: { expr: "needs.Fatige" }, tier: 2 },
        Eat: { kind: "mind", role: "action", do: "eat", serves: { Survival: 1 } },
        Thrive: { kind: "mind", role: "goal", weight: { expr: "knows.Bush" } },
      },
    };
    const r = checkPacks([CORE, bad]);
    const msgs = r.ok ? "" : r.errors.map(formatPackError).join("\n");
    expect(msgs).toMatch(/types.Hunger.tier: "tier" belongs to goal types, not need types/);
    expect(msgs).toMatch(/types.Eat.do: "do" was replaced by "steps"/);
    expect(msgs).toMatch(/types.Eat.steps: actions need "steps"/);
    expect(msgs).toMatch(/types.Thrive.tier: goals need a tier/);
    const second = checkPacks([
      CORE,
      { ...bad, types: { Hunger: { kind: "mind", role: "need", rate: { expr: "needs.Fatige" } }, Eat: { kind: "mind", role: "action", steps: [{ stay: true }], serves: { Survival: 1 } } } },
    ]);
    const msgs2 = second.ok ? "" : second.errors.map(formatPackError).join("\n");
    expect(msgs2).toMatch(/"Survival" is not a goal type \(did you mean "Survive"\?\)/);
    expect(msgs2).toMatch(/"needs.Fatige": "Fatige" is not a need type \(did you mean "Fatigue"\?\)/);
  });
});
