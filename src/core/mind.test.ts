import { describe, expect, it } from "vitest";
import { loadPacks } from "./archie";
import { genesis, withPackPlacement } from "./noah";
import { checkPacks, formatPackError } from "./packs";
import { createSimulation } from "./sim";
import { createWorld, digest, replay } from "./world";
import CORE from "../packs/core.json";
import SHELTER from "../packs/shelter.json";
import HUNGER from "../packs/hunger.json";
import HOSTILITY from "../packs/hostility.json";
import PSY from "../packs/psychopathy.json";
import TALK from "../packs/talk.json";
import { DEFAULT_NOAH } from "../ui/noah-default";

/** ADR-0033: the problem-solving mind — planning, emotions, scales, know-how, event memory. */

const ALL = [CORE, SHELTER, HUNGER, HOSTILITY, PSY, TALK];

function running(seed: number, packs: unknown[] = ALL) {
  const w = createWorld(seed);
  loadPacks(w, packs);
  genesis(w, withPackPlacement(DEFAULT_NOAH, w.registry));
  const sim = createSimulation(w);
  sim.start();
  return sim;
}

const errorsOf = (packs: unknown[]) => {
  const r = checkPacks(packs);
  return r.ok ? "" : r.errors.map(formatPackError).join("\n");
};

describe("planning: sub-problems emerge (ADR-0033)", () => {
  it("house → wood → tree comes out of local requires/gives; no method names another", () => {
    const sim = running(8);
    sim.run(6);
    const steps = sim.world.log.flatMap((l) => (l.event.kind === "activity" && l.event.activity.for ? [`${l.event.activity.action}>${l.event.activity.for}`] : []));
    expect(steps).toContain("Gather>Build");
    expect(steps).toContain("Deliver>Build");
  });

  it("knowing no bush, finding one becomes the problem: they explore for food (no SeekFood action needed)", () => {
    // Without curiosity, the only reason to explore is a sub-problem.
    const incurious = { pack: "incurious", version: "0.1.0", requires: ["core"], extends: { Grow: { weight: 0 } } };
    const sim = running(8, [CORE, HUNGER, incurious]);
    sim.run(2);
    const steps = sim.world.log.flatMap((l) => (l.event.kind === "activity" && l.event.activity.action === "Explore" ? [l.event.activity.for] : []));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s === "Forage")).toBe(true);
    expect(sim.world.log.some((l) => l.event.kind === "activity" && l.event.activity.action === "Forage" && !l.event.activity.for)).toBe(true);
  });

  it("a new way to make a fact true is used without changing anything else", () => {
    const pack = {
      pack: "coins",
      version: "0.1.0",
      requires: ["core"],
      facts: { rich: "self.coins >= 3" },
      types: {
        Earn: { kind: "mind", role: "action", gives: ["rich"], steps: [{ work: 0.05 }, { effect: { "self.coins": "self.coins + 1" } }] },
        Feast: { kind: "mind", role: "action", requires: ["rich"], steps: [{ work: 0.05 }, { effect: { "self.coins": 0, "self.feasts": "self.feasts + 1" } }], serves: { Grow: 5 } },
      },
      extends: { Person: { attrs: { coins: { type: "number", default: 0 }, feasts: { type: "number", default: 0 } } } },
    };
    const sim = running(2, [CORE, pack]);
    sim.run(1);
    const w = sim.world;
    expect(w.log.some((l) => l.event.kind === "activity" && l.event.activity.action === "Earn" && l.event.activity.for === "Feast")).toBe(true);
    expect(sim.adam.people().some((p) => Number(p.attrs["feasts"]) > 0)).toBe(true);
  });

  it("explains facts that don't exist and methods with no purpose", () => {
    const bad = {
      pack: "bad",
      version: "0.1.0",
      requires: ["core"],
      facts: { Rich: "self.coins > 1" },
      types: {
        Earn: { kind: "mind", role: "action", gives: ["ritch"], steps: [{ work: 0.1 }] },
        Idle: { kind: "mind", role: "action", steps: [{ work: 0.1 }] },
        Hope: { kind: "mind", role: "action", requires: ["known.Unicorn"], steps: [{ work: 0.1 }], serves: { Grow: 1 } },
      },
    };
    const msgs = errorsOf([CORE, bad]);
    expect(msgs).toMatch(/facts.Rich: fact names are camelCase/);
    expect(msgs).toMatch(/types.Idle: an action needs "serves" .* or "gives"/);
    const msgs2 = errorsOf([CORE, { ...bad, facts: { rich: "self.coins > 1" }, types: { Earn: bad.types.Earn, Hope: bad.types.Hope } }]);
    expect(msgs2).toMatch(/types.Earn.gives: "ritch" is not a fact.*did you mean "rich"/);
    expect(msgs2).toMatch(/types.Hope.requires: "known.Unicorn" is not a fact/);
  });
});

describe("emotions and scales (ADR-0033)", () => {
  it("fear, anger and dread are emotions; old needs.* names get a pointer", () => {
    const r = checkPacks(ALL);
    expect(r.ok).toBe(true);
    if (r.ok) for (const e of ["Fear", "Anger", "Dread"]) expect(r.registry.types.get(e)?.role).toBe("emotion");
    const old = { pack: "old", version: "0.1.0", requires: ["core"], reactions: [{ on: "dusk", do: { "needs.Fear": 0.1 } }] };
    expect(errorsOf([CORE, old])).toMatch(/"Fear" is not a need type \("Fear" is an emotion now: use emotions.Fear\)/);
  });

  it("traits and emotions scale each other: psychopathy damps fear", () => {
    const dark = { pack: "dark", version: "0.1.0", requires: ["psychopathy"], extends: { Psychopathy: { distribution: { histogram: [[0, 0, 1], [1, 1, 1]] } } } };
    const sim = running(3, [...ALL, dark]);
    sim.run(0.9); // night: fear is high
    const people = sim.adam.people();
    const cold = people.filter((p) => sim.adam.traits(p.id)["Psychopathy"] === 1);
    const warm = people.filter((p) => sim.adam.traits(p.id)["Psychopathy"] === 0);
    expect(cold.length && warm.length).toBeTruthy();
    for (const p of cold) {
      const raw = sim.adam.emotionLevels(p.id)["Fear"]!;
      expect(sim.adam.mind(p.id).emotions["Fear"]).toBeCloseTo(raw * 0.4, 5);
    }
    for (const p of warm) expect(sim.adam.mind(p.id).emotions["Fear"]).toBeCloseTo(sim.adam.emotionLevels(p.id)["Fear"]!, 5);
  });

  it("an ordinary person may kill when very angry and very afraid; restraint holds otherwise", () => {
    // A quarrel on every meeting: grudges both ways, anger; fear comes from the night.
    const quarrel = {
      pack: "quarrel",
      version: "0.1.0",
      requires: ["hostility"],
      reactions: [{ on: "meets", do: { link: { edge: "grudge", to: "other", mutual: true }, "emotions.Anger": 1, "emotions.Fear": 1 } }],
    };
    const sim = running(4, [CORE, SHELTER, HUNGER, HOSTILITY, quarrel]);
    sim.run(6);
    const w = sim.world;
    const attacks = w.log.filter((l) => l.event.kind === "died");
    expect(attacks.length).toBeGreaterThan(0);
    // Nobody here has psychopathy: the killers were ordinary people pushed past their restraint.
    for (const l of attacks) if (l.event.kind === "died") expect(sim.adam.traits(l.event.by!)["Psychopathy"]).toBeUndefined();

    const calm = { ...quarrel, pack: "calm", reactions: [{ on: "meets", do: { link: { edge: "grudge", to: "other", mutual: true }, "emotions.Anger": 0.7 } }] };
    const quiet = running(4, [CORE, SHELTER, HUNGER, HOSTILITY, calm]);
    quiet.run(6);
    expect(quiet.world.log.filter((l) => l.event.kind === "died").length).toBe(0);
  });
});

describe("know-how: methods are learned (ADR-0032)", () => {
  it("people only use methods they know, and pick them up by watching and talking", () => {
    const sim = running(8);
    sim.run(12);
    const w = sim.world;
    const learned = w.log.flatMap((l) => (l.event.kind === "edge.created" && l.event.edge.type === "knowsHow" && l.event.edge.fromData?.["how"] !== "born" ? [l.event.edge] : []));
    expect(learned.length).toBeGreaterThan(0);
    // Nobody ever did a method before knowing it.
    const knownAt = new Map<string, number>();
    for (const l of w.log) {
      if (l.event.kind === "edge.created" && l.event.edge.type === "knowsHow") knownAt.set(`${l.event.edge.from}:${String(w.graph.node(l.event.edge.to)?.type)}`, l.t);
      if (l.event.kind === "activity") expect(knownAt.has(`${l.event.person}:${l.event.activity.action}`)).toBe(true);
    }
  });

  it("preferences move with success, failure and others' reactions; at 0 a method is forgotten", () => {
    const sim = running(1);
    sim.run(4);
    const prefs = sim.adam.people().flatMap((p) => Object.values(sim.adam.methods(p.id)));
    expect(prefs.some((v) => v !== 1)).toBe(true);
    expect(prefs.every((v) => v > 0 && v <= 3)).toBe(true);
  });
});

describe("events and people are remembered (ADR-0033)", () => {
  const dark = { pack: "dark", version: "0.1.0", requires: ["psychopathy"], extends: { Psychopathy: { distribution: { histogram: [[0, 0.1, 4], [0.85, 1, 1]] } } } };

  it("a murder becomes a shared Report claim: witnesses know who did it, others hear, talk spreads it", () => {
    const sim = running(1, [...ALL, dark]);
    sim.run(12);
    const w = sim.world;
    const g = w.graph;
    const reports = [...g.nodes({ type: "Report" })];
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) expect(r.attrs["event"]).toBe("Murder");
    const withActor = reports.filter((r) => g.edgesOf(r.id, "actor").length > 0);
    for (const r of withActor) {
      const actor = g.edgesOf(r.id, "actor")[0]!.to;
      const killers = w.log.flatMap((l) => (l.event.kind === "died" ? [l.event.by] : []));
      expect(killers).toContain(actor);
    }
    const knowers = reports.flatMap((r) => g.edgesOf(r.id, "knows"));
    expect(knowers.length).toBeGreaterThan(1);
  });

  it("people remember each other from meetings", () => {
    const sim = running(8);
    sim.run(3);
    const known = sim.adam.people().map((p) => sim.adam.knowledge(p.id, "Person").length);
    expect(known.some((n) => n > 0)).toBe(true);
  });

  it("stays deterministic and replays from the log", () => {
    const a = running(6, [...ALL, dark]);
    const b = running(6, [...ALL, dark]);
    a.run(5);
    b.run(5);
    expect(digest(a.world)).toBe(digest(b.world));
    expect(digest(replay(6, a.world.log))).toBe(digest(a.world));
  });
});
