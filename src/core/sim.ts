import { Adam, DEFAULT_ADAM } from "./adam";
import type { AdamOptions } from "./adam";
import { Entropy } from "./entropy";
import { Molly } from "./molly";
import { runUntil } from "./world";
import type { Handler, World } from "./world";

/** The running cast around one world: Molly recognises, Adam acts, Entropy wears things down. */
export interface Simulation {
  readonly world: World;
  readonly adam: Adam;
  readonly molly: Molly;
  readonly entropy: Entropy;
  start(): void;
  /** Advance to `until` (days); returns how many scheduled happenings ran. */
  run(until: number): number;
}

export function createSimulation(world: World, opts: AdamOptions = DEFAULT_ADAM): Simulation {
  const adam = new Adam(world, opts);
  const molly = new Molly(world, adam);
  const entropy = new Entropy(world);
  adam.hooks = {
    onBuilt: (id) => {
      entropy.startWear(id);
      molly.recognize(id);
    },
  };
  const handlers = new Map<string, Handler>([...adam.handlers, ...molly.handlers, ...entropy.handlers]);
  return {
    world,
    adam,
    molly,
    entropy,
    start() {
      adam.start();
      molly.start();
      entropy.start();
    },
    run: (until) => runUntil(world, until, handlers),
  };
}
