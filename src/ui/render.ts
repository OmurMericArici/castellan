import type { Space, World } from "../core";

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

/** Draws the space into an offscreen image once; leaves are drawn on top each frame. */
export function renderSpace(space: Space, view: FieldView): ImageData {
  const img = new ImageData(space.width, space.height);
  const field = view === "terrain" ? undefined : space.field(view);
  for (let y = 0; y < space.height; y++) {
    for (let x = 0; x < space.width; x++) {
      const i = (y * space.width + x) * 4;
      const c: RGB = field ? [field.at(x, y) * 255, field.at(x, y) * 255, field.at(x, y) * 255] : terrainColor(space, x, y);
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  return img;
}

const LEAF_STYLE: Record<string, { fill: string; size: number; shape: "circle" | "square" | "person" }> = {
  Tree: { fill: "#2f5e2a", size: 0.55, shape: "circle" },
  Stone: { fill: "#8a8a86", size: 0.45, shape: "square" },
  Person: { fill: "#c8452f", size: 0.7, shape: "person" },
};

export function drawWorld(ctx: CanvasRenderingContext2D, world: World, spaceImage: ImageData, scale: number): void {
  const space = world.space;
  if (!space) return;
  const buffer = new OffscreenCanvas(space.width, space.height);
  buffer.getContext("2d")?.putImageData(spaceImage, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer, 0, 0, space.width * scale, space.height * scale);

  // People last so they sit on top.
  const order = ["Stone", "Tree", "Person"];
  const entities = [...world.graph.nodes({ kind: "entity" })].sort(
    (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
  );
  for (const n of entities) {
    if (!n.pos) continue;
    const style = LEAF_STYLE[n.type] ?? { fill: "#000", size: 0.5, shape: "circle" as const };
    const x = n.pos.x * scale;
    const y = n.pos.y * scale;
    const r = style.size * scale;
    ctx.fillStyle = style.fill;
    ctx.beginPath();
    if (style.shape === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
    else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (style.shape === "person") {
      ctx.lineWidth = Math.max(1, scale * 0.25);
      ctx.strokeStyle = "#fff4e0";
      ctx.stroke();
    }
  }
}
