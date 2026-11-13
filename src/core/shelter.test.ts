import { describe, expect, it } from "vitest";
import { loadPacks } from "./archie";
import { isLazy, readLazy } from "./lazy";
import { genesis } from "./noah";
import { checkPacks, formatPackError } from "./packs";
import { createSimulation } from "./sim";
import { createWorld, digest, replay } from "./world";
import type { World } from "./world";
import CORE from "../packs/core.json";
import SHELTER from "../packs/shelter.json";
import { DEFAULT_NOAH } from "../ui/noah-default";

function running(seed: number) {
  const w = createWorld(seed);
  loadPacks(w, [CORE, SHELTER]);
  genesis(w, DEFAULT_NOAH);
  const sim = createSimulation(w);
  sim.start();
  return sim;
}

const built = (w: World) => [...w.graph.nodes({ type: "House" })].filter((h) => h.attrs["state"] === "built");

describe("shelter: from people to a village", () => {
  const sim = running(2);
  sim.run(10);
  const w = sim.world;
  const g = w.graph;

  it("people build houses and move in", () => {
    const houses = built(w);
    expect(houses.length).toBeGreaterThanOrEqual(3);
    for (const h of houses) {
      const residents = g.edgesOf(h.id, "livesIn").filter((e) => e.to === h.id);
      expect(residents).toHaveLength(1);
      expect(h.attrs["stock"]).toBe(10);
      const shelter = sim.adam.needLevels(residents[0]!.from)["Shelter"]!;
      expect(shelter).toBeLessThan(0.5);
    }
  });

  it("only Molly places concepts, and only people finish them", () => {
    for (const l of w.log) {
      const e = l.event;
      if (e.kind === "node.created" && e.node.type === "House") {
        expect(l.by).toBe("molly");
        expect(e.node.attrs["state"]).toBe("planned");
      }
      if (e.kind === "node.attrs" && e.attrs["state"] === "built") expect(l.by).toBe("adam");
    }
  });

  it("houses close together become a named village", () => {
    const villages = [...g.nodes({ type: "Village" })];
    expect(villages.length).toBeGreaterThanOrEqual(1);
    for (const v of villages) {
      expect(typeof v.attrs["name"]).toBe("string");
      const members = g.edgesOf(v.id, "memberOf").map((e) => g.node(e.from)!);
      expect(members.length).toBeGreaterThanOrEqual(2);
      for (const m of members) {
        expect(m.attrs["state"]).toBe("built");
        expect(Math.hypot(m.pos!.x - v.pos!.x, m.pos!.y - v.pos!.y)).toBeLessThanOrEqual(12);
      }
    }
    const names = villages.map((v) => v.attrs["name"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("wood is never created or lost: cut wood is in houses or in hands", () => {
    let original = 0;
    for (const l of w.log) {
      if (l.event.kind === "node.created" && l.event.node.type === "Tree") original += l.event.node.attrs["wood"] as number;
    }
    const left = [...g.nodes({ type: "Tree" })].reduce((a, t) => a + (t.attrs["wood"] as number), 0);
    const stocked = [...g.nodes({ type: "House" })].reduce((a, h) => a + (h.attrs["stock"] as number), 0);
    const carried = sim.adam.people().reduce((a, p) => a + ((p.attrs["carrying"] as number) ?? 0), 0);
    expect(original - left).toBe(stocked + carried);
  });

  it("Entropy grows new trees and wears houses down", () => {
    const grown = w.log.filter((l) => l.by === "entropy" && l.event.kind === "node.created").length;
    expect(grown).toBeGreaterThan(0);
    for (const h of built(w)) {
      const c = h.attrs["condition"];
      expect(isLazy(c)).toBe(true);
      if (isLazy(c)) expect(readLazy(c, w.time + 10)).toBeLessThan(readLazy(c, w.time));
    }
  });

  it("gives the same world however time is sliced (like browser frames)", () => {
    const chunked = running(2);
    for (let t = 0; t < 10; t += 0.0137) chunked.run(t);
    chunked.run(10);
    expect(digest(chunked.world)).toBe(digest(w));
  });

  it("is deterministic and replays from the log", () => {
    const again = running(2);
    again.run(10);
    expect(digest(again.world)).toBe(digest(w));
    expect(digest(replay(2, w.log))).toBe(digest(w));
  });
});

describe("build and recognise rules in packs", () => {
  it("explain wrong needs, materials and edges", () => {
    const bad = {
      pack: "bad",
      version: "0.1.0",
      requires: ["core"],
      types: {
        Hut: {
          kind: "entity",
          build: {
            meets: "Fatige",
            material: "Person",
            materialAttr: "wood",
            amount: 3,
            work: 1,
            planner: "plans",
            resident: "livesIn",
            when: 1,
            spot: { expr: "field.fertility" },
          },
        },
        Hamlet: { kind: "entity", recognize: { members: "Hut", radius: 5, min: 3, full: 2, memberEdge: "partOf" } },
      },
    };
    const r = checkPacks([CORE, bad]);
    const msgs = r.ok ? "" : r.errors.map(formatPackError).join("\n");
    expect(msgs).toMatch(/recognize.full: must be at least min \(3\)/);
    const r2 = checkPacks([CORE, { ...bad, types: { ...bad.types, Hamlet: { kind: "entity", recognize: { members: "Hut", radius: 5, min: 2, full: 3, memberEdge: "partOf" } } } }]);
    const msgs2 = r2.ok ? "" : r2.errors.map(formatPackError).join("\n");
    expect(msgs2).toMatch(/build.meets: "Fatige" is not a need type \(did you mean "Fatigue"\?\)/);
    expect(msgs2).toMatch(/build.material: "Person" must be a memorable entity type/);
    expect(msgs2).toMatch(/build.planner: edge "plans" is not defined/);
    expect(msgs2).toMatch(/recognize.memberEdge: edge "partOf" is not defined/);
  });

  it("accept the shelter pack", () => {
    expect(checkPacks([CORE, SHELTER]).ok).toBe(true);
  });
});
