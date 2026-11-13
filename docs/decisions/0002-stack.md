# 0002 — Browser stack

- Status: accepted
- Date: 2026-11-13

## Context
The demo must run in a browser from a static host (GitHub Pages). The solver
is CPU work on grids and graphs; the UI is mostly a canvas plus a few controls.

## Options
- **TypeScript + Vite, no UI framework, Canvas 2D, Tweakpane for controls** —
  small, fast, nothing between us and the canvas. Hand-rolled UI gets awkward if panels grow.
- **TypeScript + Vite + React** (what the old Synthesis Lab used) — easy panels,
  more boilerplate around a canvas-heavy app.
- **Python for learning, export to JSON, TS for the demo** — best ML tooling,
  two languages and a build step between them.

## Decision
TypeScript + Vite, no framework, Canvas 2D. Core solver in a pure TS module with
no DOM access, so it can be tested with Vitest and moved into a Web Worker later.
Seeded PRNG from day one. Revisit React if the UI outgrows a side panel.
Python only if ADR-0004 ends up needing real model training.

## Consequences
One language end to end. The "core has no DOM" rule is the important part
and stays even if the UI choice changes.
