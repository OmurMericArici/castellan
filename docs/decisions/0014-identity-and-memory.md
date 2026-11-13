# 0014 — Identity and memory

- Status: accepted
- Date: 2026-11-14

## Context
Materials used in building are not deleted (MODEL.md 8): the tree becomes the
wall. Everything keeps its identity, and the event log keeps everything that
happened. Memory can run away.

## Options for ids
- **UUID** — unique anywhere, but 36-char strings are heavy, and random UUIDs
  break seeded determinism unless generated from the seed.
- **Integer counter** — 4–8 bytes, deterministic, never reused. Only unique
  within one world, which is all we need.

## Decision
- **Integer ids, never reused.** A UUID only if worlds ever need merging.
- **Transformation keeps the id.** Tree → log → wall part is the *same* node
  changing type (like promote), so nothing is duplicated and nothing is lost.
- **Fold settled composites.** A finished house can fold its parts into a
  compact summary and re-expand them on demand; WFC seeded by the house id
  gives the same layout each time. Parts with a story (the wall from the river
  tree, a damaged wall) stay unfolded.
- **Compact the event log** with periodic snapshots; old detail can be summarised
  into history entries.

## Discussion
- 2026-11-14 — User: materials shouldn't be deleted, but memory could blow up,
  so care is needed; maybe use UUIDs for entities.
- 2026-11-14 — User approved.
