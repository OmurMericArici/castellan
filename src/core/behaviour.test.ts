import { describe, expect, it } from "vitest";
import { loadPacks } from "./archie";
import { isLazy } from "./lazy";
import { genesis } from "./noah";
import { checkPacks, formatPackError } from "./packs";
import { createSimulation } from "./sim";
import { createWorld, digest, replay } from "./world";
import CORE from "../packs/core.json";
import SHELTER from "../packs/shelter.json";
import HUNGER from "../packs/hunger.json";
import HOSTILITY from "../packs/hostility.json";
import { DEFAULT_NOAH, NOAH_HUNGER_LEAVES } from "../ui/noah-default";

const ALL = [CORE, SHELTER, HUNGER, HOSTILITY];
const NOAH = { ...DEFAULT_NOAH, leaves: [...DEFAULT_NOAH.leaves, ...NOAH_HUNGER_LEAVES] };

function running(seed: number, packs: unknown[] = ALL, config = NOAH) {
  const w = createWorld(seed);
  loadPacks(w, packs);
  genesis(w, config);
  const sim = createSimulation(w);
  sim.start();
  return sim;
}

describe("behaviour written as packs (ADR-0026)", () => {
  it("hunger: people forage from bushes they remember and stay fed", () => {
    const sim = running(2);
    sim.run(12);
    const w = sim.world;
    const forages = w.log.filter((l) => l.event.kind === "activity" && l.event.activity.action === "Forage").length;
    expect(forages).toBeGreaterThan(50);
    for (const p of sim.adam.people()) expect(sim.adam.needLevels(p.id)["Hunger"]).toBeLessThan(0.9);
    const picked = w.log.filter((l) => l.event.kind === "node.attrs" && "food" in l.event.attrs).length;
    expect(picked).toBeGreaterThan(0);
  });

  it("hostility: an emptied tree or bush breeds a grudge against whoever emptied it", () => {
    const sim = running(3);
    sim.run(12);
    const w = sim.world;
    const g = w.graph;
    const grudges = w.log.filter((l) => l.event.kind === "edge.created" && l.event.edge.type === "grudge");
    expect(grudges.length).toBeGreaterThan(0);
    for (const l of grudges) {
      if (l.event.kind !== "edge.created") continue;
      expect(g.node(l.event.edge.to)?.type).toBe("Person");
      expect(l.event.edge.to).not.toBe(l.event.edge.from);
    }
    expect(w.log.some((l) => l.event.kind === "met")).toBe(true);
    expect(w.log.some((l) => l.event.kind === "activity" && l.event.activity.action === "Confront")).toBe(true);
  });

  it("memory: what isn't seen again fades and is forgotten; recall decides what is kept at all", () => {
    const forgetful = JSON.parse(JSON.stringify(CORE)) as { types: { Sighting: { memory: object } } };
    forgetful.types.Sighting.memory = { recall: 1, fade: -0.4, reinforce: "confidence + (1 - confidence) * 0.6", forgetBelow: 0.3 };
    const sim = running(4, [forgetful], DEFAULT_NOAH);
    sim.run(6);
    const w = sim.world;
    const forgotten = w.log.filter((l) => l.by === "entropy" && l.event.kind === "edge.removed").length;
    expect(forgotten).toBeGreaterThan(0);
    const knows = [...w.graph.nodes({ type: "Person" })].flatMap((p) => w.graph.edgesOf(p.id, "knows"));
    expect(knows.length).toBeGreaterThan(0);
    for (const k of knows) expect(isLazy(k.fromData["confidence"])).toBe(true);

    const blank = JSON.parse(JSON.stringify(CORE)) as { types: { Sighting: { memory: object } } };
    blank.types.Sighting.memory = { recall: 0 };
    const none = running(4, [blank], DEFAULT_NOAH);
    none.run(2);
    expect([...none.world.graph.nodes({ type: "Person" })].flatMap((p) => none.world.graph.edgesOf(p.id, "knows"))).toHaveLength(0);
  });

  it("a broken rule is skipped with a warning; the world keeps running", () => {
    const bad = {
      pack: "bad",
      version: "0.1.0",
      requires: ["core"],
      reactions: [{ on: "sees", if: "it.nonsense > 1", do: { "needs.Fear": 0.1 } }],
    };
    const sim = running(1, [CORE, bad], DEFAULT_NOAH);
    expect(() => sim.run(1)).not.toThrow();
    expect(sim.adam.warnings.join("\n")).toMatch(/bad reactions\[0\] \(sees\): ".nonsense" has no value here/);
  });

  it("all packs together stay deterministic and replay from the log", () => {
    const a = running(5);
    const b = running(5);
    a.run(6);
    for (let t = 0; t < 6; t += 0.031) b.run(t);
    b.run(6);
    expect(digest(b.world)).toBe(digest(a.world));
    expect(digest(replay(5, a.world.log))).toBe(digest(a.world));
  });
});

describe("Archie checks steps, reactions and memory", () => {
  const errorsOf = (pack: unknown) => {
    const r = checkPacks([CORE, pack]);
    return r.ok ? "" : r.errors.map(formatPackError).join("\n");
  };

  it("explains steps that can't work", () => {
    const msgs = errorsOf({
      pack: "bad",
      version: "0.1.0",
      requires: ["core"],
      types: {
        Peek: { kind: "mind", role: "action", steps: [{ goto: { known: "Person" } }], serves: { Grow: 1 } },
        Sniff: { kind: "mind", role: "action", steps: [{ goto: { known: "Tree", where: "it.age > 1" } }], serves: { Grow: 1 } },
        Hug: { kind: "mind", role: "action", steps: [{ effect: { link: { edge: "friend", to: "target" }, "needs.Love": 1 } }], serves: { Grow: 1 } },
      },
    });
    expect(msgs).toMatch(/Peek.steps\[0\].goto.known: "Person" must be a memorable entity type/);
    expect(msgs).toMatch(/Sniff.steps\[0\].goto.where: "it.age": people don't remember "age" of Tree/);
    expect(msgs).toMatch(/Hug.steps\[0\].effect.link: edge "friend" is not defined/);
    expect(msgs).toMatch(/Hug.steps\[0\].effect.needs.Love: "Love" is not a need type/);
    // Structure is checked first: a malformed step is reported before cross-references.
    const shape = errorsOf({ pack: "bad", version: "0.1.0", requires: ["core"], types: { Dance: { kind: "mind", role: "action", steps: [{ dance: true }], serves: { Grow: 1 } } } });
    expect(shape).toMatch(/Dance.steps\[0\]: each step needs exactly one of: goto, work, take, give, effect, if, finish, stay/);
  });

  it("explains reactions and memory rules that can't work", () => {
    const msgs = errorsOf({
      pack: "bad",
      version: "0.1.0",
      requires: ["core"],
      types: { Rumour: { kind: "knowledge", memory: { recall: 2, forgetBelow: 3 } }, Rock: { kind: "entity", remember: ["size"] } },
      reactions: [{ on: "meet", do: {} }, { on: "meets", if: "rel.friend", do: { "needs.Fear": 0.1 } }],
    });
    expect(msgs).toMatch(/reactions\[0\].on: must be one of .* \(did you mean "meets"\?\)/);
    expect(msgs).toMatch(/memory.forgetBelow: must be a number between 0 and 1/);
    expect(msgs).toMatch(/Rock.remember: only memorable entities have "remember"/);
    const later = errorsOf({ pack: "bad", version: "0.1.0", requires: ["core"], reactions: [{ on: "meets", if: "rel.friend", do: { "needs.Fear": 0.1 } }] });
    expect(later).toMatch(/reactions\[0\].if: "rel.friend": edge "friend" is not defined/);
  });

  it("accepts every default pack", () => {
    expect(checkPacks(ALL).ok).toBe(true);
  });
});
