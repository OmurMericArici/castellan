import { fbm } from "./noise";
import { hash2, hashString } from "./rng";

/**
 * A field is a continuous property of the space (height, water, fertility…),
 * stored as a grid of values in [0, 1]. Fields are properties, never things:
 * trees and stones are leaf nodes in the graph (ADR-0006).
 */
export class Field {
  constructor(
    readonly name: string,
    readonly width: number,
    readonly height: number,
    readonly data: Float32Array,
  ) {}

  /** Value at a grid cell, clamped to the edges. */
  at(ix: number, iy: number): number {
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(ix)));
    const y = Math.min(this.height - 1, Math.max(0, Math.floor(iy)));
    return this.data[y * this.width + x] ?? 0;
  }

  /** Bilinear sample at a continuous position (cell centres sit at i + 0.5). */
  sample(x: number, y: number): number {
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const top = this.at(x0, y0) * (1 - tx) + this.at(x0 + 1, y0) * tx;
    const bottom = this.at(x0, y0 + 1) * (1 - tx) + this.at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  }
}

/** How Noah makes one field. Fields are generated in order; later ones may read earlier ones. */
export type FieldSpec =
  | {
      name: string;
      kind: "noise";
      /** Size of features in cells: bigger = broader hills. */
      scale: number;
      octaves?: number;
      /** Multiply by another field (or its inverse), e.g. fertility only on dry land. */
      mask?: { field: string; invert?: boolean };
    }
  | {
      name: string;
      kind: "below";
      /** 1 where `from` is under `level`, fading to 0 over `softness`. Water from height. */
      from: string;
      level: number;
      softness?: number;
    };

export interface SpaceSpec {
  width: number;
  height: number;
  fields: FieldSpec[];
}

export interface Space {
  readonly width: number;
  readonly height: number;
  readonly fields: ReadonlyMap<string, Field>;
  field(name: string): Field;
  contains(x: number, y: number): boolean;
}

export function generateSpace(seed: number, spec: SpaceSpec): Space {
  const { width, height } = spec;
  if (!(width > 0 && height > 0)) throw new Error(`space size must be positive, got ${width}×${height}`);
  const fields = new Map<string, Field>();
  const need = (name: string, by: string): Field => {
    const f = fields.get(name);
    if (!f) throw new Error(`field "${by}" refers to "${name}", which is not defined before it`);
    return f;
  };

  for (const fs of spec.fields) {
    if (fields.has(fs.name)) throw new Error(`field "${fs.name}" is defined twice`);
    const data = new Float32Array(width * height);
    if (fs.kind === "noise") {
      const noise = fbm(hash2(seed, hashString(fs.name)), fs.octaves ?? 4);
      const mask = fs.mask ? need(fs.mask.field, fs.name) : undefined;
      const invert = fs.mask?.invert ?? false;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let v = noise((x + 0.5) / fs.scale, (y + 0.5) / fs.scale);
          if (mask) {
            const m = mask.at(x, y);
            v *= invert ? 1 - m : m;
          }
          data[y * width + x] = v;
        }
      }
    } else {
      const from = need(fs.from, fs.name);
      const soft = Math.max(1e-6, fs.softness ?? 0.02);
      for (let i = 0; i < data.length; i++) {
        const t = (fs.level - (from.data[i] ?? 0)) / soft;
        data[i] = Math.min(1, Math.max(0, t));
      }
    }
    fields.set(fs.name, new Field(fs.name, width, height, data));
  }

  return {
    width,
    height,
    fields,
    field: (name) => {
      const f = fields.get(name);
      if (!f) throw new Error(`unknown field "${name}"`);
      return f;
    },
    contains: (x, y) => x >= 0 && y >= 0 && x < width && y < height,
  };
}
