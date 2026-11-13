import { Adam, DEFAULT_ADAM } from "./adam";
import type { AdamOptions } from "./adam";
import { Molly } from "./molly";
import { runUntil } from "./world";
import type { Handler, World } from "./world";

/** The running cast around one world: Molly signals, Adam acts. */
export interface Simulation {
  readonly world: World;
  readonly adam: Adam;
  readonly molly: Molly;
  start(): void;
  /** Advance to `until` (days); returns how many scheduled happenings ran. */
  run(until: number): number;
}

export function createSimulation(world: World, opts: AdamOptions = DEFAULT_ADAM): Simulation {
  const adam = new Adam(world, opts);
  const molly = new Molly(world, (name) => adam.wakeAll(name));
  const handlers = new Map<string, Handler>([...adam.handlers, ...molly.handlers]);
  return {
    world,
    adam,
    molly,
    start() {
      adam.start();
      molly.start();
    },
    run: (until) => runUntil(world, until, handlers),
  };
}
