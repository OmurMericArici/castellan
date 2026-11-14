/**
 * Quick look at a run with the default packs: what people did, what they learned,
 * houses, villages, grudges, deaths. `npx tsx scripts/probe.ts [seed] [days] [packs]`
 */
import { loadPacks } from "../src/core/archie";
import { genesis, withPackPlacement } from "../src/core/noah";
import { createSimulation } from "../src/core/sim";
import { createWorld } from "../src/core/world";
import { DEFAULT_NOAH } from "../src/ui/noah-default";
import CORE from "../src/packs/core.json";
import SHELTER from "../src/packs/shelter.json";
import HUNGER from "../src/packs/hunger.json";
import HOSTILITY from "../src/packs/hostility.json";
import PSY from "../src/packs/psychopathy.json";
import TALK from "../src/packs/talk.json";

const ALL: Record<string, unknown> = { core: CORE, shelter: SHELTER, hunger: HUNGER, hostility: HOSTILITY, psychopathy: PSY, talk: TALK };
const seed = Number(process.argv[2] ?? 1);
const days = Number(process.argv[3] ?? 6);
const names = (process.argv[4] ?? "core,shelter,hunger,hostility,psychopathy,talk").split(",");

const w = createWorld(seed);
loadPacks(w, names.map((n) => ALL[n]));
genesis(w, withPackPlacement(DEFAULT_NOAH, w.registry));
const sim = createSimulation(w);
sim.start();
const t0 = performance.now();
sim.run(days);
const ms = performance.now() - t0;

const count = (pred: (e: (typeof w.log)[number]) => boolean) => w.log.filter(pred).length;
const acts = new Map<string, number>();
for (const l of w.log) if (l.event.kind === "activity") acts.set(l.event.activity.action, (acts.get(l.event.activity.action) ?? 0) + 1);
const edges = new Map<string, number>();
for (const l of w.log) if (l.event.kind === "edge.created") edges.set(l.event.edge.type, (edges.get(l.event.edge.type) ?? 0) + 1);
console.log(`seed ${seed}, ${days} days, ${ms.toFixed(0)} ms, ${w.log.length} events`);
console.log("activities:", Object.fromEntries([...acts].sort((a, b) => b[1] - a[1])));
const sub = new Map<string, number>();
for (const l of w.log) if (l.event.kind === "activity" && l.event.activity.for) sub.set(`${l.event.activity.action} for ${l.event.activity.for}`, (sub.get(`${l.event.activity.action} for ${l.event.activity.for}`) ?? 0) + 1);
console.log("sub-problems:", Object.fromEntries(sub));
console.log("edges made:", Object.fromEntries(edges));
console.log("houses built:", [...w.graph.nodes({ type: "House" })].filter((h) => h.attrs["state"] === "built").length, "planned:", [...w.graph.nodes({ type: "House" })].length);
console.log("villages:", [...w.graph.nodes({ type: "Village" })].map((v) => v.attrs["name"]));
console.log("met:", count((l) => l.event.kind === "met"), "died:", count((l) => l.event.kind === "died"), "happened:", count((l) => l.event.kind === "happened"));
const learned = w.log.filter((l) => l.event.kind === "edge.created" && l.event.edge.type === "knowsHow" && l.event.edge.fromData?.["how"] !== "born");
console.log("methods learned:", learned.map((l) => (l.event.kind === "edge.created" ? `${String(w.graph.node(l.event.edge.from)?.attrs["name"])} ${String(w.graph.node(l.event.edge.to)?.type)} (${String(l.event.edge.fromData?.["how"])})` : "")).join(", "));
for (const p of sim.adam.people().slice(0, 8)) {
  const c = sim.adam.lastChoice.get(p.id);
  const top = c?.scores.slice(0, 3).map((s) => `${s.action}${s.via ? `<-${s.via.join("<-")}` : ""} ${s.score.toFixed(2)}`).join(" | ");
  console.log(`${String(p.attrs["name"])}: ${w.activities.get(p.id)?.action ?? "-"} · ${top}`);
}
if (sim.adam.warnings.length) console.log("warnings:", sim.adam.warnings);
