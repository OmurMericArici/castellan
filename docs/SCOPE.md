# Scope

Target: **v0.1 "People to a village"**, a browser demo someone opens from a
link: configure Noah, press start, watch a handful of people explore, gather
wood, build houses and become a village that gets a name, then click any person
and read their story. Defined in [ADR-0011](decisions/0011-first-slice.md).

## v0.1 in scope

- **Behaviour in packs (M5):** step-program actions, reactions, memory rules, `meets`; proven by `hunger` and `hostility` packs and memory rules on sightings.

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
- **Story:** per-person history panel built from the event log; a world log and per-pack tables and logs declared by the packs (ADR-0037).
- **Packs:** `core` and `shelter`, written in our pack format, checked by Archie, run by our interpreter.
- Hosted on GitHub Pages.

## v0.1 out of scope (on purpose)

- Birth, ageing to death, farming.
- Knowledge drift, lies.
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
| M5 | Behaviour in packs | Actions are step programs, reactions fire on events, memory rules live on knowledge types, people notice each other (`meets`). Adam's hard-coded verbs are gone. `hunger`, `hostility` and memory rules work as packs written from PACKS.md alone (ADR-0026, 0027). |
| M5b | The mind | People plan backward over facts (no method names another), emotions scale goals, methods and restraint, traits and emotions scale each other, methods are learned by watching and talk and preferred more or less, events and people are remembered, an ordinary person can kill when angry and afraid enough, determination is a trait (ADR-0032, 0033). |
| M6 | Form and story | WFC house layouts, person story panel, timeline (the world log: packs bring their own watchers and logs, ADR-0037), Noah config in the URL, README with GIF. **v0.1 ships.** |

Current milestone: **M6** (M0–M5b done 2026-11-14). Done in M6 so far: pack watchers and logs, world log, story panel from pack words (ADR-0037). Left: WFC house layouts, Noah config in the URL, README with GIF.

## Parking lot

New ideas go here, not into the current milestone. Each one gets a date and one line.
Moving an item into scope needs a decision record.
The 2026-11-14 behaviour items are sorted into pack / small addition / new primitive in [ADR-0034](decisions/0034-behaviour-primitives.md).

- 2026-11-14 — Inquiry: a person who lacks a fact or a method asks someone (seeing a dead body, asking who it was; asking how to build a house). Pull instead of the push `tell`/`teach` in Chat.
- 2026-11-14 — Association: people link what was around them (night, far from home, a place, a person) to the emotion they felt, and later the context alone brings the emotion back (afraid at night far from home, then afraid whenever far from home).
- 2026-11-14 — (draft) Forgetting the way home: home is a remembered place like any other, so someone far away for long can lose it and be afraid.
- 2026-11-14 — (draft) Abandoning a home: because the surroundings became tied to fear (association), or because a better place was found.
- 2026-11-14 — (draft) Building paths: people lay a path on purpose (beside desire paths that wear in). On a path nobody loses the way, so paths let people go far; without one, fear of losing the way home keeps explorers close. Roads to far places follow.
- 2026-11-14 — (draft) Expectation and surprise: a general event when what is found differs from what was remembered (`found-empty` is one case).
- 2026-11-14 — (draft) Curiosity from known unknowns: open questions drive exploring and asking, instead of a constant `Grow` weight.
- 2026-11-14 — (draft) Learning by trying: when nobody knows a method, people try things and learn what an action gives.
- 2026-11-14 — (draft) Trust: how much a told claim is believed depends on who told it; conflicting claims.
- 2026-11-14 — (draft) Affinity: positive bonds between people, attachment, grief on loss.
- 2026-11-14 — (draft) Positive and social emotions: joy, pride, shame, guilt (norms held inside, not only punished by witnesses).
- 2026-11-14 — (draft) Emotion contagion (panic in a crowd) and mood as a slow baseline under emotions.
- 2026-11-14 — (draft) Selective imitation: copying the successful, the respected or the majority instead of a flat `watch` chance.
- 2026-11-14 — (draft) Reputation and gossip: opinions about a person as claims that spread by talk.
- 2026-11-14 — (draft) Habits: a method preferred in a context (time, place), not only overall.
- 2026-11-14 — (draft) Skill by practice: faster and better work with repetition; specialisation and a role emerging from it.
- 2026-11-14 — (draft) Ownership: "mine" as a claim; theft, territory, sharing.
- 2026-11-14 — (draft) Reciprocity, debt and promises: the base of trade and joint action.
- 2026-11-14 — (draft) Foresight: planning for an expected need (wood before winter); impatience as a trait.
- 2026-11-14 — (draft) Attention and salience: noticing what one looks for and what stands out, not everything in sight.
- 2026-11-14 — (draft) Body: pain, injury, illness; care for the hurt.
- ~~2026-11-14 — Pack watchers and logs: each pack declares tables to track and log types (grouped, with its own colour); the UI shows them per pack and lets the user tick which go to the global log.~~ Built in M6 (ADR-0037).
- 2026-11-14 — Watch: a `log` effect for steps and reactions, a trigger for needs and emotions crossing their line, summary values for tables (ADR-0037 open questions).
- 2026-11-14 — Village recognition by ties instead of a radius (ADR-0036, direction accepted, not built).
- 2026-11-14 — Villages that merge, split or dissolve; houses that collapse when their condition hits zero; repair.
- ~~2026-11-14 — Problem-solving mind with GOAP; emotions as multipliers; traits and emotions scaling each other; learning by observation and talk.~~ Built in M5b (ADR-0033).
- 2026-11-14 — Schools as a pack (talk exists; a school is a place and a teacher).
- 2026-11-14 — Packs adding new node kinds (ADR-0032). Declared interactions are covered by methods for now.
- 2026-11-14 — Mating and marriage as methods (desire → find a mate → a friend of the opposite sex → marry).
- 2026-11-14 — Watching morality emerge in a crowded, long simulation (methods punished or rewarded by others' reactions).
- ~~2026-11-14 — Witnessed events as shared knowledge claims that spread by telling.~~ Built in M5b (Report claims).
- 2026-11-14 — Justice: villagers acting together against a known killer (needs group actions).
- 2026-11-14 — Lies pack: knowledge given wrong on purpose.
- 2026-11-14 — Knowledge drift: claims degrading into variants over time or when retold (ties to Entropy).
- ~~2026-11-14 — Adam assigns personalities (trait nodes) to people.~~ Traits with distributions (ADR-0030); determination is one (M5b).
- 2026-11-14 — Trade routes emerging from shared knowledge (merchants teaching others).
- 2026-11-14 — Desire paths: routes people walk often wear into trails; Molly recognises and names them as roads.
- 2026-11-14 — LLM workflow for writing packs (schema + examples + Archie's errors as feedback). First step: a blind test, a fresh LLM writing a pack from PACKS.md alone.
- 2026-11-13 — 3D voxel rendering as a homage to Minecraft castles.
- 2026-11-13 — Castles: a settlement-scale pack where a castle emerges from towers, walls and a gate (the original idea).
- 2026-11-13 — Vector-space synthesis (proposal/modulation kernels) from the old Synthesis Lab as an alternative actualizer for organic layouts.
