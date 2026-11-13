# 0003 — First vertical slice: one castle, two levels

- Status: superseded by 0011
- Date: 2026-11-13

## Context
The full vision (structures → cities → history → rumours) cannot be a first
release. A slice must still show the idea that makes this project different:
nodes expanding across levels, with fit learned from examples.

## Options
- **Wide:** many node types at one level (nice tiles, no hierarchy). Looks good, hides the idea.
- **Deep:** one hierarchy, two levels, few node types. Shows the idea, looks plainer.

## Proposed decision
Deep. `Castle` → `WallSegment`, `Tower`, `Gate`, `Keep`, `Courtyard` (layout
level) → tiles (tile level). Top-down 2D. Everything else goes to the parking lot.

## Consequences
Art can stay simple (coloured tiles are fine). The step-through view carries the
demo, so it is a feature, not a debug tool.
