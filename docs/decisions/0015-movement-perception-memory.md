# 0015 — Movement, perception and knowledge

- Status: accepted
- Date: 2026-11-14

## Context
People must feel simulated in detail: they wander, explore, and can only use a
tree they have actually **seen**. But time is an event queue that skips empty
ticks (ADR-0007). How do walking and exploring fit into that, and is
exploration its own node?

## Proposal

### 1. Knowledge nodes (replaces "beliefs")
The graph + space is the single truth. What people know about it is held in
**knowledge nodes**, which are shared:

- A knowledge node is one **claim** with a type and content, e.g.
  `Sighting { subject: tree#812, where: (40, 17), asOf: y2d40 }`.
- **Many people link to the same node.** If thirty people know the oak by the
  stream, there is one record and thirty `knows` edges. Each edge carries that
  person's side: `{ learnedAt, from (own eyes / person#), confidence }`.
- **Claims are immutable.** Seeing the same thing again just links to (or
  refreshes) the existing claim. Seeing something different (the oak is now a
  stump) creates a new claim. So two people can know different, conflicting
  versions, and a stale claim sends someone to a tree that is gone.
- **Sharing is linking.** When one person tells another, the listener gets a
  `knows` edge to the same claim with `from: teller`. A merchant who learns
  about another town's goods can pass it on, and over time a trade route can
  emerge from who knows what.
- Types will grow: sighting, place, person, know-how (how to build a house), rumour…
  Only sighting is needed for the first slice.

### 2. Walking as one event per leg
A walk is not simulated step by step:
1. Person picks a destination, pathfinding runs on a **cost grid derived from the
   fields** (slope, water, later roads).
2. The scheduler books an **arrival event**. Position in between is interpolated
   for display.
3. If something changes the plan (night falls, a threat appears), the arrival is
   cancelled and the person re-plans from the interpolated position.

### 3. Seeing along the way, computed ahead
The path and the sight radius are known when the walk starts, so the spatial
index can find every node that will come into view along the corridor, and book
**sight events** at the moment each one enters view. "Year 2, day 40: Ayla saw an
oak by the stream" gets an exact timestamp without ticking every step.
Sight radius depends on conditions (night shortens it).

### 4. Exploring is a behaviour, not a node
When a need can't be met from what the person knows (no known tree), the utility of **explore**
rises. Exploring = choose a leg toward the unknown, walk it (seeing along the
way), repeat until something useful is known.
- Leg choice: towards unexplored area, biased by fields (trees are likelier near
  water and fertile land), with a heading that persists between legs (Lévy-walk
  style, the way real foragers search: many short legs, occasional long ones).
- The **outcome** of exploring is what lives in the graph: new knowledge. The
  activity itself is the person's current plan and is recorded as events, so
  the story still reads "set out to find wood".
- If exploring later needs to be shared (a group expedition), it gets promoted
  to a node then.

### 5. Detail where someone is looking (later)
A person the viewer follows can be woken more often (finer decisions, small
idle actions) without changing the rules. Simulation level of detail, not
different behaviour.

## Consequences
- Memory grows with the number of distinct claims plus links, not with people × facts.
  Forgetting = dropping a link; a claim nobody links to can be folded (ADR-0014).
- The fuzzy triple for building reads the person's **knowledge** about materials,
  not the truth.
- Pathfinding and a spatial index become required engines for the first slice.

## Discussion
- 2026-11-14 — User: the aim is to simulate people, but we are also adding tick
  skipping. How do people wander? How do we send someone to explore; should it
  be a separate abstract node? To build a house a person must have walked around
  in nature and seen the tree. It should feel like a detailed simulation.
- 2026-11-14 — User: this is the knowledge system I had postponed; call it
  knowledge, not truth/belief. Knowledge nodes have types and connect to many
  people, so the existence of one tree is a single record held by dozens. That
  also allows sharing: someone trading in another city teaches others, and over
  time a trade route can form.
- 2026-11-14 — User: "these are good." Accepted.
