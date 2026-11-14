# 0026 — Behaviour in packs: steps, reactions, memory rules

- Status: accepted
- Date: 2026-11-14

## Context
The user asked whether three parked mechanics (hunger and food, anger and
hostility, imperfect memory) could be added as packs today, since everything is
node based. The answer is no, and the user's principle is: **if we can't add
them as packs, nobody else can either**, so behaviour must be definable in packs.

What packs can do now (format v0.3): types, needs with rates, goals, which goals
an action serves, build/recognise/spread rules. What they can't:

| Mechanic | What's missing |
|---|---|
| Hunger and food | An action that walks to a known bush, takes food and **lowers a need**. Verbs are engine code; nothing lets an action change a need or move a value. |
| Anger and hostility | A rule that **creates a relation** when something happens (a grudge when someone takes "your" tree), people **noticing each other**, and actions aimed at a person (avoid, confront). |
| Imperfect memory | Recall chance, fading and reinforcement are hard-coded in Adam (confidence is always 1, refresh after 5 days). |

## Proposal

### 1. Actions are step programs built from engine primitives
The engine stops knowing verbs and knows only **steps**. A pack action lists them:

| Step | Does |
|---|---|
| `goto` | walk to a target: `{ "known": "Bush", "where": "self.food > 0", "pick": "nearest" }`, `"home"`, `"plan"`, `{ "explore": true }`, `{ "wander": 6 }`, `{ "person": "grudge" }` |
| `work` | stay for a duration (expression, days) |
| `take` / `give` | move an amount from the target's attribute to the person's, or back (`{ "attr": "food", "into": "food", "amount": "1" }`) |
| `effect` | change things: a need (`"needs.Hunger": "-0.6"`), an attribute, add or remove an edge (`{ "link": "grudge", "to": "target" }`) |
| `if` | skip the rest of the program unless a condition holds (`target.food > 0`); a failed `goto` or `if` is a story beat ("found the bush empty") |

Today's verbs become ordinary pack actions: `Gather` is *goto known Tree with
wood → work 0.04 → take wood up to 4 → goto plan → give stock*. The engine keeps
the hard parts as primitives: pathfinding, sight along the way, timing, interruption.

### 2. Reactions: rules that fire on events
```json
"reactions": [
  { "on": "found-empty", "if": "target.lastTakenBy != self.id", "do": { "link": "grudge", "to": "target.lastTakenBy" } },
  { "on": "meets", "if": "linked(\"grudge\", other)", "do": { "needs.Anger": "+0.3" } }
]
```
Events a reaction can listen to: `sees`, `meets` (two people come within sight of
each other), `arrives`, `found-empty`, `finished` (an action), `learns`, Molly's
signals (`dusk`, `dawn`). Effects use the same vocabulary as the `effect` step.
`meets` is new engine work: the closest approach of two walking legs can be
computed ahead, like sight events.

### 3. Memory rules on knowledge types
```json
"Sighting": {
  "kind": "knowledge",
  "memory": { "recall": 0.7, "fade": "-0.05", "reinforce": "confidence + (1 - confidence) * 0.5", "forgetBelow": 0.15 }
}
```
- `recall`: chance a sighting is remembered at all.
- `fade`: confidence change per day; confidence becomes a lazy value on the `knows` edge.
- `reinforce`: new confidence when seen or told again.
- `forgetBelow`: the `knows` link is dropped when confidence falls under it (a
  threshold event, no ticking). This is Entropy's job (ADR-0021).

### 4. Proof: write the new packs only from PACKS.md
The milestone is done when `hunger`, `memory` and (if `meets` is in) `hostility`
packs work **without any engine change beyond the primitives**, written only from
the guide, the way a user or an LLM would.

## Consequences
- The engine shrinks to primitives; content and behaviour live in packs. This is
  the core claim of ADR-0018 made true.
- Bigger language surface for Archie to check (targets, step order, effect paths).
- Scope: this is a milestone of its own, before v0.1 polish (open question below).

## Settled
1. Approach as above.
2. It is M5; form and story polish moves to M6, which ships v0.1.
3. `meets` is included, so the hostility pack is part of the proof.

## Discussion
- 2026-11-14 — User: can these new mechanics be added as packs now that everything
  is node based? If we can't, people can't add them either, so include behaviour
  definition.
- 2026-11-14 — User stated the engine/default-pack principle (ADR-0027), which this record
  applies: Adam's hard-coded verbs and memory are debt against it. Scope questions still open.
- 2026-11-14 — User: yes to both (M5 before v0.1, `meets` included). Accepted.
