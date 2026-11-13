import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("gives the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("gives different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).every(Boolean);
    expect(same).toBe(false);
  });

  it("stays in range", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("forks deterministically and independently", () => {
    const x = createRng(9).fork(100);
    const y = createRng(9).fork(100);
    const z = createRng(9).fork(101);
    const xs = [x.next(), x.next()];
    expect([y.next(), y.next()]).toEqual(xs);
    expect([z.next(), z.next()]).not.toEqual(xs);
  });
});
