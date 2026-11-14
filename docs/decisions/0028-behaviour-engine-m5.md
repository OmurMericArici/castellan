# 0028 — Behaviour engine in M5: how steps, reactions and memory were built

- Status: accepted (technical; designed by Claude during M5, open to change)
- Date: 2026-11-14

## Context
ADR-0026 decided behaviour moves into packs; ADR-0027 made "engine + default
pack" the principle. This records the concrete engine design.

## Decision

### Adam runs step programs
- An action is a list of steps; Adam keeps a small program counter per person
  (engine-side, rebuilt by re-deciding). Instant steps (`take`, `give`, `effect`,
  `if`, `finish`) run back to back; `goto`, `work` and `stay` take time and are
  the points where a person can be interrupted.
- `goto` targets: `known` (nearest remembered thing matching `where`, read from the
  person's claim, not the truth), `home`, `plan`, `target`, `explore`, `wander`,
  `linked` (people they have an edge to, at their current position).
- `take` finding nothing makes the person re-see the thing (their memory is
  corrected) and fires `found-empty`. The engine records `lastTakenBy` on what
  was taken from, so packs can blame someone.
- `work` with `progress` adds time spent to the target, including on interruption.
- A guard stops loops where actions keep ending instantly at the same moment.

### Our content was rewritten, not special-cased
- `core` (Explore, Wander, Rest) and `shelter` (Scout, Gather, Deliver, Build) are
  now step programs. The former Gather verb became two actions (Gather, Deliver),
  which is how utility AI usually splits it.
- All M3/M4 tests (building, villages, wood conservation, determinism) pass on the
  new engine unchanged.

### Knowledge remembers what was noticed
- Memorable types list `remember` attributes; a `Sighting` stores them, so a
  person's idea of a tree's wood can be out of date. Seeing a thing that changed
  creates a new claim and moves the person's link to it.
- Molly's concept placement now counts the wood the person *remembers*, not the
  real amount.

### Memory rules
- `knows` carries `confidence` as a lazy value. New sightings pass a `recall`
  roll; seeing again applies `reinforce`; a scheduled `adam.forget` event removes
  the link when confidence crosses `forgetBelow` (logged as caused by Entropy).

### Meetings
- When a person starts a leg, every other person's position along that time span
  is sampled (every 0.003 days); the first moment within sight radius gets an
  `adam.meet` event, re-checked when it fires. Same pair at most every 0.5 days.
  Only computed if some pack reacts to `meets`.

### Reactions and safety
- Reactions run on `sees`, `meets`, `found-empty`, `finished`, `dusk`, `dawn`, with
  `it`, `other`, `rel.<edge>` and `action` in scope.
- A pack rule that fails at runtime (e.g. reading an attribute that isn't there) is
  skipped and recorded in `adam.warnings`; the UI shows them. The world never
  crashes because of a pack.

### Format 0.4
- `do` is gone (Archie explains the replacement); numbers can be plain expression
  strings; packs can have top-level `reactions`. Archie checks targets, remembered
  attributes used in `where`, effect needs and edges, `rel.*` names, reaction events.

## Consequences
- Proof: `hunger` and `hostility` were written using only PACKS.md and need no
  engine code. In seed 3, two people grew grudges against a third, who later held
  one back: a feud nobody wrote.
- 12 days with four packs and six people take about 0.7 s.
- A true blind test (a fresh LLM writing a pack from PACKS.md alone) is still to do.

## Discussion
- 2026-11-14 — Built after the user approved ADR-0026 with `meets` included.
