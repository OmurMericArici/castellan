# Scope

Target: **v0.1 "People to a village"**, a browser demo someone opens from a
link: configure Noah, press start, watch a handful of people explore, gather
wood, build houses and become a village that gets a name, then click any person
and read their story. Defined in [ADR-0011](decisions/0011-first-slice.md).

## v0.1 in scope

- **Space:** small 2D map with height, water and fertility fields.
- **Noah:** config for map size, fields, number of people, starting knowledge, seed; seed + config in the URL.
- **Leaves:** person, tree, stone.
- **Node kinds:** entity, knowledge (sightings only), mind (shelter need, a few goals and actions).
- **Adam:** event-driven people: walking legs, sight events, exploring, weighted goals,
  determination (stick with a task under some risk), night fear.
- **Molly:** house concept, village recognition and naming, night.
- **Entropy:** tree regrowth and building wear only.
- **Construction:** person works a house concept into a house from wood they know about and carry.
- **Actualizer:** a small WFC lays out each house's walls/door/floor; top-down 2D render.
- **Story:** per-person history panel built from the event log.
- **Packs:** `core` and `shelter`, written in our pack format, checked by Archie, run by our interpreter.
- Hosted on GitHub Pages.

## v0.1 out of scope (on purpose)

- Birth, ageing to death, food, multiple needs, personalities (beyond determination).
- Sharing knowledge between people, know-how, knowledge drift, lies.
- Towns and above, trade, war.
- Loading packs mid-run from the UI; an LLM pack workflow (the format must allow it, the UI can wait).
- 3D, the learning stage.

## Milestones

Each milestone ends with something visible, a devlog entry and a screenshot or GIF.

| # | Milestone | Done when |
|---|---|---|
| M0 | Skeleton | Vite + TS + Vitest, `src/core` with no DOM, empty canvas deployed to Pages. |
| M1 | World core | Space with fields, graph store (3 node kinds, typed two-way edges), event queue with lazy values, seeded RNG, event log. Noah builds a world from config; fields and leaves are drawn. Headless tests. |
| M2 | Archie and the interpreter | Pack format and a minimal expression language; Archie validates with clear errors; `core` types come from a pack, not code. |
| M3 | Adam | People wander, see, explore, remember sightings, pick actions by weighted goals with determination, fear the night. |
| M4 | Shelter | Molly places house concepts; people gather wood and build; `livesIn` meets shelter; houses become a named village; regrowth and wear. |
| M5 | Form and story | WFC house layouts, person story panel, timeline, Noah config in the URL, README with GIF. **v0.1 ships.** |

Current milestone: **M3** (M0–M2 done 2026-11-14).

## Parking lot

New ideas go here, not into the current milestone. Each one gets a date and one line.
Moving an item into scope needs a decision record.

- 2026-11-14 — Lies pack: knowledge given wrong on purpose.
- 2026-11-14 — Knowledge drift: claims degrading into variants over time or when retold (ties to Entropy).
- 2026-11-14 — Adam assigns personalities (trait nodes) to people.
- 2026-11-14 — Trade routes emerging from shared knowledge (merchants teaching others).
- 2026-11-14 — Desire paths: routes people walk often wear into trails; Molly recognises and names them as roads.
- 2026-11-14 — LLM workflow for writing packs (schema + examples + Archie's errors as feedback).
- 2026-11-13 — 3D voxel rendering as a homage to Minecraft castles.
- 2026-11-13 — Castles: a settlement-scale pack where a castle emerges from towers, walls and a gate (the original idea).
- 2026-11-13 — Vector-space synthesis (proposal/modulation kernels) from the old Synthesis Lab as an alternative actualizer for organic layouts.
