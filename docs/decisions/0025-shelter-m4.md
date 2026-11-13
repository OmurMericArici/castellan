# 0025 — Shelter in M4: concepts, gathering, building, villages, Entropy

- Status: accepted (technical; designed by Claude during M4, open to change)
- Date: 2026-11-14

## Context
M4 is where the first derived things appear: houses and villages. The model
says nothing derived can be placed (ADR-0006), Molly defines and places
concepts (ADR-0012), people do the work (ADR-0008), Entropy changes the world
on its own (ADR-0021). This records how that was built.

## Decision

### Content split
- `core` keeps people, trees, stones, sightings, and the basic mind (Fear,
  Fatigue; Survive, Recover, Grow; Explore, Wander, Rest).
- `shelter` is a separate pack: the Shelter need, the Secure goal, actions
  Scout / Gather / Build, the `House` and `Village` types, and the `builds`,
  `livesIn`, `memberOf` edges. The engine knows no houses.

### Pack format v0.3
- **`build`** on a derived entity: which need it meets, which memorable entity
  holds the material (and which attribute), how much, how many days of work,
  the planner and resident edges, a `when` expression (need, mind scope), a
  `spot` expression (reads `field.*`), spacing (`near.min`, `near.prefer`) and
  `wear` per day.
- **`recognize`** on a group entity: member type, radius, the `min`..`full`
  ramp, `formAt`, and the member edge.
- **`spread`** on a leaf: every N days, K new ones within a radius where a field
  is high enough.
- New mind names: `plan.active`, `plan.missing` (material not yet delivered),
  `plan.ready`, `carrying`, `home`. New verbs: `gather`, `build`.

### Molly places concepts (the fuzzy triple, ADR-0008)
- Every dawn, for each person without a home or plan, Molly samples 24 spots
  within 12 cells and scores μ = need × spot × material × company:
  - need: the build rule's `when`;
  - spot: the `spot` expression on the fields there;
  - material: wood in trees **the person knows of** within 15 cells, divided by
    the amount needed;
  - company: 1 within `near.prefer` of another house, else at least 0.6;
    spots closer than `near.min` are not allowed.
- If the best μ ≥ 0.25, she places the concept with chance μ (a `House` in state
  `planned`) and links the person with `builds`.

### People do the work
- `gather`: walk to the nearest tree they know and haven't found empty, cut
  (0.04 days), carry up to 4, walk to the site, deliver. A tree that turns out
  empty is stale knowledge: they remember it as exhausted and go elsewhere.
- `build`: once all material is there, walk to the site and work; work done is
  kept if interrupted (night). Finishing sets `state: built`, links the person
  with `livesIn`, and the Shelter need starts falling.
- At night, people with a home walk back to it to rest.

### Villages
- When a house is finished, Molly adds it to a village if it is within the
  radius of any member; otherwise, if enough loose built houses are near
  (μ = ramp(min..full) ≥ formAt), she creates a village at their centre, gives it a
  name from the pack (no repeats), and links the members.

### Entropy
- Spreads trees every 2 days (4 new ones near existing trees on fertile land).
- Finished houses get a `condition` lazy value that falls by `wear` per day.

### Determinism
- Results do not depend on how time is sliced: a test runs the world in
  irregular slices (like browser frames) and gets the same digest as one run.

## Consequences
- In 4 test seeds over 10 days, 4–6 houses are built and 1–2 villages named;
  some determined people finish their house late at night.
- Wood is conserved: a test checks that cut wood equals delivered + carried.
- Villages never merge or dissolve yet; houses never collapse (condition is
  visual only). Both are later work.

## Discussion
- 2026-11-14 — User said to go ahead with M4 ("Et babuş").
- 2026-11-14 — Found while testing: `plan.missing` first subtracted carried wood,
  so the last load never had a reason to be delivered; houses stalled at 8/10.
  Now `missing` means "not yet delivered". Also: when no action helps an urgent
  goal, urgency no longer filters the choice (an M3 bug at dawn).
