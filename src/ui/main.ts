import { clockLabel, createSimulation, createWorld, DEFAULT_ADAM, genesis, isNight, loadPacks } from "../core";
import type { NodeId } from "../core";
import CORE from "../packs/core.json";
import SHELTER from "../packs/shelter.json";
import { DEFAULT_NOAH } from "./noah-default";
import { drawWorld, renderSpace } from "./render";
import { StoryBook } from "./story";

const SCALE = 6;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`page is missing ${sel}`);
  return el;
};

const canvas = $<HTMLCanvasElement>("#world");
const viewSelect = $<HTMLSelectElement>("#view");
const speedSelect = $<HTMLSelectElement>("#speed");
const newSeedButton = $<HTMLButtonElement>("#new-seed");
const clock = $<HTMLElement>("#clock");
const summary = $<HTMLElement>("#summary");
const panel = $<HTMLElement>("#person");

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1) >>> 0;
$<HTMLElement>("#seed").textContent = String(seed);

const world = createWorld(seed);
try {
  loadPacks(world, [CORE, SHELTER]);
} catch (e) {
  // Archie's message lists every problem with its place in the pack.
  summary.textContent = e instanceof Error ? e.message : String(e);
  summary.classList.add("error");
  throw e;
}
$<HTMLElement>("#packs").textContent = world.registry.packs.map((p) => `${p.id} ${p.version}`).join(", ");
genesis(world, DEFAULT_NOAH);
const sim = createSimulation(world);
sim.start();
const space = world.space!;
const story = new StoryBook();

canvas.width = space.width * SCALE;
canvas.height = space.height * SCALE;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas not supported");

for (const name of space.fields.keys()) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = `field: ${name}`;
  viewSelect.append(opt);
}
let base = renderSpace(space, "terrain");
viewSelect.addEventListener("change", () => (base = renderSpace(space, viewSelect.value)));
newSeedButton.addEventListener("click", () => {
  location.search = `?seed=${Math.floor(Math.random() * 1_000_000)}`;
});

let selected: NodeId | undefined = sim.adam.people()[0]?.id;
canvas.addEventListener("click", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * space.width;
  const y = ((ev.clientY - rect.top) / rect.height) * space.height;
  let best: { id: NodeId; d: number } | undefined;
  for (const p of sim.adam.people()) {
    const pos = sim.adam.positionOf(p.id)!;
    const d = Math.hypot(pos.x - x, pos.y - y);
    if (d < 4 && (!best || d < best.d)) best = { id: p.id, d };
  }
  if (best) selected = best.id;
});

const LABEL: Record<string, string> = { Explore: "exploring", Wander: "wandering", Rest: "resting", Scout: "scouting for trees", Gather: "gathering wood", Build: "building" };

function renderPanel(): void {
  if (selected === undefined) return;
  const p = world.graph.node(selected);
  if (!p) return;
  const doing = world.activities.get(selected)?.action;
  const needs = sim.adam.needLevels(selected);
  const bars = Object.entries(needs)
    .map(([n, v]) => `<div class="need"><span>${n}</span><meter min="0" max="1" low="0.4" high="0.7" optimum="0" value="${v.toFixed(3)}"></meter></div>`)
    .join("");
  const lines = story.lines(selected).map((l) => `<li>${l}</li>`).join("");
  const home = world.graph.edgesOf(selected, "livesIn").find((e) => e.from === selected);
  const village = home ? world.graph.edgesOf(home.to, "memberOf").map((e) => world.graph.node(e.to))[0] : undefined;
  const plan = world.graph.edgesOf(selected, "builds").map((e) => world.graph.node(e.to)).find((n) => n?.attrs["state"] === "planned");
  const carrying = typeof p.attrs["carrying"] === "number" ? p.attrs["carrying"] : 0;
  const homeLine = home
    ? `lives in a house${village ? ` in ${String(village.attrs["name"])}` : ""}`
    : plan
      ? `building a house: ${String(plan.attrs["stock"])}/10 wood at the site${carrying ? `, carrying ${carrying}` : ""}`
      : "no home yet";
  panel.innerHTML = `
    <h2>${String(p.attrs["name"] ?? `Person ${p.id}`)}</h2>
    <p class="hint">${String(p.attrs["age"])} years · determination ${String(p.attrs["determination"])} · ${doing ? LABEL[doing] ?? doing : "—"} · knows ${sim.adam.knownCount(selected)} things</p>
    <p class="hint">${homeLine}</p>
    <div class="needs">${bars}</div>
    <ol class="story">${lines}</ol>`;
}

let last = performance.now();
let lastPanel = 0;
function frame(now: number): void {
  const daysPerSecond = Number(speedSelect.value);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (daysPerSecond > 0) sim.run(world.time + dt * daysPerSecond);
  story.update(world);
  drawWorld(ctx!, sim, base, {
    scale: SCALE,
    ...(selected !== undefined ? { selected } : {}),
    sightRadius: isNight(world.time) ? DEFAULT_ADAM.sightNight : DEFAULT_ADAM.sightDay,
  });
  clock.textContent = clockLabel(world.time);
  if (now - lastPanel > 200) {
    renderPanel();
    const houses = [...world.graph.nodes({ type: "House" })];
    const builtCount = houses.filter((h) => h.attrs["state"] === "built").length;
    const villages = [...world.graph.nodes({ type: "Village" })].map((v) => String(v.attrs["name"]));
    summary.textContent =
      `${sim.adam.people().length} people · ${builtCount} houses built, ${houses.length - builtCount} being built` +
      (villages.length ? ` · villages: ${villages.join(", ")}` : "") +
      ` · ${[...world.graph.nodes({ type: "Sighting" })].length} shared sightings · ${world.log.length} events`;
    lastPanel = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
