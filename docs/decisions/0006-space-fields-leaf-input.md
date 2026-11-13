# 0006 — Space with fields as root; outside input only at the leaves

- Status: accepted
- Date: 2026-11-14

## Context
Groups form when nodes are "close" and the place "suits" them. That needs a
notion of space, and if formation depends only on chance the results are
arbitrary. Separately: if the user can place a city directly, the system isn't
generating the city, the user is.

## Options
- Pure topology (no space) — simplest, but "close" and "fertile" mean nothing.
- Soft locations (point + radius) — distance, but no geography.
- **A defined space with fields** — geometry and geography drive formation.

## Decision
- The root of everything is a **space** with **fields** (height, water,
  fertility, soil, … exact list open). Rules read fields, so formation
  follows the land.
- From outside, only **leaf** node types can be placed. Everything above the
  leaves (village, town, kingdom, …) appears only through the system's rules.

## Consequences
- The flow always starts at the root: define the space, then place leaves, then run.
- Fields are a new design surface: their generation (noise, hand-painted, both?) needs a decision.
- "What is a leaf?" becomes a key open question (MODEL.md, question 7).

## Discussion
- 2026-11-14 — Asked whether the story layer needs space. User: geometry,
  geography and materials matter; define a space and assign values through
  fields, which also stops formation being purely random. The flow starts at
  the root; additions are only at the leaf end; cities/houses can't be placed;
  the system derives new definitions under its own rules.
- 2026-11-14 — Clarified by ADR-0009: the rule is about outside input; the system may
  give derived nodes internal parts (house → walls, windows).
- 2026-11-14 — Correction (wording fixed in place): the field list wrongly
  contained "materials". User: the space consists of fields; leaves are the things
  that are never derived. A tree is a material and a leaf node in the graph, but
  it is not a field and not part of the space.
