# 0033 — The mind, built: planning over facts, emotions and scales, know-how, remembered events

- Status: accepted (technical; designed by Claude from the user's decisions in ADR-0032, open to change)
- Date: 2026-11-15

## Context
ADR-0032 set the direction (GOAP, learning by watching and talk, emotions as
multipliers, traits that support or suppress each other, emerging morality) and the
user decided to build it before M6 (milestone M5b). The same session added four
items: a talk pack, events remembered as knowledge, ordinary people able to kill,
people remembering each other. And the review of how people are modelled found that
`determination` was an attribute while `Psychopathy` was a trait.

## Decision

### Planning: local facts, emergent chains
- A **fact** is something a person believes. Packs declare facts as expressions
  over the mind scope (`"hasLoad": "self.carrying >= 4"`). The engine also knows
  facts it can read directly: `known.<Type>`, `linked.<edge>`, `home`, `plan`,
  `person`.
- A method (an action type) says only what it needs (`requires`) and what it
  makes true (`gives`). **Requirements are also derived from steps:** a
  non-optional `goto` to a single target needs that target to exist (`goto known
  Tree where it.wood > 0` needs "knows a tree with wood"). A `goto explore` gives
  `known.*`. No method ever names another.
- At every decision Adam scores each known method that serves a goal (as before:
  Σ goal weight × serves), then plans backward: each missing fact becomes a
  sub-problem, solved by the cheapest known method that gives it, recursively.
  **No depth limit**; a fact already being solved higher up can't be reused, so
  the search ends. A method with no plan is not a choice. The person does the
  first step of the plan; when it ends they think again, so plans follow the
  world as it changes.
- Score = serves × `action.X` scale × preference × Π(1 − restraint) over the
  chain × 0.97^(sub-problems). Cost = Σ cost / preference.
- Activities record what they are for (`for: "Build"`), so the history and the
  story read "gathered wood to build a house".
- Consequence: `Scout` and `SeekFood` are gone; exploring for a tree or a bush
  falls out of the planner. `serves` is optional for methods only done on the way
  to others (they need `gives`).

### Emotions and scales
- New mind role `emotion`: a level with `start`, `rate`, `urgentAt` like a need,
  read as `emotions.X`, changed with `emotions.X` effects. Fear (core), Anger
  (hostility) and Dread (psychopathy) moved from needs to emotions.
- **`scales`** on traits, needs and emotions: multipliers keyed `goal.X`,
  `action.X`, `restraint`, `restraint.X`, `need.X`, `emotion.X`, `trait.X`,
  computed from `value` (the scaling type's raw value). All multipliers come from
  raw values in one pass, so there are no loops. `traits.*`, `needs.*` and
  `emotions.*` in expressions read the scaled values.
- **`restraint`** on a method (0..1): what holds people back. Scaled by
  `restraint` / `restraint.X`; at 1 the method is never planned.

### Know-how
- Edge `knowsHow` (person → method mind node) with `preference`, `learnedAt`,
  `how` (born / watched / taught), `from`. `knowhow.innate` is the chance to know a
  method from birth (default 1), `knowhow.watch` the chance to pick it up when
  seeing someone do it (on meeting them, or witnessing an event).
- Effects `prefer` (change a preference; `method: "action"` is the action that
  ended, or the event actor's action in `witness`; `preference` is readable in the
  amount; at 0 the method is forgotten), `teach` (pass on a method), `tell` (pass
  on claims: telling is adding a link, ADR-0015). Reactions `failed` (action ended
  early, with `reason`) and `learned` (with `method`).
- Core: success raises preference toward 1.5, failure lowers it a little but never
  below 0.6. Only others' reactions (a witnessed killing) can make someone drop a
  method.

### Events and people remembered
- Knowledge type `Report` (core) with edges `about` and `actor`: Molly makes one
  shared claim per event, with the actor only if someone saw. Witnesses and
  hearers link to it; `tell` spreads it and the listener gets `hears`.
  Expressions: `reports.Murder` (how many they know), `did.Murder` (whether they
  know the other did it, in person-relative scopes).
- `Person` is memorable: meeting someone forms a Sighting of where they were.
  People are not in the spatial index (they move); they are remembered on meeting.

### Determination
- A core trait `Determination` (uniform 0.1–0.9), read by Adam as
  `traits.Determination` (0.5 without it). The Person attribute is gone.

### Format 0.6
`facts`, `requires`, `gives`, `restraint`, `cost`, `knowhow`, role `emotion`,
`scales`, effects `emotions.*`/`prefer`/`teach`/`tell`, reactions
`failed`/`learned`, names `emotions`, `reports`, `did`, `reason`, `method`.
`extends` merges `scales` by key.

## Content changes
- `hostility`: `Attack` (kill a grudge target) with restraint 0.97; Anger and Fear
  scale restraint down; it serves Vent only when anger and fear are both high
  (fuzzy). The `Murder` event moved here. Witnesses push the killer away from the
  method they used.
- `psychopathy`: the trait scales restraint, fear and dread down.
- `shelter`: Build is known from birth by 70% (watchable), Gather by 80%.
- New default pack `talk`: need `Isolation`, goal `Company`, method `Chat` (tell
  and teach both ways). Named to avoid clashing with the blind-test friendship pack.

## Consequences
- Seed 8: two people who couldn't build were taught by others and all six houses
  got built; without `talk`, some people never get a home (on purpose).
- Performance stayed about the same (12 days with six packs ≈ 1.7 s) after caching
  know-how per log length.
- Interactions as declared pairs (ADR-0032 #4) are covered by methods: a method's
  steps already say what a person does to which kind of thing. A separate
  declaration is not built.
