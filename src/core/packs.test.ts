import { describe, expect, it } from "vitest";
import { compile, evaluate, ExprError } from "./expr";
import { checkPacks, formatPackError } from "./packs";
import { createRng } from "./rng";
import CORE from "../packs/core.json";

const run = (src: string, scope = {}, vars: string[] = Object.keys(scope)) => evaluate(compile(src, vars), { scope });

describe("expression language", () => {
  it("does arithmetic, comparison and logic with normal precedence", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("-2 * 3 + 10 % 4")).toBe(-4);
    expect(run("2 < 3 and not (1 == 2) or false")).toBe(true);
    expect(run('"a" == "a"')).toBe(true);
  });

  it("reads names and nested records it was allowed to read", () => {
    expect(run("self.age >= 16", { self: { age: 20 } })).toBe(true);
    expect(() => compile("age + 1", ["self"])).toThrow(/unknown name "age".*available: self/);
    expect(() => compile("slef.age", ["self"])).toThrow(/did you mean "self"/);
  });

  it("has a fixed set of functions, checked when compiled", () => {
    expect(run("clamp(15, 0, 10) + max(1, 4, 2) + round(2.6)")).toBe(17);
    expect(run("if(1 > 2, 1 / 0, 5)")).toBe(5); // only the chosen branch runs
    expect(() => compile("rnd()")).toThrow(/unknown function "rnd".*did you mean "rand"/);
    expect(() => compile("clamp(1, 2)")).toThrow(/takes 3 argument/);
  });

  it("is reproducible with a seeded generator and refuses randomness without one", () => {
    const e = compile("rand_int(1, 6)");
    expect(e.usesRandom).toBe(true);
    const a = Array.from({ length: 10 }, () => evaluate(e, { rng: createRng(5) }));
    const b = Array.from({ length: 10 }, () => evaluate(e, { rng: createRng(5) }));
    expect(a).toEqual(b);
    expect(() => evaluate(e)).toThrow(/not available here/);
  });

  it("reports mistakes with a column and never runs code", () => {
    expect(() => compile("1 +")).toThrow(/ended too early/);
    expect(() => compile("2 $ 3")).toThrow(/unexpected character "\$" \(column 3\)/);
    expect(() => run('1 + "a"')).toThrow(/needs a number/);
    expect(() => run("1 / 0")).toThrow(/division by zero/);
    expect(() => compile("constructor.constructor")).toThrow(ExprError);
    expect(() => compile("x".repeat(600))).toThrow(/longer than/);
    expect(() => compile("(".repeat(100) + "1" + ")".repeat(100))).toThrow(/nested too deeply/);
  });
});

describe("Archie's pack check", () => {
  const errorsOf = (packs: unknown[]) => {
    const r = checkPacks(packs);
    return r.ok ? [] : r.errors.map(formatPackError);
  };

  it("accepts the core pack", () => {
    const r = checkPacks([CORE]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.registry.types.get("Person")?.leaf).toBe(true);
      expect(r.registry.types.get("Shelter")?.role).toBe("need");
      expect(r.registry.edges.get("knows")?.to).toBe("knowledge");
    }
  });

  it("explains structural mistakes with paths and typo hints", () => {
    const errs = errorsOf([
      {
        pack: "Bad Pack",
        version: "1",
        types: {
          tree: { kind: "entity" },
          Rock: { kind: "thing" },
          Idea: { kind: "knowledge", leaf: true },
          Hunger: { kind: "mind" },
          Axe: { kind: "entity", atrs: {} },
          Ore: { kind: "entity", attrs: { purity: { type: "number", default: { expr: "rand_range(0, 1" } } } },
        },
      },
    ]);
    const joined = errs.join("\n");
    expect(joined).toMatch(/pack id must be lowercase/);
    expect(joined).toMatch(/version: must look like "1.0.0"/);
    expect(joined).toMatch(/types.tree: type names start with a capital/);
    expect(joined).toMatch(/types.Rock.kind: must be one of entity, knowledge, mind/);
    expect(joined).toMatch(/types.Idea.leaf: only entities can be leaves/);
    expect(joined).toMatch(/types.Hunger.role: mind types need a role/);
    expect(joined).toMatch(/types.Axe.atrs: unknown key "atrs" \(did you mean "attrs"\?\)/);
    expect(joined).toMatch(/types.Ore.attrs.purity.default.expr: expected "\)"/);
  });

  it("checks requirements, cycles and conflicts between packs", () => {
    expect(errorsOf([{ pack: "guns", version: "0.1.0", requires: ["metalwork"] }]).join()).toMatch(/needs pack "metalwork", which is not loaded/);
    expect(
      errorsOf([
        { pack: "a", version: "0.1.0", requires: ["b"] },
        { pack: "b", version: "0.1.0", requires: ["a"] },
      ]).join(),
    ).toMatch(/circular requirement: a → b → a/);
    expect(errorsOf([CORE, { pack: "dup", version: "0.1.0", types: { Tree: { kind: "entity" } } }]).join()).toMatch(
      /type "Tree" is already defined by pack "core"/,
    );
  });

  it("orders packs so requirements come first", () => {
    const r = checkPacks([{ pack: "guns", version: "0.1.0", requires: ["core"] }, CORE]);
    expect(r.ok && r.registry.packs.map((p) => p.id)).toEqual(["core", "guns"]);
  });
});
