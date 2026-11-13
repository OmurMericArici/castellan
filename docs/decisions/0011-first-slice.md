# 0011 — First vertical slice: from people to a village

- Status: accepted
- Date: 2026-11-14
- Supersedes: 0003

## Context
ADR-0003 (top-down castle) no longer fits the model (0005–0010). The slice must
show what is new: nothing is placed except leaves, yet houses and a village
appear, each person has a story, and parts are laid out WFC-style.

## Decision
- **Space:** small 2D map with height, water and fertility fields.
- **Leaves:** `Person`, `Tree`, `Stone`. (Tools later.)
- **One need:** shelter.
- **One action:** build a house (fuzzy triple; `Construction` takes time and uses materials).
- **One aggregation:** houses → `Village`.
- **Composition:** a house gets walls/door/floor laid out by a small WFC; the actualizer draws it top-down.
- **Story:** each person's event log readable in the UI ("year 3: built a house by the river").
- **Out:** knowledge nodes, happiness, birth, towns and above, tools, multiple needs.

## Packaging
Ships as two packs (ADR-0018): `core` (people, trees, stones, basic needs and goals,
sighting knowledge) and `shelter` (house concept, construction, village recognition).
Noah config: map size, fields, number of people, seed.

## Open before accepting
- Layers and write channel (ADR-0013), identity and memory (ADR-0014).
- Which of Molly's jobs are in the slice. Proposal: recognise (village, night),
  house concept, one modifier (night → go home), entropy limited to tree regrowth
  and building wear.

## Discussion
- 2026-11-14 — User approved.
