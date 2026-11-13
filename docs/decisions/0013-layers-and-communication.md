# 0013 — Layers and who talks to whom

- Status: accepted
- Date: 2026-11-14

## Context
We have space, graph, people, Molly and the actualizer, plus engines
(scheduler, rules, WFC, …). Without a rule for who may read and write what,
single source of truth and determinism break quickly.

## Decision

Two kinds of layer:

**World layers** say *what* the world is. **Engines** say *how* it runs and stay
in a technical layer the world never mentions.

```
 WORLD                                      ENGINES (technical)
 ┌───────────┐  ┌───────────┐               Scheduler   event queue + clock
 │  Space    │  │  Graph    │  passive      Rules       fuzzy evaluation, rates
 │  fields   │  │ nodes,    │  truth        Spatial     neighbour queries (grid)
 └─────▲─────┘  │ edges     │               WFC         composite layouts
       │        └─────▲─────┘               RNG         seeded per node id
       │ read local   │ read local          Store       event log, snapshots
 ┌─────┴──────────────┴─────┐               Renderer    canvas
 │  People (agents)         │──┐
 └──────────────────────────┘  │ actions
 ┌──────────────────────────┐  │
 │  Molly                   │──┤ recognitions, concepts,
 │  reads everything        │  │ modifiers, entropy
 └──────────────────────────┘  ▼
                         ┌───────────┐      ┌──────────────┐
                         │  Events   │─────▶│ Space+Graph  │  only writer
                         └───────────┘      └──────┬───────┘
                                                   ▼ read-only
                                            Actualizer → Renderer
```

| Layer | Reads | Writes |
|---|---|---|
| Archie | packs | **types and rules** (pack load/update is an event) |
| Noah | its configuration | **first space, leaves and knowledge** (genesis events) |
| Space, Graph | — | — (passive; changed only by applied events) |
| People (run by **Adam**) | local space + graph, own knowledge links, concepts and modifiers from Molly | **actions** (as events) |
| Molly | everything | **events**: recognitions/names, concepts, modifiers, entropy |
| Actualizer | space + graph | nothing |
| Engines | what the layer using them passes in | nothing in the world directly |

**One write channel:** every change is an event applied in order by the
scheduler. The history of the world *is* the event log (event sourcing):
every wall, name and ruin has a recorded cause, which is environmental
storytelling for free, plus determinism and replay.

People don't talk to each other directly; they affect each other through
the world (and later through information nodes: rumours, knowledge).

## Open
- Is Molly one module or several (recogniser, entropy, concept keeper)
  that look like one from outside? Leaning: one face, several parts.
- Event log size over long runs (ADR-0014).

## Discussion
- 2026-11-14 — User: we need to decide which layers communicate. Right now we
  seem to have space–system–graph; various engines could be added, and keeping
  them in a more technical layer is an option.
- 2026-11-14 — Noah (genesis) and Archie (packs) added to the table (ADR-0017, 0018).
- 2026-11-14 — The engine that runs people (minds, movement, perception) is named Adam (ADR-0020).
- 2026-11-14 — User approved.
