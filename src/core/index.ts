// Public surface of the core. No DOM access anywhere under src/core (enforced by tsconfig.core.json).
export { createRng, hash2 } from "./rng";
export type { Rng } from "./rng";
