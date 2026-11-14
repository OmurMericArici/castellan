# 0036 — A village is its members, not a radius

- Status: accepted (direction); the mechanism below is proposed
- Date: 2026-11-14
- Supersedes the village part of [0025](0025-shelter-m4.md)

## Context
Since M4 Molly recognises villages by distance: a finished house joins a village
if it is within `radius` (12 cells in `shelter`) of any member, and enough loose
houses within that radius of each other form a new one (ADR-0025). The user
pointed out that this is the wrong idea of a village.

## Options
- A — Keep the radius. Simple and cheap; but two strangers' houses that happen to
  be close are a village, and the house of someone who belongs, built a little
  further out, is not.
- B — Membership by ties. The village is an entity; things belong to it through
  edges; belonging comes from how its people are tied to each other and to things.
- C — People decide: each person holds a claim about which village they are from.
  Closest to real life, but needs the `claim` effect (ADR-0034) first.

## Decision
**A village is not something with a radius. There is the village, and there are
the things that belong to it.**

- A village is an entity with members (`memberOf`): houses, people, and later
  wells, fields, paths.
- It has no radius and no border. Where it is and how far it reaches are derived
  from its members (ADR-0010), never stored and never used to decide membership.
- Distance may matter only through what it causes: people who live near each
  other meet more.

### Mechanism (proposed, option B)
- `recognize` loses `radius` and gains **ties**: which relations in the graph
  connect candidate members. For `shelter`: residents who know each other.
- A group of tied members large enough (`min`, `full`, `formAt` stay) is
  recognised and named.
- A new thing joins the village its ties point to: a house joins the village of
  the people its resident is tied to; a person belongs where their home does.
- Option C can be added on top later: people holding "I am from Akpınar" as knowledge.

## Consequences
- Village recognition reads the graph instead of positions, which fits "the graph
  says what exists" (ADR-0005).
- `heard: "village"` on events already goes through `memberOf` and keeps working.
- Villages will form later than today (people must be tied first) and their shape
  on the map can be loose. The render needs a way to show a village without a circle.
- Merging, splitting and leaving (parking lot) become questions about ties.
- Not built yet. The current radius rule stays in the code until this is scheduled.
- Same smell elsewhere: Molly's `MATERIAL_RADIUS = 15` is a fixed distance in
  engine code. The `near` rule on `build` is different: it is about where to
  build, not about what belongs.

## Open questions
- Which ties count in the default pack: knowing each other, having talked,
  kinship, sharing a resource?
- Can a thing belong to two villages? (MODEL.md open question 2.)
- Do people join a village, or only houses with people following?

## Discussion
- 2026-11-14 — User: Molly determines villages with a certain range; it shouldn't
  be like that. A village is not a thing that has a radius; there is the village,
  and there are things that belong to the village.
