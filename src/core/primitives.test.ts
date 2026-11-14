import { describe, expect, it } from "vitest";
import { loadPacks } from "./archie";
import { isLazy, readLazy } from "./lazy";
import { genesis, withPackPlacement } from "./noah";
import { checkPacks, formatPackError } from "./packs";
import { createSimulation } from "./sim";
import { createWorld, digest, replay } from "./world";
import CORE from "../packs/core.json";
import SHELTER from "../packs/shelter.json";
import HUNGER from "../packs/hunger.json";
import HOSTILITY from "../packs/hostility.json";
import PSY from "../packs/psychopathy.json";
import { DEFAULT_NOAH } from "../ui/noah-default";

const DEFAULTS = [CORE, SHELTER, HUNGER, HOSTILITY];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function running(seed: number, packs: unknown[], people?: number) {
  const w = createWorld(seed);
  loadPacks(w, packs);
  const base = people ? { ...DEFAULT_NOAH, leaves: DEFAULT_NOAH.leaves.map((l) => (l.type === "Person" ? { ...l, count: people } : l)) } : DEFAULT_NOAH;
  genesis(w, withPackPlacement(base, w.registry));
  const sim = createSimulation(w);
  sim.start();
  return sim;
}

const errorsOf = (packs: unknown[]) => {
  const r = checkPacks(packs);
  return r.ok ? "" : r.errors.map(formatPackError).join("\n");
};

describe("pack order, extends, placement (ADR-0030)", () => {
  it("lets a later pack change an earlier pack's type; the last one in order wins", () => {
    const a = { pack: "a", version: "0.1.0", requires: ["core"], extends: { Survive: { weight: "emotions.Fear * 0.5" }, Person: { attrs: { courage: { type: "number", default: 1 } } } } };
    const b = { pack: "b", version: "0.1.0", requires: ["core"], extends: { Survive: { weight: "emotions.Fear * 0.25" } } };
    const ab = checkPacks([CORE, a, b]);
    const ba = checkPacks([CORE, b, a]);
    expect(ab.ok && ba.ok).toBe(true);
    if (ab.ok && ba.ok) {
      const src = (r: typeof ab) => (r.ok ? (r.registry.types.get("Survive")!.goal!.weight as { expr: { source: string } }).expr.source : "");
      expect(src(ab)).toBe("emotions.Fear * 0.25");
      expect(src(ba)).toBe("emotions.Fear * 0.5");
      expect(ab.registry.types.get("Person")!.attrs.has("courage")).toBe(true);
      expect(ab.registry.types.get("Person")!.attrs.has("age")).toBe(true);
    }
  });

  it("explains bad extensions and missing requirements when a pack is disabled", () => {
    expect(errorsOf([CORE, { pack: "x", version: "0.1.0", requires: ["core"], extends: { Survive: { kind: "entity" } } }])).toMatch(/extends.Survive.kind: the kind of a type can't be changed/);
    expect(errorsOf([CORE, { pack: "x", version: "0.1.0", requires: ["core"], extends: { Surive: { weight: 1 } } }])).toMatch(/extends.Surive: there is no type "Surive".*did you mean "Survive"/);
    expect(errorsOf([CORE, { pack: "x", version: "0.1.0", requires: ["core"], extends: { Survive: { weight: "needs.Nope" } } }])).toMatch(/types.Survive.weight: "needs.Nope".*\(Survive was changed by: x\)/);
    expect(errorsOf([CORE, HUNGER, PSY])).toMatch(/psychopathy › requires: needs pack "hostility", which is not loaded/);
  });

  it("takes starting leaf counts from packs; the config can override them", () => {
    const r = checkPacks(DEFAULTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cfg = withPackPlacement({ ...DEFAULT_NOAH, leaves: [{ type: "Person", count: 3 }] }, r.registry);
    expect(cfg.leaves.find((l) => l.type === "Person")?.count).toBe(3);
    expect(cfg.leaves.find((l) => l.type === "Bush")?.count).toBe(70);
    expect(errorsOf([CORE, { pack: "x", version: "0.1.0", requires: ["core"], place: { Sighting: { count: 2 } } }])).toMatch(/place.Sighting: "Sighting" is not a leaf entity type/);
  });
});

describe("traits and their distribution", () => {
  it("draws each person's value from the pack's histogram", () => {
    const half = { pack: "half", version: "0.1.0", requires: ["psychopathy"], extends: { Psychopathy: { distribution: { histogram: [[0, 0.1, 1], [0.9, 1, 1]] } } } };
    const sim = running(3, [...DEFAULTS, PSY, half], 200);
    const values = sim.adam.people().map((p) => sim.adam.traits(p.id)["Psychopathy"]!);
    expect(values).toHaveLength(200);
    expect(values.every((v) => (v >= 0 && v <= 0.1) || (v >= 0.9 && v <= 1))).toBe(true);
    const high = values.filter((v) => v >= 0.9).length / values.length;
    expect(high).toBeGreaterThan(0.38);
    expect(high).toBeLessThan(0.62);
  });

  it("can use a generating function instead", () => {
    const fn = { pack: "fn", version: "0.1.0", requires: ["psychopathy"], extends: { Psychopathy: { distribution: "if(rand() < 0.25, rand_range(0.8, 1), 0)" } } };
    const sim = running(4, [...DEFAULTS, PSY, fn], 120);
    const values = sim.adam.people().map((p) => sim.adam.traits(p.id)["Psychopathy"]!);
    expect(values.every((v) => v === 0 || v >= 0.8)).toBe(true);
    expect(values.some((v) => v >= 0.8)).toBe(true);
  });
});

describe("murder: death, events Molly notices, reactions", () => {
  const dark = { pack: "dark", version: "0.1.0", requires: ["psychopathy"], extends: { Psychopathy: { distribution: { histogram: [[0, 0.1, 4], [0.85, 1, 1]] } } } };

  it("a psychopath kills; the dead stop acting; Molly records the event; people dread and hide", () => {
    const sim = running(1, [...DEFAULTS, PSY, dark]);
    sim.run(12);
    const w = sim.world;
    const deaths = w.log.filter((l) => l.event.kind === "died");
    expect(deaths.length).toBeGreaterThan(0);
    for (const d of deaths) {
      if (d.event.kind !== "died") continue;
      const victim = d.event.id;
      expect(w.log.some((l) => l.event.kind === "happened" && l.event.name === "Murder" && l.event.about === victim && l.by === "molly")).toBe(true);
      expect(w.log.some((l) => l.seq > d.seq && l.event.kind === "activity" && l.event.person === victim)).toBe(false);
      expect(sim.adam.people().some((p) => p.id === victim)).toBe(false);
    }
    expect(w.log.some((l) => l.event.kind === "activity" && l.event.activity.action === "Hide")).toBe(true);
    expect(digest(replay(1, w.log))).toBe(digest(w));
  });

  it("witnesses know the killer and hate them", () => {
    const seen = clone(HOSTILITY) as { events: { Murder: { seenWithin: number } } };
    seen.events.Murder.seenWithin = 500;
    const sim = running(1, [CORE, SHELTER, HUNGER, seen, PSY, dark]);
    sim.run(12);
    const w = sim.world;
    const killers = new Set(w.log.flatMap((l) => (l.event.kind === "died" && l.event.by !== undefined ? [l.event.by] : [])));
    expect(killers.size).toBeGreaterThan(0);
    const hates = [...w.graph.nodes({ type: "Person" })].flatMap((p) => w.graph.edgesOf(p.id, "hates").filter((e) => e.from === p.id));
    expect(hates.length).toBeGreaterThan(0);
    for (const h of hates) expect(killers.has(h.to)).toBe(true);
  });
});

describe("the other primitives (ADR-0029)", () => {
  it("an action with nowhere to go first is never chosen; goto alternatives fall back", () => {
    const pack = {
      pack: "t",
      version: "0.1.0",
      requires: ["core"],
      edges: { pal: { from: "entity", to: "entity" } },
      types: {
        Visit: { kind: "mind", role: "action", steps: [{ goto: { linked: "pal" } }], serves: { Grow: 5 } },
        Roam: { kind: "mind", role: "action", steps: [{ goto: [{ linked: "pal" }, { wander: 4 }] }], serves: { Grow: 3 } },
      },
    };
    const sim = running(2, [CORE, pack]);
    sim.run(2);
    const acts = sim.world.log.filter((l) => l.event.kind === "activity").map((l) => (l.event.kind === "activity" ? l.event.activity.action : ""));
    expect(acts.includes("Visit")).toBe(false);
    expect(acts.filter((a) => a === "Roam").length).toBeGreaterThan(5);
  });

  it("bonds carry numbers, links can be mutual, effects reach the other person, reactions can roll dice", () => {
    const pack = {
      pack: "t",
      version: "0.1.0",
      requires: ["core"],
      edges: { pal: { from: "entity", to: "entity", fromData: { warmth: { type: "number" } } } },
      reactions: [
        { on: "meets", if: "rand() < 0.8", do: { link: { edge: "pal", to: "other", mutual: true, add: { warmth: 1 } } } },
        { on: "meets", if: "bond.pal.warmth >= 2", do: { "other.needs.Fatigue": -0.05 } },
      ],
    };
    const sim = running(3, [...DEFAULTS, pack]);
    sim.run(8);
    const g = sim.world.graph;
    const pals = [...g.nodes({ type: "Person" })].flatMap((p) => g.edgesOf(p.id, "pal").filter((e) => e.from === p.id));
    expect(pals.length).toBeGreaterThan(0);
    for (const e of pals) {
      expect(g.edgesOf(e.to, "pal").some((x) => x.from === e.to && x.to === e.from)).toBe(true);
      expect(e.fromData["warmth"]).toBeGreaterThanOrEqual(1);
    }
    expect(digest(replay(3, sim.world.log))).toBe(digest(sim.world));
  });

  it("people can walk to a field (the shore) and read fields where they stand", () => {
    const pack = {
      pack: "t",
      version: "0.1.0",
      requires: ["core"],
      types: {
        Thirst: { kind: "mind", role: "need", start: 0.3, rate: 0.8, urgentAt: 0.8 },
        Quench: { kind: "mind", role: "goal", tier: 1, weight: "needs.Thirst" },
        Drink: { kind: "mind", role: "action", steps: [{ goto: { field: "water", above: 0.5 } }, { if: "field.water > 0" }, { effect: { "needs.Thirst": -0.7 } }], serves: { Quench: "if(needs.Thirst > 0.3, 1, 0)" } },
      },
    };
    const sim = running(1, [CORE, pack]);
    sim.run(4);
    const drinks = sim.world.log.filter((l) => l.event.kind === "edge.data" && isLazy(l.event.data["level"]) && sim.world.graph.node(sim.world.graph.edge(l.event.id)!.to)?.type === "Thirst" && readLazy(l.event.data["level"] as never, l.t) < 0.2).length;
    expect(drinks).toBeGreaterThan(0);
    // Most people keep their thirst down (one may end up somewhere with no reachable shore).
    const ok = sim.adam.people().filter((p) => sim.adam.needLevels(p.id)["Thirst"]! < 1).length;
    expect(ok).toBeGreaterThanOrEqual(sim.adam.people().length - 1);
  });

  it("attributes with a regrow rate come back (berries)", () => {
    const sim = running(2, DEFAULTS);
    sim.run(8);
    const regrown = sim.world.log.filter((l) => l.by === "entropy" && l.event.kind === "node.attrs" && "food" in l.event.attrs);
    expect(regrown.length).toBeGreaterThan(0);
  });

  it("links can be counted in decisions", () => {
    const pack = { pack: "t", version: "0.1.0", requires: ["hostility"], types: { Sulk: { kind: "mind", role: "action", steps: [{ stay: true }], serves: { Vent: "if(links.grudge > 0, 0.1, 0)" } } } };
    expect(checkPacks([...DEFAULTS, pack]).ok).toBe(true);
    expect(errorsOf([...DEFAULTS, { ...pack, types: { Sulk: { ...pack.types.Sulk, serves: { Vent: "links.grudg" } } } }])).toMatch(/"links.grudg": edge "grudg" is not defined/);
  });
});
