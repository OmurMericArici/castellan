# 0018 — Archie and packs: the world's rules are expandable

- Status: accepted
- Date: 2026-11-14

## Context
The system should be expandable without touching the engine. A user should be
able to open an LLM, say "add a rule set for firearms to Castellan", and get
something that adds the right knowledge, entity and mind nodes. Tweaking is the
user's job; the point is unlimited expansion, including magic or technology.

## Decision
- **Everything is a pack.** A pack is a bundle of definitions: entity types,
  knowledge types, mind elements (needs, goals, actions), Molly's recognition
  rules, actualizer parts (WFC tiles). Our own content is packs too: "house
  building" is a pack, not engine code. The engine knows no houses.
- **Archie** (the architect) owns packs: loads, updates and **checks** them, and
  adds the characters defined by us or by users later.
- **Archie checks before anything runs:** schema, references (an action that
  needs `Gunpowder` must find it), dependencies (firearms needs metalworking),
  conflicts between packs. Clear error messages, so an LLM can fix its own pack.
- **Loading at runtime is an event.** Loading a pack mid-run goes into the event
  log like anything else ("year 120: gunpowder enters the world"), so replay
  stays deterministic. Removing a pack with living instances needs a restart or
  a migration.
- **LLM-friendly by design:** a published schema plus example packs is all an
  LLM needs to write a new one.

### Example: a firearms pack would add
| Kind | Adds |
|---|---|
| Entity | `Musket`, `Gunpowder`, `Saltpeter` |
| Knowledge | know-how `MakeGunpowder`, `MakeMusket` |
| Mind | action `Shoot` (serves *survive* and *hunt*), goal weight changes (armed people flee less) |
| Molly | recognise "armed band" |
| Actualizer | tiles for a powder mill |

## Pack format
- **A — Pure data + a small expression language** for conditions and rates
  (`needs.shelter > 0.6 and knows(MakeMusket)`). Safe to share and load from
  strangers or an LLM, deterministic, easy for Archie to check.
- **B — Code modules (TypeScript) with hooks.** Unlimited power, but running
  untrusted code in the browser is unsafe and much harder to check.

**Decided: A, run by our own interpreter.** Packs are data; conditions, rates
and effects are written in a small language that Castellan parses and
interprets itself. No `eval`, no JavaScript from packs, ever.
- Expressions are pure: they read the world and return values. Effects (create
  node, add edge, change value) are declared as data and applied by the engine
  as events.
- The interpreter is deterministic and bounded (step limit per evaluation), so a
  bad pack can be slow or wrong, but never dangerous and never hangs the world.
- Built-in engine extensions (a new actualizer technique) are engine code, not packs.
- The language itself gets its own decision record when we design it.

## Consequences
- The engine must stay generic: types, rules and parts all come from packs.
- The expression language is a real design task (small, deterministic, documented).
- The first slice ships as packs: `core` (people, trees, stones, basic needs),
  `shelter` (house concept, construction, village recognition).

## Discussion
- 2026-11-14 — User: the procedural system must be updatable dynamically. If a
  user asks an LLM for a firearms rule set for Castellan, an add-on that adds the
  needed knowledge, entity and mind nodes should be easy to define. Tweaking is
  left to the user, but this gives infinite expandability, and allows magic or
  technology. Our base sets (like the house-building stage) and future
  characters, added by us or users, are added, updated and controlled by a
  character named Archie (architect).
- 2026-11-14 — User: use a custom interpreter for the pack format; we write no
  code that way, and security is top level.
