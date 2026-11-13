# 0005 — Node graph (story) and actualizer (physical) as separate layers

- Status: accepted
- Date: 2026-11-14 (revised the same day after discussion, before acceptance)

## Context
The project is a node-based world builder. Units combine upward into abstract
groups (houses → village → city → kingdom → empire), and groups act back on
their members. See [MODEL.md](../MODEL.md).

## Options
- **One layer:** generate geometry directly; structure is read off the tiles.
- **Two layers:** a story layer (node graph with attributes and rules) and an
  actualizer that only gives nodes a physical form.

## Decision
Two layers sharing one space (ADR-0006).
- **Single source of truth:** every value is stored in one place; summaries
  (village population) are computed from members, never stored twice.
- **Graph, not tree:** groups act like single nodes and take part in the same
  rules as leaves. Multiple membership is allowed by the structure; whether rules
  use it is open.
- **Actualizer reads only.** Because the graph lives in the same space, the
  actualizer has no way to contradict it, so no feedback channel is needed.
- WFC is an actualizer technique, not the core.

## Consequences
- The story runs headless: fast, testable, no rendering needed.
- ADR-0003 (top-down castle slice) no longer fits; a new slice is needed.
- Dropped from the first draft: top-down "targets" and lazy refinement from
  outside. Both conflicted with leaf-only input and single source of truth.

## Discussion
- 2026-11-14 — First draft proposed a tree, top-down targets and actualizer warnings.
  User: hierarchy is really a graph; groups behave like one node, as in the old
  Synthesis Lab. There is one source of truth, so a target/reality conflict
  can't arise. The space + graph structure leaves the actualizer nothing to break.
