# 0023 — Expression language and pack format v0.1

- Status: accepted (technical; designed by Claude during M2, open to change)
- Date: 2026-11-14

## Context
ADR-0018 decided packs are data run by our own interpreter, and that the
language would get its own record. M2 needed a first version.

## Decision

### Pack format
JSON with `pack`, `version`, `requires`, `types`, `edges` (spec in
[PACKS.md](../PACKS.md)). Strict: unknown keys are errors with typo hints;
naming rules (PascalCase types, camelCase attrs and edges) are enforced so
packs from different authors look alike. Rules join the format in M3.

### Language
- Expression-only, no statements: values, arithmetic, comparison, `and/or/not`,
  dotted names, and a fixed list of functions. No user-defined functions, no loops,
  no assignment.
- Pratt parser written by us; compiled once when Archie loads a pack, evaluated
  many times.
- **Names are checked at load time** against what the place in the pack allows
  (`allowedVars`), so mistakes surface before the world runs.
- **Strict types:** arithmetic needs numbers, logic needs true/false, no silent
  conversion. Errors say what was expected and where (column).
- **Bounded:** 500 characters, depth 48, 10 000 steps per evaluation.
- **Randomness only through a seeded generator** passed in by the engine; an
  expression without one can't roll. `if` is lazy.
- Expression results are written into events (e.g. rolled attribute values in
  `node.created`), so replay never re-evaluates randomness.

### Archie
- Checks each pack, then between packs: missing or circular `requires`,
  duplicate pack ids, a type or edge defined by two packs.
- Orders packs so requirements load first; loading emits `pack.loaded` events
  carrying the pack's JSON, so a world's log holds the exact rules it ran under.
- Noah refuses unknown types, non-entity types and non-leaf types, and checks the
  whole config before changing the world.

## Consequences
- Overriding or extending another pack's type (a firearms pack adding an attribute
  to `Person`) is not possible yet; it needs an `extends` mechanism later.
- Changing the language later is cheap while only our own packs exist; once others
  write packs, the format version must be respected.

## Discussion
- 2026-11-14 — User chose a custom interpreter for security and to avoid code in
  packs (ADR-0018). Language details left to Claude.
