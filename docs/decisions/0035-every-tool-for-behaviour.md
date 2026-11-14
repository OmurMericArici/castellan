# 0035 — The engine offers every tool needed to model human behaviour

- Status: accepted (design principle; extends 0027)
- Date: 2026-11-14

## Context
ADR-0027 says Castellan is an engine and our world is its default pack, and tests
each mechanic by asking whether it can be written as a pack. That test only looks
at the mechanics *we* want. Listing what real human behaviour needs (ADR-0034)
showed many behaviours a pack author could not model at all. The user stated what
follows from being an engine.

## Decision
**Because Castellan is an engine, it must give the end user every tool needed to
model human behaviour.**

- The end user is whoever writes packs: us, another person or an LLM.
- The measure of the engine is what a pack author *can* express, not what our
  default packs happen to use. A human behaviour that cannot be modelled with the
  pack format is a gap in the engine.
- The answer to a gap is still a general primitive (ADR-0027), never the
  behaviour itself.
- Offering a tool does not mean shipping content for it. The default packs stay small.

## Consequences
- The behaviour list in the parking lot is a coverage checklist for the engine,
  not a list of features for our world.
- New primitives are judged by how many behaviours they open, and are proven by a
  pack written from PACKS.md alone.
- This sets a direction, not a schedule: tools are still built milestone by
  milestone, and new ideas still go to the parking lot first.
- The engine will grow larger than v0.1 needs. Keeping primitives few and general
  matters more because of it.

## Discussion
- 2026-11-14 — User: add this to our design philosophy: since Castellan is an
  engine, we have to offer the end user every kind of tool that can model human
  behaviour.
