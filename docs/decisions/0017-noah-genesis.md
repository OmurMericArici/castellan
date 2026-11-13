# 0017 — Noah: genesis and the only door for outside input

- Status: accepted
- Date: 2026-11-14

## Context
ADR-0006 says outside input happens only at the leaves, but not *who* does it or
how a user sets up a world. A world needs a space, first people and some starting
knowledge before Molly and the people can take over.

## Decision
**Noah** is the character who starts a world:
- defines the **space** and its fields,
- places the **first leaves** (people, trees, stones, tools),
- places the **first knowledge** (what the first people already know).

The user starts a world by **configuring Noah**: map size, field settings,
how many people, what they know, the seed. Noah is the formal version of the
"outside input" door: nothing else from outside touches the world.

## Consequences
- A world = Noah's configuration + the seed + loaded packs (ADR-0018). Same three → same world.
- Noah can only create leaf entities and knowledge, never derived things (ADR-0006, 0008).
- Noah's config is a natural thing to share ("try my world").

## Discussion
- 2026-11-14 — User: add a "Noah" character who defines the space and places the
  first people and knowledge; by configuring Noah the user sets the starting
  parameters.
