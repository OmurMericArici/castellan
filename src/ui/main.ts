import { createWorld, genesis } from "../core";
import { DEFAULT_NOAH } from "./noah-default";
import { drawWorld, renderSpace } from "./render";
import type { FieldView } from "./render";

const SCALE = 6;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`page is missing ${sel}`);
  return el;
};

const canvas = $<HTMLCanvasElement>("#world");
const seedLabel = $<HTMLElement>("#seed");
const viewSelect = $<HTMLSelectElement>("#view");
const newSeedButton = $<HTMLButtonElement>("#new-seed");
const summary = $<HTMLElement>("#summary");

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1) >>> 0;
seedLabel.textContent = String(seed);

const world = createWorld(seed);
const report = genesis(world, DEFAULT_NOAH);
const space = world.space!;

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

function draw(view: FieldView): void {
  drawWorld(ctx!, world, renderSpace(space, view), SCALE);
}

viewSelect.addEventListener("change", () => draw(viewSelect.value));
newSeedButton.addEventListener("click", () => {
  const next = Math.floor(Math.random() * 1_000_000);
  location.search = `?seed=${next}`;
});

const PLURAL: Record<string, string> = { Person: "people" };
const label = (type: string, n: number): string =>
  n === 1 ? type.toLowerCase() : (PLURAL[type] ?? `${type.toLowerCase()}s`);

summary.textContent =
  report.placed.map((p) => `${p.placed} ${label(p.type, p.placed)}`).join(" · ") +
  ` · ${world.log.length} events in the log`;

draw("terrain");
