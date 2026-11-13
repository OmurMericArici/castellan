# 0012 — Molly: recognises, names, defines, keeps entropy

- Status: accepted; job 4 (entropy) superseded by 0021
- Date: 2026-11-14

## Context
People act, but someone has to notice what they made, call it something, define
what a "house" even is, and keep the world from standing still. The project's
real aim is **emergence and environmental storytelling**; this role is what
turns raw simulation into a world with names and a past.

## Decision
A single world-level actor, **Molly** (from Moira, the Greek figure who spins
fate), with four jobs:

1. **Recognise and name.** It looks at the graph + space and names what we would
   see: these houses are a village (and the village gets a name), it is night,
   this is a drought.
2. **Define concepts.** It owns what a "house" is and makes a **house concept**
   appear (a planned site) when a needy person, materials and a suitable spot
   line up. A **person must work** to turn the concept into a real house.
3. **Influence people.** What it recognises changes people's rates and choices:
   at night a person can get scared and go home; without a home the shelter
   need rises faster. Later, being a city dweller changes behaviour too.
4. **Manage entropy.** New trees grow, droughts happen, buildings wear,
   people age. The world moves even when nobody acts.

War, trade and similar large phenomena are to be **derived** from this
system (recognised patterns of people's behaviour), not scripted.

## Consequences
- People never need global knowledge; Molly hands them concepts and modifiers.
- Recognition is where the fuzzy aggregation rules (village, town) live.
- Molly is read-everything but writes only through events (ADR-0013).

## Discussion
- 2026-11-14 — User: the System gives names to what we look at and influences
  people, so a person can be afraid at night and go home, or else their shelter
  need rises. The System defines what a house is and brings it about, but the
  person transforms the house concept and must work for it. Later, being a city
  dweller affects behaviour. War and trade are derived from this system. Another
  function: managing entropy (new trees, drought, buildings ageing, people
  ageing). Aim: emergence and environmental storytelling. Wants a friendly name.
- 2026-11-14 — Name: user liked Moira and chose the friendlier "Molly".
- 2026-11-14 — User is considering splitting entropy into its own character (ADR-0021).
- 2026-11-14 — Entropy split out into its own character (ADR-0021).
