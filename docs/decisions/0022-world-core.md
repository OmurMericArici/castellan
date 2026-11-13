# 0022 — World core: time unit and data structures

- Status: accepted (technical; chosen by Claude during M1, open to change)
- Date: 2026-11-14

## Context
M1 needs concrete choices for the core that the earlier records left open.

## Decision
- **Time unit: 1.0 = one day**, as a float. Lazy value rates are per day.
  Hours are fractions (night at 0.8). Years are 360 days for now.
- **Fields:** one `Float32Array` grid per field, values in [0, 1], bilinear
  sampling at continuous positions. Generated from seeded value noise (fBm) or
  derived from another field (`below`: water from height). Fields are generated
  in order, so a field can only read earlier ones.
- **Space is not stored in the log:** the `space.defined` event carries the spec,
  and applying it regenerates the fields from the world seed. The log stays small.
- **Graph:** nodes and edges in maps by integer id; each node keeps the set of
  edges touching it, so edges are stored once and read from both ends, each end
  with its own data.
- **Ids are allocated before the creating event** and carried in it, so replay
  reproduces the same ids.
- **Event queue:** binary heap ordered by (time, scheduling order); cancelling is
  lazy. Handlers are looked up by name, so packs and engines can register them later.
- **Events carry who caused them** (`by`: noah, molly, entropy, adam, archie),
  for the story view.
- **Determinism check:** `digest(world)` hashes seed + log; `replay(seed, log)`
  must give the same digest. Tested.
- **Placement:** Noah uses rejection sampling per leaf spec (`prefer` field as
  acceptance chance, `avoid` limits), one forked generator per spec.

## Consequences
- Anything time-based in packs is written in days.
- Changing the noise or placement algorithm changes every world for a given
  seed; acceptable until v0.1 ships, after that it needs a version in the Noah config.

## Discussion
- 2026-11-14 — The user left the time unit open (ADR-0007). Picked days because
  people's needs and construction read naturally in days.
