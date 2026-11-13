import { DUSK, isLazy, readLazy } from "../core";
import type { NodeId, Simulation, Space } from "../core";

export type FieldView = "terrain" | string;

type RGB = readonly [number, number, number];

const DEEP: RGB = [38, 74, 110];
const SHALLOW: RGB = [86, 136, 170];
const LOW: RGB = [196, 184, 140];
const HIGH: RGB = [150, 132, 108];
const LUSH: RGB = [108, 150, 84];

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function terrainColor(space: Space, x: number, y: number): RGB {
  const h = space.field("height").at(x, y);
  const water = space.fields.get("water")?.at(x, y) ?? 0;
  const fert = space.fields.get("fertility")?.at(x, y) ?? 0;
  const land = mix(mix(LOW, HIGH, Math.min(1, Math.max(0, (h - 0.4) / 0.4))), LUSH, Math.min(1, fert * 1.3));
  const sea = mix(SHALLOW, DEEP, Math.min(1, Math.max(0, (0.42 - h) / 0.2)));
  return mix(land, sea, water);
}

/** The space as a small canvas, one pixel per cell; drawn scaled up each frame. */
export function renderSpace(space: Space, view: FieldView): OffscreenCanvas {
  const img = new ImageData(space.width, space.height);
  const field = view === "terrain" ? undefined : space.field(view);
  for (let y = 0; y < space.height; y++) {
    for (let x = 0; x < space.width; x++) {
      const i = (y * space.width + x) * 4;
      const v = field ? field.at(x, y) * 255 : 0;
      const c: RGB = field ? [v, v, v] : terrainColor(space, x, y);
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  const canvas = new OffscreenCanvas(space.width, space.height);
  canvas.getContext("2d")?.putImageData(img, 0, 0);
  return canvas;
}

/** 0 by day, up to 1 deep at night, with a short fade around dusk and dawn. */
export function darkness(t: number): number {
  const f = t - Math.floor(t);
  const fade = 0.04;
  if (f >= DUSK) return Math.min(1, (f - DUSK) / fade + 0.2);
  if (f < fade) return 1 - f / fade;
  return 0;
}

export interface DrawOptions {
  scale: number;
  selected?: NodeId;
  sightRadius: number;
}

export function drawWorld(ctx: CanvasRenderingContext2D, sim: Simulation, base: OffscreenCanvas, o: DrawOptions): void {
  const world = sim.world;
  const space = world.space;
  if (!space) return;
  const s = o.scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, space.width * s, space.height * s);

  // What the selected person knows, ringed.
  const known = new Set<NodeId>();
  if (o.selected !== undefined) {
    for (const k of world.graph.edgesOf(o.selected, "knows")) {
      for (const a of world.graph.edgesOf(k.to, "about")) known.add(a.to);
    }
  }

  // Villages first, as a soft ground under their houses.
  const villageRadius = new Map<number, number>();
  for (const v of world.graph.nodes({ kind: "entity", type: "Village" })) {
    if (!v.pos) continue;
    let r = 4;
    for (const e of world.graph.edgesOf(v.id, "memberOf")) {
      const m = world.graph.node(e.from)?.pos;
      if (m) r = Math.max(r, Math.hypot(m.x - v.pos.x, m.y - v.pos.y) + 3);
    }
    villageRadius.set(v.id, r);
    ctx.beginPath();
    ctx.arc(v.pos.x * s, v.pos.y * s, r * s, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(240, 220, 170, 0.18)";
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255, 244, 224, 0.5)";
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const n of world.graph.nodes({ kind: "entity" })) {
    if (!n.pos || n.type === "Person" || n.type === "Village") continue;
    const x = n.pos.x * s;
    const y = n.pos.y * s;
    ctx.beginPath();
    if (n.type === "House") {
      drawHouse(ctx, n.attrs, x, y, s, world.time);
      continue;
    }
    if (n.type === "Stone") {
      ctx.fillStyle = "#8a8a86";
      ctx.rect(x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9);
    } else if (n.type === "Tree" && n.attrs["wood"] === 0) {
      ctx.fillStyle = "#7a5a3a";
      ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = "#2f5e2a";
      ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
    }
    ctx.fill();
    if (known.has(n.id)) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ffe08a";
      ctx.beginPath();
      ctx.arc(x, y, s * 1.1, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const dark = darkness(world.time);
  if (dark > 0) {
    ctx.fillStyle = `rgba(12, 18, 44, ${0.5 * dark})`;
    ctx.fillRect(0, 0, space.width * s, space.height * s);
  }

  for (const p of sim.adam.people()) {
    const pos = sim.adam.positionOf(p.id);
    if (!pos) continue;
    const x = pos.x * s;
    const y = pos.y * s;
    const resting = world.activities.get(p.id)?.action === "Rest";
    if (p.id === o.selected) {
      ctx.beginPath();
      ctx.arc(x, y, o.sightRadius * s, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 240, 200, 0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 240, 200, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, s * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = resting ? "#8c3a2c" : "#d04a32";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, s * 0.25);
    ctx.strokeStyle = p.id === o.selected ? "#ffe08a" : "#fff4e0";
    ctx.stroke();
    if (typeof p.attrs["carrying"] === "number" && p.attrs["carrying"] > 0) {
      ctx.fillStyle = "#a0703f";
      ctx.fillRect(x + s * 0.5, y - s * 1.2, s * 0.7, s * 0.7);
    }
  }

  // Village names on top of everything.
  ctx.font = `600 ${Math.max(11, s * 2.1)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  for (const v of world.graph.nodes({ kind: "entity", type: "Village" })) {
    if (!v.pos) continue;
    const label = String(v.attrs["name"] ?? "");
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(30, 26, 20, 0.7)";
    const ly = (v.pos.y - (villageRadius.get(v.id) ?? 9) - 0.8) * s;
    ctx.strokeText(label, v.pos.x * s, ly);
    ctx.fillStyle = "#fff4e0";
    ctx.fillText(label, v.pos.x * s, ly);
  }
}

/** Planned: dashed outline filling up with delivered wood. Built: a little house, greyer as it wears. */
function drawHouse(ctx: CanvasRenderingContext2D, attrs: Record<string, unknown>, x: number, y: number, s: number, t: number): void {
  const half = s * 1.1;
  if (attrs["state"] !== "built") {
    const stock = typeof attrs["stock"] === "number" ? attrs["stock"] : 0;
    const fill = Math.min(1, stock / 10);
    ctx.fillStyle = "rgba(160, 112, 63, 0.85)";
    ctx.fillRect(x - half, y + half - 2 * half * fill, 2 * half, 2 * half * fill);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#fff4e0";
    ctx.strokeRect(x - half, y - half, 2 * half, 2 * half);
    ctx.setLineDash([]);
    return;
  }
  const c = attrs["condition"];
  const condition = isLazy(c) ? readLazy(c, t) : 1;
  const r = Math.round(120 + 40 * condition);
  const g = Math.round(80 + 20 * condition);
  ctx.fillStyle = `rgb(${r}, ${g}, 50)`;
  ctx.fillRect(x - half, y - half * 0.4, 2 * half, half * 1.4);
  ctx.beginPath();
  ctx.moveTo(x - half * 1.25, y - half * 0.4);
  ctx.lineTo(x, y - half * 1.35);
  ctx.lineTo(x + half * 1.25, y - half * 0.4);
  ctx.closePath();
  ctx.fillStyle = "#6e3b2a";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#2a1a12";
  ctx.stroke();
}
