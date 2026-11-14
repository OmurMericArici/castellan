import type { NoahConfig } from "../core";

/**
 * The demo's default Noah configuration. Content, not engine: from M2 on the
 * leaf types come from packs and Archie checks them.
 */
export const DEFAULT_NOAH: NoahConfig = {
  space: {
    width: 128,
    height: 80,
    fields: [
      { name: "height", kind: "noise", scale: 36, octaves: 5 },
      { name: "water", kind: "below", from: "height", level: 0.42, softness: 0.03 },
      { name: "fertility", kind: "noise", scale: 14, octaves: 3, mask: { field: "water", invert: true } },
    ],
  },
  leaves: [
    { type: "Tree", count: 260, prefer: "fertility", avoid: [{ field: "water", above: 0.05 }] },
    { type: "Stone", count: 60, avoid: [{ field: "water", above: 0.05 }] },
    { type: "Person", count: 6, avoid: [{ field: "water", above: 0.05 }] },
  ],
};

/** Extra leaves for the hunger pack; only used when that pack is loaded. */
export const NOAH_HUNGER_LEAVES: NoahConfig["leaves"] = [
  { type: "Bush", count: 70, prefer: "fertility", avoid: [{ field: "water", above: 0.05 }] },
];
