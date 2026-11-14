import { describe, expect, it } from "vitest";
import { loadPacks } from "./archie";
import { genesis, withPackPlacement } from "./noah";
import { checkPacks, formatPackError } from "./packs";
import { createSimulation } from "./sim";
import { logKey, Watcher } from "./watch";
import { createWorld, digest } from "./world";
import CORE from "../packs/core.json";
import SHELTER from "../packs/shelter.json";
import HUNGER from "../packs/hunger.json";
import HOSTILITY from "../packs/hostility.json";
import PSY from "../packs/psychopathy.json";
import TALK from "../packs/talk.json";
import { DEFAULT_NOAH } from "../ui/noah-default";

/** ADR-0037: packs bring their own watchers and logs. */

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

const withWatch = (watch: unknown) => [...ALL, { pack: "mine", version: "0.1.0", requires: ["core", "psychopathy"], watch }];

describe("pack logs (ADR-0037)", () => {
  it("every default pack declares a colour, a table and grouped log types", () => {
    const sim = running(8);
    const watch = sim.world.registry.watch;
    expect([...watch.keys()]).toEqual(["core", "shelter", "hunger", "hostility", "psychopathy", "talk"]);
    for (const def of watch.values()) {
      expect(def.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(def.tables.length).toBeGreaterThan(0);
      expect(def.logs.length).toBeGreaterThan(0);
    }
    expect(new Set([...watch.values()].map((d) => d.color)).size).toBe(watch.size);
    const groups = new Set(watch.get("hostility")!.logs.map((l) => l.group));
    expect([...groups]).toEqual(["Grudges", "Violence", "News"]);
  });

  it("lines come out of the event log, in the packs' own words", () => {
    const sim = running(8);
    const watcher = new Watcher(sim.world, sim.adam);
    sim.run(6);
    watcher.update();
    const moved = watcher.lines.filter((l) => l.pack === "shelter" && l.type === "Moved in");
    const built = sim.world.log.filter((l) => l.event.kind === "edge.created" && l.event.edge.type === "livesIn");
    expect(moved.length).toBe(built.length);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved[0]!.text).toMatch(/^\S+ finished a house and moved in$/);
    expect(moved[0]!.people.length).toBe(1);
    const taught = watcher.lines.filter((l) => l.type === "Taught");
    expect(taught.some((l) => l.text.endsWith("to build a house"))).toBe(true);
    expect(watcher.lines.some((l) => l.text.startsWith("A village formed: "))).toBe(true);
    expect(watcher.warnings).toEqual([]);
    // Lines stay in time order and name a declared log type.
    const keys = new Set(watcher.logTypes().map(logKey));
    for (const [i, l] of watcher.lines.entries()) {
      expect(keys.has(`${l.pack}/${l.group}/${l.type}`)).toBe(true);
      if (i > 0) expect(l.seq).toBeGreaterThanOrEqual(watcher.lines[i - 1]!.seq);
    }
  });

  it("reading in pieces gives the same lines as reading once", () => {
    const a = running(3);
    const whole = new Watcher(a.world, a.adam);
    a.run(5);
    whole.update();
    const b = running(3);
    const pieces = new Watcher(b.world, b.adam);
    for (let t = 0.25; t <= 5; t += 0.25) {
      b.run(t);
      pieces.update();
    }
    const key = (w: Watcher) => w.lines.map((l) => `${l.seq} ${l.pack}/${l.type}`);
    expect(key(pieces)).toEqual(key(whole));
  });

  it("a killing is logged with who saw it, and witnesses get their own line", () => {
    // More psychopaths, and a killing can be seen from anywhere, so one short run has both.
    const dark = { pack: "dark", version: "0.1.0", requires: ["psychopathy"], extends: { Psychopathy: { distribution: { histogram: [[0, 0.1, 4], [0.85, 1, 1]] } } } };
    const seen = JSON.parse(JSON.stringify(HOSTILITY)) as { events: { Murder: { seenWithin: number } } };
    seen.events.Murder.seenWithin = 500;
    const sim = running(1, [CORE, SHELTER, HUNGER, seen, PSY, TALK, dark]);
    const watcher = new Watcher(sim.world, sim.adam);
    sim.run(12);
    watcher.update();
    const murders = sim.world.log.flatMap((l) => (l.event.kind === "happened" && l.event.name === "Murder" ? [l.event] : []));
    expect(murders.length).toBeGreaterThan(0);
    const killings = watcher.lines.filter((l) => l.pack === "hostility" && l.type === "Killing");
    expect(killings.length).toBe(murders.length);
    expect(killings[0]!.text).toMatch(/^\S+ killed \S+; seen by .+$/);
    expect(killings[0]!.emphasis).toBe("strong");
    const witnesses = murders.reduce((n, m) => n + m.witnesses.length, 0);
    expect(witnesses).toBeGreaterThan(0);
    const saw = watcher.lines.filter((l) => l.type === "Witness");
    expect(saw.length).toBe(witnesses);
    expect(saw[0]!.text).toMatch(/^\S+ saw \S+ kill \S+$/);
    expect(watcher.lines.filter((l) => l.pack === "core" && l.type === "Death").length).toBe(sim.world.log.filter((l) => l.event.kind === "died").length);
    expect(watcher.lines.some((l) => l.pack === "psychopathy" && l.type === "Stalking")).toBe(true);
    // The dead are no longer rows.
    const table = watcher.table("psychopathy", sim.world.registry.watch.get("psychopathy")!.tables[0]!);
    expect(table.rows.length).toBe(sim.adam.people().length);
    expect(watcher.warnings).toEqual([]);
  });

  it("watching never changes the world", () => {
    const plain = running(8);
    plain.run(5);
    const watched = running(8);
    const watcher = new Watcher(watched.world, watched.adam);
    for (let t = 0.5; t <= 5; t += 0.5) {
      watched.run(t);
      watcher.update();
      for (const [pack, def] of watched.world.registry.watch) for (const table of def.tables) watcher.table(pack, table);
    }
    expect(digest(watched.world)).toBe(digest(plain.world));
  });
});

describe("pack tables (ADR-0037)", () => {
  it("psychopathy lists everyone alive with how psychopathic they are, highest first", () => {
    const sim = running(8);
    const watcher = new Watcher(sim.world, sim.adam);
    sim.run(2);
    const def = sim.world.registry.watch.get("psychopathy")!;
    const view = watcher.table("psychopathy", def.tables[0]!);
    expect(view.columns).toEqual(["Psychopathy", "Bloodlust", "Dread", "Hates"]);
    expect(view.rows.length).toBe(sim.adam.people().length);
    const values = view.rows.map((r) => r.cells[0] as number);
    for (const [i, r] of view.rows.entries()) {
      expect(values[i]).toBeCloseTo(sim.adam.mind(r.id).traits["Psychopathy"]!);
      if (i > 0) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
    }
  });

  it("rows that are not people read their own attributes, lazy ones included", () => {
    const sim = running(8);
    const watcher = new Watcher(sim.world, sim.adam);
    sim.run(8);
    const houses = sim.world.registry.watch.get("shelter")!.tables.find((t) => t.name === "Houses")!;
    const view = watcher.table("shelter", houses);
    expect(view.rows.length).toBeGreaterThan(0);
    const built = view.rows.find((r) => r.cells[0] === "built")!;
    expect(typeof built.cells[2]).toBe("number");
    expect(built.cells[2] as number).toBeLessThan(1);
  });
});

describe("Archie checks watch blocks", () => {
  it("accepts a pack that only watches", () => {
    expect(
      errorsOf(
        withWatch({
          color: "#123abc",
          tables: { Killers: { rows: "Person", where: "traits.Psychopathy > 0.5", columns: { Urge: "needs.Bloodlust" }, sort: "Urge" } },
          logs: { Mine: { Night: { on: "signal", if: 'signal == "dusk"', text: "Dark again" } } },
        }),
      ),
    ).toBe("");
  });

  it("explains each kind of mistake with its place", () => {
    const cases: [unknown, string][] = [
      [{ color: "red" }, "mine › watch.color: must be a colour"],
      [{ logs: { G: { T: { on: "happend", text: "x" } } } }, 'mine › watch.logs.G.T.on: must be one of started, happened'],
      [{ logs: { G: { T: { on: "happened", text: "x" } } }, tables: { A: { rows: "Person", columns: { X: "traits.Psycopathy" } } } }, '"Psycopathy" is not a trait type (did you mean "Psychopathy"?)'],
      [{ logs: { G: { T: { on: "died", text: "{self.name died" } } } }, 'a "{" is never closed'],
      [{ logs: { G: { T: { on: "died", text: "{victim.name} died" } } } }, 'unknown name "victim"'],
      [{ logs: { G: { T: { on: "linked", if: "rel.grudg", text: "x" } } } }, '"grudg" is not a edge type (did you mean "grudge"?)'],
      [{ tables: { A: { rows: "Persn", columns: { X: "self.age" } } } }, '"Persn" is not an entity type (did you mean "Person"?)'],
      [{ tables: { A: { rows: "House", columns: { X: "needs.Hunger" } } } }, 'unknown name "needs"'],
      [{ tables: { A: { rows: "Person", columns: { X: "self.age" }, sort: "Y" } } }, '"Y" is not one of this table\'s columns'],
      [{ logs: { G: { T: { on: "died", text: "x", emphasis: "loud" } } } }, "must be one of strong, normal, quiet"],
    ];
    for (const [watch, message] of cases) expect(errorsOf(withWatch(watch))).toContain(message);
  });

  it("methods carry their own words and entities their plural", () => {
    const sim = running(1);
    const types = sim.world.registry.types;
    expect(types.get("Gather")!.action!.words).toEqual({ doing: "gathering wood", did: "gathered wood", purpose: "get wood", name: "cut wood" });
    expect(types.get("Person")!.plural).toBe("people");
    const bad = [...ALL, { pack: "mine", version: "0.1.0", requires: ["core"], types: { Nap: { kind: "mind", role: "action", steps: [{ stay: true }], serves: { Recover: 1 }, words: { doin: "napping" } } } }];
    expect(errorsOf(bad)).toContain('unknown key "doin" (did you mean "doing"?)');
  });
});
