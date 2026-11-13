# 0007 — Time model

- Status: accepted
- Date: 2026-11-14

## Context
The graph changes over time. Every rule needs a clock. History wants precise
timestamps. People are the main actors and must move, work and live
continuously, cheaply enough for a browser.

## Options
- **A — Random tick (like Minecraft).** Each step, give each node/rule a chance.
  Simple, but chunky time and wasted work when nothing happens.
- **B — Event queue (discrete-event simulation, Gillespie-style).** Sample *when*
  each change happens, run the earliest, re-sample what it affected.
  Exact timestamps, quiet stretches skipped, "what's next" always known.

Statistically the two converge (per-tick chance p ≈ exponential waiting time),
so rules are written as **rates** either way.

## Decision
Event queue, plus two techniques that keep people and entropy cheap:

- **Lazy continuous values.** Anything that changes smoothly (hunger, shelter
  need, age, building wear, tree growth) is stored as `(value, rate, since)` and
  computed when read. Nothing is updated every frame.
- **Threshold events.** Because the rate is known, the moment a value crosses a
  threshold can be computed and scheduled ("shelter need gets urgent at t=412").
- **Agents as events.** A person is woken by the queue: "arrive at the tree",
  "finish chopping", "night falls". Movement between events is interpolated for
  display only.

Conceptually it is still "a ticking universe with ticking people"; the queue
just skips ticks where nothing happens.

## Consequences
- Rates and thresholds become the vocabulary of every rule.
- Needs that depend on the situation (night raises fear) change a rate, which
  reschedules that person's threshold events. Dependency tracking is per person,
  not global.
- The display can run at any speed independent of simulation.

## Discussion
- 2026-11-14 — User raised both options: a Minecraft-style random tick, or a
  structure that decides in advance when the next thing happens, runs events in
  order and recomputes the newest event each iteration.
- 2026-11-14 — Construction is a process with a duration (ADR-0008), which favours B.
- 2026-11-14 — User: event queue makes sense, but the actors are now people;
  they need an optimised system that moves them and keeps them alive inside
  graph + space. "A ticking universe with ticking people." → lazy values,
  threshold events, agents woken by the queue.
