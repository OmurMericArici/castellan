import { clockLabel, createSimulation, createWorld, DEFAULT_ADAM, genesis, isNight, loadPacks, Watcher, withPackPlacement } from "../core";
import type { NodeId } from "../core";
import { DEFAULT_NOAH } from "./noah-default";
import { AVAILABLE, DEFAULT_ORDER, packOrderFromUrl, sourcesFor } from "./packs";
import { drawWorld, renderSpace } from "./render";
import { StoryBook } from "./story";
import { WatchPanel } from "./watch";

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
const warningsBox = $<HTMLElement>("#warnings");

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1) >>> 0;
$<HTMLElement>("#seed").textContent = String(seed);

// ---------------------------------------------------------------- packs: enable, disable, order (ADR-0030)

const order = packOrderFromUrl(params);
renderPackManager(order);

const world = createWorld(seed);
try {
  loadPacks(world, sourcesFor(order));
} catch (e) {
  // Archie's message lists every problem with its place in the pack.
  summary.textContent = e instanceof Error ? e.message : String(e);
  summary.classList.add("error");
  throw e;
}
$<HTMLElement>("#packs").textContent = world.registry.packs.map((p) => `${p.id} ${p.version}`).join(", ");
genesis(world, withPackPlacement(DEFAULT_NOAH, world.registry));
const sim = createSimulation(world);
sim.start();
const space = world.space!;
const story = new StoryBook();
const watcher = new Watcher(world, sim.adam);

function go(next: { seed?: number; packs?: string[] }): void {
  const q = new URLSearchParams();
  q.set("seed", String(next.seed ?? seed));
  const packs = next.packs ?? order;
  if (packs.join(",") !== DEFAULT_ORDER.join(",")) q.set("packs", packs.join(","));
  location.search = `?${q.toString()}`;
}

function renderPackManager(current: string[]): void {
  const list = $<HTMLOListElement>("#pack-list");
  let working = [...current];
  const draw = () => {
    const rest = AVAILABLE.map((p) => p.id).filter((id) => !working.includes(id));
    list.innerHTML = "";
    for (const id of [...working, ...rest]) {
      const p = AVAILABLE.find((x) => x.id === id)!;
      const on = working.includes(id);
      const li = document.createElement("li");
      li.className = on ? "" : "off";
      li.innerHTML = `
        <label><input type="checkbox" ${on ? "checked" : ""} ${id === "core" ? "disabled" : ""}> <strong>${id}</strong>${p.example ? ' <span class="tag">blind test</span>' : ""}</label>
        <span class="hint">${p.description}</span>
        <span class="move">${on ? '<button type="button" data-up>↑</button><button type="button" data-down>↓</button>' : ""}</span>`;
      li.querySelector("input")!.addEventListener("change", (ev) => {
        working = (ev.target as HTMLInputElement).checked ? [...working, id] : working.filter((x) => x !== id);
        draw();
      });
      li.querySelector("[data-up]")?.addEventListener("click", () => {
        const i = working.indexOf(id);
        if (i > 0) [working[i - 1], working[i]] = [working[i]!, working[i - 1]!];
        draw();
      });
      li.querySelector("[data-down]")?.addEventListener("click", () => {
        const i = working.indexOf(id);
        if (i < working.length - 1) [working[i + 1], working[i]] = [working[i]!, working[i + 1]!];
        draw();
      });
      list.append(li);
    }
  };
  draw();
  $<HTMLButtonElement>("#apply-packs").addEventListener("click", () => go({ packs: working }));
}

// ---------------------------------------------------------------- canvas

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
newSeedButton.addEventListener("click", () => go({ seed: Math.floor(Math.random() * 1_000_000) }));

let selected: NodeId | undefined = sim.adam.people()[0]?.id;
canvas.addEventListener("click", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * space.width;
  const y = ((ev.clientY - rect.top) / rect.height) * space.height;
  let best: { id: NodeId; d: number } | undefined;
  for (const p of world.graph.nodes({ kind: "entity", type: "Person" })) {
    const pos = sim.adam.positionOf(p.id);
    if (!pos) continue;
    const d = Math.hypot(pos.x - x, pos.y - y);
    if (d < 4 && (!best || d < best.d)) best = { id: p.id, d };
  }
  if (best) selected = best.id;
});

// ---------------------------------------------------------------- person panel

/** How a method reads, in the words its pack gave it (ADR-0037). */
const wordsOf = (method: string) => world.registry.types.get(method)?.action?.words ?? {};

const nameOf = (id: NodeId | undefined) => (id === undefined ? "someone" : String(world.graph.node(id)?.attrs["name"] ?? "someone"));
const linksOf = (id: NodeId, edge: string) =>
  world.graph
    .edgesOf(id, edge)
    .filter((e) => e.from === id && world.graph.node(e.to)?.type === "Person")
    .map((e) => nameOf(e.to));

function renderPanel(): void {
  if (selected === undefined) return;
  const p = world.graph.node(selected);
  if (!p) return;
  const dead = p.attrs["dead"] === true;
  const activity = world.activities.get(selected);
  const doing = activity?.action;
  const mind = sim.adam.mind(selected);
  const traits = Object.entries(mind.traits).map(([k, v]) => `${k.toLowerCase()} ${v.toFixed(2)}`);
  const meter = (n: string, v: number, cls: string) =>
    `<div class="need ${cls}"><span>${n}</span><meter min="0" max="1" low="0.4" high="0.7" optimum="0" value="${v.toFixed(3)}"></meter></div>`;
  const bars = dead
    ? ""
    : [...Object.entries(mind.needs).map(([n, v]) => meter(n, v, "")), ...Object.entries(mind.emotions).map(([n, v]) => meter(n, v, "emotion"))].join("");
  const methods = Object.entries(sim.adam.methods(selected))
    .map(([m, pref]) => (pref === 1 ? m : `${m} ${pref.toFixed(2)}`))
    .join(", ");
  const doingText = doing ? `${wordsOf(doing).doing ?? doing.toLowerCase()}${activity?.for ? ` to ${wordsOf(activity.for).purpose ?? activity.for.toLowerCase()}` : ""}` : "—";
  const lines = story.lines(world, watcher, selected).map((l) => `<li>${l}</li>`).join("");
  const home = world.graph.edgesOf(selected, "livesIn").find((e) => e.from === selected);
  const village = home ? world.graph.edgesOf(home.to, "memberOf").map((e) => world.graph.node(e.to))[0] : undefined;
  const plan = world.graph.edgesOf(selected, "builds").map((e) => world.graph.node(e.to)).find((n) => n?.attrs["state"] === "planned");
  const carrying = typeof p.attrs["carrying"] === "number" ? p.attrs["carrying"] : 0;
  const homeLine = home
    ? `lives in a house${village ? ` in ${String(village.attrs["name"])}` : ""}`
    : plan
      ? `building a house: ${String(plan.attrs["stock"])}/10 wood at the site${carrying ? `, carrying ${carrying}` : ""}`
      : "no home yet";
  // Every kind of link to another person, whatever packs define them.
  const who = selected;
  const relations = [...world.registry.edges.values()]
    .filter((e) => e.from === "entity" && e.to === "entity")
    .map((e) => ({ edge: e.name, names: linksOf(who, e.name) }))
    .filter((r) => r.names.length)
    .map((r) => `${r.edge}: ${r.names.join(", ")}`);
  const death = world.log.find((l) => l.event.kind === "died" && l.event.id === selected);
  const status = dead && death?.event.kind === "died" ? `<p class="error">Died ${clockLabel(death.t)}${death.event.by !== undefined ? `, killed by ${nameOf(death.event.by)}` : ""}.</p>` : "";
  panel.innerHTML = `
    <h2>${String(p.attrs["name"] ?? `Person ${p.id}`)}${dead ? " †" : ""}</h2>
    ${status}
    <p class="hint">${String(p.attrs["age"])} years ${traits.length ? ` · ${traits.join(", ")}` : ""}${dead ? "" : ` · ${doingText}`} · knows ${sim.adam.knownCount(selected)} things</p>
    <p class="hint">${homeLine}${relations.length ? ` · ${relations.join(" · ")}` : ""}</p>
    <div class="needs">${bars}</div>
    <p class="hint">knows how to: ${methods || "nothing"}</p>
    <ol class="story">${lines}</ol>`;
}

// ---------------------------------------------------------------- pack watchers and logs (ADR-0037)

const watchPanel = new WatchPanel(world, watcher, $<HTMLElement>("#watch-list"), $<HTMLOListElement>("#global-log"), (id) => {
  if (world.graph.node(id)?.type === "Person") selected = id;
});

// ---------------------------------------------------------------- loop

let last = performance.now();
let lastPanel = 0;
function frame(now: number): void {
  const daysPerSecond = Number(speedSelect.value);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (daysPerSecond > 0) sim.run(world.time + dt * daysPerSecond);
  story.update(world);
  watcher.update();
  drawWorld(ctx!, sim, base, {
    scale: SCALE,
    ...(selected !== undefined ? { selected } : {}),
    sightRadius: isNight(world.time) ? DEFAULT_ADAM.sightNight : DEFAULT_ADAM.sightDay,
  });
  clock.textContent = clockLabel(world.time);
  if (now - lastPanel > 200) {
    renderPanel();
    watchPanel.render();
    const houses = [...world.graph.nodes({ type: "House" })];
    const builtCount = houses.filter((h) => h.attrs["state"] === "built").length;
    const villages = [...world.graph.nodes({ type: "Village" })].map((v) => String(v.attrs["name"]));
    const deaths = world.log.filter((l) => l.event.kind === "died").length;
    summary.textContent =
      `${sim.adam.people().length} people alive${deaths ? `, ${deaths} dead` : ""} · ${builtCount} houses built, ${houses.length - builtCount} being built` +
      (villages.length ? ` · villages: ${villages.join(", ")}` : "") +
      ` · ${world.log.length} events`;
    const warnings = [...sim.adam.warnings, ...watcher.warnings];
    warningsBox.hidden = warnings.length === 0;
    warningsBox.textContent = warnings.length ? `Pack rules that failed and were skipped:\n${warnings.join("\n")}` : "";
    lastPanel = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
