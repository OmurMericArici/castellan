# 0030 — Traits with distributions, world events, death, pack order and overrides

- Status: accepted
- Date: 2026-11-15

## Context
After the blind test (ADR-0029) the user decided to build all nine missing
primitives now, and asked for more infrastructure, using a psychopathy trait as
the example of what a pack author must be able to do.

## Decision
1. **All ADR-0029 primitives now**, before v0.1.
2. **Traits with a population distribution.** A trait is a mind type whose value
   per person is drawn from a distribution the pack gives, either as a
   *generating function* (an expression with random functions) or a *histogram*
   (bins with weights). **Adam** assigns them. Traits feed needs, goals and actions
   (psychopathy → an urge to kill).
3. **World events.** Pack effects can raise a named event (murder). **Molly
   notices** it: people within sight are *witnesses*, others *hear* of it, per the
   event's declaration. Packs react (fear for everyone, hatred for the killer).
4. **Death** as an engine primitive: a person can die; they stay in the graph and
   the history, but stop acting.
5. **Packs can be enabled, disabled and ordered.** Order resolves conflicts:
   when several packs override the same thing (`extends`), the later one wins.
   Requirements still constrain order; disabling a required pack is an Archie error.
6. Then write the **psychopathy pack** with this infrastructure.

## Consequences
- Murder is the first mechanic that can end a person's story; the event log must
  make cause and witnesses readable.
- Pack order becomes part of a world's identity: same Noah config + seed + packs
  *in the same order* = same world.

## Discussion
- 2026-11-15 — User: solve all of them now. Also: I want to add a personality trait,
  e.g. psychopathy, as a need (the wish to kill). I must be able to set how it is
  distributed in society, via a generating function or histogram-like data. Adam
  should handle this. Then an event called murder: Molly notices it, people get
  fear, hatred toward the killer, and so on. We need infrastructure to configure
  all of this. Then write the pack containing this trait. Also packs should be
  activatable/deactivatable and orderable; that resolves conflicts when there are
  several overwrites.
