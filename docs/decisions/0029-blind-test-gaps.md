# 0029 — Blind pack test: results and the missing primitives

- Status: accepted (all nine built before v0.1)
- Date: 2026-11-15

## Context
To check ADR-0026's claim, three fresh agents with no knowledge of the engine or
this project wrote packs from `docs/PACKS.md` and `core.json` alone, using the new
`npm run check-pack` tool (Archie + a 10-day simulation). Themes (user's choice):
food storage, drinking water, friendship through joking. Packs and notes are in
`examples/blind/`.

## Results
| Pack | Archie | Works in simulation | Compromise |
|---|---|---|---|
| `friendship` | accepted first try | yes: seed 3 → 24 jokes, 12 friend links, 20 friend visits | friendship counted with a chain of edges (`joked` → `laughedWith` → `friend`) because edge data can't be read or written |
| `drinking-water` | accepted first try | yes with placed springs: 198 drinks in 10 days, thirst never stuck | can't drink from lakes: fields can't be targets or read outside `build.spot`; drinks from placed `Spring`s |
| `food-storage` | accepted first try | yes: 13 stashes, 19 meals from the stash, foraging −15–25% | stash kept in hands (`carrying`, shared with wood); a shared storage pit failed because choosing can't see whether a remembered pit has food |

All three were accepted on the first attempt: **the guide was enough to write
valid packs**. Every problem showed up only in simulation, which is why the
checker runs one.

## Gaps found (engine primitives to consider, ADR-0027)
Ordered by how many tests hit them and how general they are.

1. **Choosing can't see whether an action can start.** VisitFriend with no friend,
   EatStored with an empty pit: chosen again and again, ending at once. *Primitive:*
   an action whose first `goto` has nowhere to go is not a candidate. (Fixes two tests.)
2. **Relationship numbers.** Edge data exists but nothing reads or writes it.
   *Primitive:* `rel.<edge>.<field>` in expressions, an effect to add to edge data
   (`"link": { "edge": "friend", "to": "other", "add": { "warmth": 1 } }`).
3. **Fields as places.** `goto: { "field": "water" }` (nearest walkable cell next to
   high water), `field.<name>` at the person's position in mind scope.
4. **Packs extending other packs' types** (`extends`): add attributes to `Person`,
   storage to `House`. Removes the shared-`carrying` collision.
5. **Attributes that regrow** (a lazy rate on an entity attribute, Entropy): springs
   refill, bushes regrow berries.
6. **Randomness in reactions and steps** (seeded per event): a joke can fall flat.
7. **Effects on the other person** (`other.needs.X`) and **mutual links**.
8. **Fallback steps** ("a stocked pit, else a bush").
9. **Counting links** in expressions (`links.friend`).

## Fixed right away (no design decision needed)
- Engine bug: Entropy's `spread` with `"field": "water"` could never succeed (new
  things had to be bone dry *and* wet). Now they land on walkable shore.
- Checker: "highest need levels" missed levels still rising at the end; `--help`.
- PACKS.md: lists the other default packs and their names; says how many leaves
  Noah places is configuration; when actions end early and the loop guard; reaction
  order and meeting frequency; `it` remembered vs real; which fields exist and where
  they can be read; that `carrying` is shared.

## Open
- Which of 1–9 to build, and whether before v0.1 (M6) or after.
- Dawn: Fear is still high at 06:00, yet people get up at once because resting no
  longer "helps Survive" by day. Correct by the rules, odd to read in the panel.

## Discussion
- 2026-11-15 — User asked for the blind test with sub-agents: food storage, drinking
  water if the engine allows it, joking friendship if it allows it; three packs in
  total either way.
- 2026-11-15 — User: solve all of them now (ADR-0030).
