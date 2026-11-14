/**
 * Check pack files with Archie, then try them in a short simulation.
 *
 *   npm run check-pack -- path/to/my-pack.json [more.json] [--days 10] [--seed 1] [--place Type=count ...]
 *
 * The default packs (core, shelter, hunger, hostility) are always loaded first,
 * so a new pack can require any of them. `--place Type=count` asks Noah to place
 * leaves of a new leaf type at the start (on dry land).
 */
import { readFileSync } from "node:fs";
import { checkPacks, createSimulation, createWorld, formatPackError, genesis, isLazy, loadPacks, readLazy, withPackPlacement } from "../src/core";
import type { LeafSpec, NoahConfig } from "../src/core";
import CORE from "../src/packs/core.json";
import SHELTER from "../src/packs/shelter.json";
import HUNGER from "../src/packs/hunger.json";
import HOSTILITY from "../src/packs/hostility.json";
import { DEFAULT_NOAH } from "../src/ui/noah-default";

const args = process.argv.slice(2);
const files: string[] = [];
let days = 10;
let seed = 1;
const place: LeafSpec[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--help" || a === "-h") {
    console.log("usage: npm run check-pack -- my-pack.json [more.json] [--days 10] [--seed 1] [--place Type=count ...]");
    console.log("  Loads core, shelter, hunger, hostility, then your packs; Archie checks them; then a short simulation.");
    console.log("  --place Type=count  Noah places that many of a leaf type at the start (new leaf types are placed only this way)");
    process.exit(0);
  }
  if (a === "--days") days = Number(args[++i]);
  else if (a === "--seed") seed = Number(args[++i]);
  else if (a === "--place") {
    const [type, count] = (args[++i] ?? "").split("=");
    place.push({ type: type!, count: Number(count), avoid: [{ field: "water", above: 0.05 }] });
  } else files.push(a);
}
if (files.length === 0) {
  console.log("usage: npm run check-pack -- my-pack.json [--days 10] [--seed 1] [--place Type=count]");
  process.exit(2);
}

const user: unknown[] = [];
for (const f of files) {
  try {
    user.push(JSON.parse(readFileSync(f, "utf8")));
  } catch (e) {
    console.log(`✗ ${f}: not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

const defaults = [CORE, SHELTER, HUNGER, HOSTILITY];
const check = checkPacks([...defaults, ...user]);
if (!check.ok) {
  console.log(`✗ Archie rejected the packs (${check.errors.length} problem${check.errors.length === 1 ? "" : "s"}):`);
  for (const e of check.errors) console.log(`  - ${formatPackError(e)}`);
  process.exit(1);
}
console.log(`✓ Archie accepts: ${check.registry.packs.map((p) => `${p.id} ${p.version}`).join(", ")}`);

const world = createWorld(seed);
loadPacks(world, [...defaults, ...user]);
const config: NoahConfig = withPackPlacement({ ...DEFAULT_NOAH, leaves: [...DEFAULT_NOAH.leaves, ...place] }, world.registry);
try {
  genesis(world, config);
} catch (e) {
  console.log(`✗ Noah could not start the world: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
const sim = createSimulation(world);
sim.start();
const t0 = Date.now();
sim.run(days);
console.log(`✓ simulated ${days} days (seed ${seed}) in ${Date.now() - t0} ms, ${world.log.length} events`);

const actions: Record<string, number> = {};
for (const l of world.log) if (l.event.kind === "activity") actions[l.event.activity.action] = (actions[l.event.activity.action] ?? 0) + 1;
console.log(`  actions started: ${Object.entries(actions).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);

const edgesMade: Record<string, number> = {};
for (const l of world.log) if (l.event.kind === "edge.created") edgesMade[l.event.edge.type] = (edgesMade[l.event.edge.type] ?? 0) + 1;
console.log(`  edges created: ${Object.entries(edgesMade).map(([k, v]) => `${k} ${v}`).join(", ")}`);

const counts: Record<string, number> = {};
for (const n of world.graph.nodes({ kind: "entity" })) counts[n.type] = (counts[n.type] ?? 0) + 1;
console.log(`  entities now: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);

console.log("  people at the end:");
for (const p of sim.adam.people()) {
  const needs = Object.entries(sim.adam.needLevels(p.id)).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ");
  const own = Object.entries(p.attrs)
    .filter(([k, v]) => !["name", "age", "determination"].includes(k) && !isLazy(v) && v !== null)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  console.log(`    ${String(p.attrs["name"])}: doing ${world.activities.get(p.id)?.action ?? "-"}; ${needs}${own ? `; ${own}` : ""}`);
}
const maxNeed: Record<string, number> = {};
for (const l of world.log) {
  if (l.event.kind !== "edge.data") continue;
  const lv = l.event.data["level"];
  const edge = world.graph.edge(l.event.id);
  const need = edge ? world.graph.node(edge.to)?.type : undefined;
  if (need && isLazy(lv)) maxNeed[need] = Math.max(maxNeed[need] ?? 0, readLazy(lv, l.t));
}
// Levels keep moving between changes; include where everyone ends up.
for (const p of sim.adam.people()) {
  for (const [need, v] of Object.entries(sim.adam.needLevels(p.id))) maxNeed[need] = Math.max(maxNeed[need] ?? 0, v);
}
console.log(`  highest need levels seen: ${Object.entries(maxNeed).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}`);
if (sim.adam.warnings.length) {
  console.log(`! ${sim.adam.warnings.length} pack rule(s) failed while running and were skipped:`);
  for (const w of sim.adam.warnings) console.log(`  - ${w}`);
} else {
  console.log("  no runtime warnings");
}
