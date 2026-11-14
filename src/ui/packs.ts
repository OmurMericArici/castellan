import CORE from "../packs/core.json";
import SHELTER from "../packs/shelter.json";
import HUNGER from "../packs/hunger.json";
import HOSTILITY from "../packs/hostility.json";
import PSYCHOPATHY from "../packs/psychopathy.json";
import TALK from "../packs/talk.json";
import FRIENDSHIP from "../../examples/blind/friendship.json";
import FOOD_STORAGE from "../../examples/blind/food-storage.json";

/** Every pack the demo knows. Which ones load, and in what order, comes from the URL. */
export interface PackEntry {
  id: string;
  source: unknown;
  description: string;
  /** Written by an outside author in the blind test (ADR-0029). */
  example?: boolean;
}

const entry = (source: unknown, example = false): PackEntry => {
  const s = source as { pack: string; description?: string };
  return { id: s.pack, source, description: s.description ?? "", ...(example ? { example } : {}) };
};

export const AVAILABLE: PackEntry[] = [
  entry(CORE),
  entry(SHELTER),
  entry(HUNGER),
  entry(HOSTILITY),
  entry(PSYCHOPATHY),
  entry(TALK),
  entry(FRIENDSHIP, true),
  entry(FOOD_STORAGE, true),
];

export const DEFAULT_ORDER = ["core", "shelter", "hunger", "hostility", "psychopathy", "talk"];

/** The enabled packs, in order, from `?packs=a,b,c` (or the default set). */
export function packOrderFromUrl(params: URLSearchParams): string[] {
  const raw = params.get("packs");
  if (!raw) return [...DEFAULT_ORDER];
  return raw.split(",").filter((id) => AVAILABLE.some((p) => p.id === id));
}

export function sourcesFor(order: readonly string[]): unknown[] {
  return order.map((id) => AVAILABLE.find((p) => p.id === id)!.source);
}
