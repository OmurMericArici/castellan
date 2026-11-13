# 0008 — People are leaves and decision makers; derived things emerge through processes

- Status: accepted
- Date: 2026-11-14

## Context
ADR-0006 says only leaves can be placed. Something has to *cause* the derived
nodes. Values like happiness also mean little until people exist, yet people
are the ones who actually do things.

## Decision
- **Leaves** are people, stones, trees, tools, and similar basic things.
- **People are decision mechanisms.** Needs drive actions: to meet the shelter
  need a person builds a house.
- A house appears from a fuzzy combination of **a person in need, materials and
  a buildable spot**. It goes through a process (`Construction` → `House`); derived
  things are never created instantly.
- Afterwards an abstract link connects house and person (`livesIn`), and that
  link is what satisfies the need.
- Relations between leaves are typed edges: person `uses` axe, person `livesIn` house.
- **Personal simulation:** individual stories matter, so people are simulated one
  by one, Dwarf Fortress style, and every event goes into their history.
- **Later, skipped now:** knowledge nodes. A house can only appear if a person
  (and knowledge attached to that person) knows how to build one.

## Consequences
- The first meaningful slice needs people, materials, one need and one action.
- Building takes time, which favours the event-queue time model (ADR-0007).
- New open questions: decision mechanism (utility vs GOAP), material fate,
  where people come from (MODEL.md 8–10).

## Discussion
- 2026-11-14 — User: abstract values mean nothing until people exist, but people
  are the ones who do things, so they can't be postponed. "Needs → build a house"
  uses the fuzzy triple of needy person, material and buildable area; then an
  abstract person–house link meets the need. Knowing how to build matters once
  knowledge nodes exist, but can be skipped at first. Individual stories matter,
  hence DF-like personal simulation. Leaves: person, stone, tree, tool. Derived
  things like houses can't just pop into existence.
- 2026-11-14 — Refined by ADR-0012: the System defines the house and places a
  house concept; the person must work to make it real. Decision mechanism:
  utility scoring now, GOAP with knowledge nodes ("whatever you say"). People
  are released into the world first; birth comes later.
- 2026-11-14 — Knowledge nodes arrive earlier than planned, as shared claims
  (sightings first, ADR-0015). Know-how ("knows how to build") is still later.
