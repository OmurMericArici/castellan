# 0027 — We are building an engine; the world is its default pack

- Status: accepted (design principle)
- Date: 2026-11-15

## Context
While checking whether hunger, hostility and imperfect memory could be added as
packs (ADR-0026), the user stated what Castellan actually is.

## Decision
**Castellan is an engine. The goal is a default pack.**

- **Code** is only for systems that can't be expressed simply as data: pathfinding,
  the event queue and lazy values, sight and meeting computation, the expression
  interpreter, Archie's checks, WFC, rendering.
- **Packs** hold everything else: what exists, what people need and want, what
  their actions do, how they react, how memory works, what Molly recognises,
  what Entropy grows and wears.
- The test for any new mechanic: *can it be written as a pack?* If not, the
  missing piece is a general primitive to add to the engine, never the mechanic
  itself. A primitive must be useful beyond the one mechanic that asked for it.
- Our own content (`core`, `shelter`, and what comes next) is the **default
  pack set**, written with the same format and the same tools a user or an LLM
  would use. We get no shortcuts they don't have.

## Consequences
- Engine work and content work are separate kinds of task, and the devlog and
  decision records say which one each change is.
- Hard-coded behaviour that exists today (Adam's five verbs, fixed memory) is
  debt against this principle; ADR-0026 is the plan to pay it.
- A feature request is answered in two steps: which primitive is missing (if
  any), then which pack uses it.

## Discussion
- 2026-11-15 — User: add this as a design principle: we are actually developing
  an engine; our aim is to make a default pack; so systems we can't express
  simply are done in code, everything else in packs.
