import { createRng } from "../core";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1) >>> 0;

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const seedLabel = document.querySelector<HTMLElement>("#seed");
if (!canvas || !seedLabel) throw new Error("page is missing #world or #seed");
seedLabel.textContent = String(seed);

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas not supported");

// Placeholder until M1: scatter seeded dots to prove the seed reaches the renderer.
const rng = createRng(seed);
const styles = getComputedStyle(document.documentElement);
ctx.fillStyle = styles.getPropertyValue("--ground").trim();
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = styles.getPropertyValue("--leaf").trim();
for (let i = 0; i < 120; i++) {
  ctx.beginPath();
  ctx.arc(rng.next() * canvas.width, rng.next() * canvas.height, 2 + rng.next() * 3, 0, Math.PI * 2);
  ctx.fill();
}
