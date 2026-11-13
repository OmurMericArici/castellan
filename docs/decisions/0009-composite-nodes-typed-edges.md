# 0009 — Composite nodes with internal parts; typed edges

- Status: accepted
- Date: 2026-11-14

## Context
A house is not atomic: it has walls, windows, building blocks. In the graph it
should still act as one node. ADR-0006 says outside input is only at the leaves;
does that forbid a house from having parts below it?

## Decision
- Derived nodes are **composite**: many parts folded into one node. Rules treat
  the composite as a single node.
- The leaf-only rule is about **outside input**. When the system itself creates a
  derived node, it may generate that node's internal parts. Example: on
  Construction → House, the house attaches to the root (the space), and walls,
  windows and blocks attach to the house.
- Internal parts are laid out **WFC-style**, and the **actualizer works together
  with this layer**. This is where WFC lives in the project.
- Edges are **typed** (`partOf`, `memberOf`, `uses`, `livesIn`, …).

## Consequences
- Two scales of structure: the world graph (people, houses, villages) and inside
  each composite (parts). Same node machinery, different rules.
- Clarifies ADR-0006 without changing it.

## Discussion
- 2026-11-14 — User: in our structure things start from walls; even houses are
  multi-layered but reduced to a single node. For this the edge-additive rule can
  be locally relaxed: on construction → house, the house attaches to the root and
  walls, windows, building blocks attach to the house. WFC-like structure comes
  in here and the actualizer works with this layer. The person–house relation
  could be written either way (person → house or house → person).
- 2026-11-14 — User: both directions open more possibilities. → edges stored
  once, queried from either end, each end may carry its own data.
