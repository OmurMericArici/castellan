# Castellan — working rules

Read `docs/SCOPE.md` (current milestone) and the latest `docs/DEVLOG.md` entry first.

## Workflow per session
1. Work only on the current milestone in `docs/SCOPE.md`.
2. A new idea that isn't in the milestone → add a dated line to the parking lot, don't build it.
3. A real choice (library, algorithm, data format, model principle, scope change) → decision
   record in `docs/decisions/` using the template, and add it to the table. Never rewrite an
   accepted record; supersede it.
   **Log every decision moment as it happens**, not at the end: when the user answers a design
   question, add a dated line to that record's Discussion section with their reasoning, and
   update `docs/MODEL.md` (strike resolved open questions, add new ones).
4. Something read or looked at that shaped the work → `docs/INSPIRATIONS.md` with a "take" line.
5. End of session → dated devlog entry: changed / learned / next.

## Commands
- `npm run dev` — local dev server
- `npm test` — Vitest
- `npm run typecheck` — includes the no-DOM check for `src/core`
- `npm run build` — typecheck + production build to `dist/`
- `npm run check-pack -- file.json` — Archie + 10-day simulation for a pack (`--help`)

## Engine or pack? (ADR-0027, ADR-0035)
Castellan is an engine; our content is its default pack. Before writing engine code for a
mechanic, ask whether it can be a pack. If not, add the smallest **general** primitive that
makes it possible, then write the mechanic as a pack. Never hard-code a mechanic.
The engine must offer pack authors every tool needed to model human behaviour: a
behaviour that can't be written as a pack is a gap in the engine.

## Code rules
- Use the glossary terms from `docs/VISION.md` in names and comments.
- `src/core` has no DOM access; it is pure, seeded and tested with Vitest.
- All randomness goes through the seeded PRNG.

## Language
Docs, code and commits in English (public portfolio repo). Talk with the user in Turkish.
