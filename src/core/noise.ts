import { hash2 } from "./rng";

export type Noise2D = (x: number, y: number) => number;

const fade = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Seeded 2D value noise in [0, 1], smooth between integer lattice points. */
export function valueNoise(seed: number): Noise2D {
  const lattice = (ix: number, iy: number): number => hash2(hash2(seed, ix | 0), iy | 0) / 4294967296;
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const sx = fade(x - x0);
    const sy = fade(y - y0);
    const top = lerp(lattice(x0, y0), lattice(x0 + 1, y0), sx);
    const bottom = lerp(lattice(x0, y0 + 1), lattice(x0 + 1, y0 + 1), sx);
    return lerp(top, bottom, sy);
  };
}

/** Fractal sum of value-noise octaves, normalised back to [0, 1]. */
export function fbm(seed: number, octaves: number): Noise2D {
  const layers = Array.from({ length: Math.max(1, octaves) }, (_, i) => valueNoise(hash2(seed, i)));
  return (x, y) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (const layer of layers) {
      sum += layer(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}
