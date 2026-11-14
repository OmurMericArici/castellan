# Writing packs

Castellan is an engine; everything the world *is* and *does* comes from packs
(ADR-0027). A pack is **plain JSON**: types of things, what people need and
want, what their actions do step by step, how they react to events, how they
remember. Nothing in a pack runs as code; logic is written in Castellan's small
expression language, which Castellan parses and evaluates itself.

This page is the whole contract, written so a person *or an LLM* can write a
valid pack from it. Archie checks every pack before it loads and explains each
problem with its exact place, so a failed pack can be fixed from the error alone.

Format version: **0.4** (M5): actions are step programs; reactions; memory rules.

## Shape

```json
{
  "pack": "hunger",
  "version": "0.1.0",
  "description": "People get hungry and forage berries.",
  "requires": ["core"],
  "types": { },
  "edges": { },
  "reactions": [ ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `pack` | yes | id: lowercase letters, digits, dashes; starts with a letter |
| `version` | yes | `major.minor.patch` |
| `description` | no | one or two sentences |
| `requires` | no | ids of packs this one builds on (almost always `["core"]`) |
| `types` | no | type definitions, by name (PascalCase) |
| `edges` | no | edge type definitions, by name (camelCase) |
| `reactions` | no | rules that fire when something happens to a person |

Unknown keys are errors, with a "did you mean" hint. A type or edge name can be
defined by only one pack; packs can't change another pack's types (yet).

## What `core` gives you

Types: `Person` (attrs `name`, `age`, `determination`, `carrying`), `Tree`
(memorable, remembers `wood`), `Stone` (memorable), `Sighting` (knowledge),
needs `Fear`, `Fatigue`, goals `Survive` (tier 1), `Recover` (2), `Grow` (4),
actions `Explore`, `Wander`, `Rest`. Edges `knows`, `about`, `has`.

## The other default packs

Always loaded with `core`; you may `require` and use them.

| Pack | Gives |
|---|---|
| `shelter` | need `Shelter`, goal `Secure` (tier 2), actions `Scout`, `Gather` (wood into `Person.carrying`), `Deliver` (`carrying` → the site's `stock`), `Build`; entities `House` (build rule) and `Village` (recognised); edges `builds`, `livesIn`, `memberOf`. `home` and `plan.*` come from it. |
| `hunger` | leaf `Bush` (memorable, remembers `food`, spreads), need `Hunger`, goal `Eat` (tier 1), actions `Forage` (eat one `food` on the spot, Hunger −0.4) and `SeekFood` |
| `hostility` | need `Anger`, goal `Vent` (tier 3), action `Confront`, edge `grudge` (person → person), reactions on `found-empty` and `meets` |

Note: `Person.carrying` is shared. Shelter's `Deliver` gives whatever is carried to a building site, so a pack that also uses `carrying` for something else will mix with wood.

## Types

| Key | Meaning |
|---|---|
| `kind` | `entity` (exists in the world, has a place), `knowledge` (a shared claim), or `mind` (a shared piece of how people think) |
| `leaf` | entities: `true` means Noah *may* place it at the start; how many is set in Noah's configuration, not in the pack (`npm run check-pack -- … --place Bush=40`). Entropy can grow more with `spread`. Derived things (houses) are never leaves. |
| `memorable` | entities: people remember seeing it (they form a `Sighting`) and can `goto` it by memory |
| `remember` | memorable entities: attributes people notice and remember, readable later as `it.<attr>`. Memory can be out of date. |
| `memory` | knowledge types: how well people remember (see Memory) |
| `role` | mind types, required: `need`, `goal`, `action` or `trait` |
| `attrs` | attribute definitions (see Attributes) |
| `build`, `recognize`, `spread` | entity rules (see Entity rules) |
| `description` | free text |

## Needs, goals and actions

| Role | Keys | Meaning |
|---|---|---|
| `need` | `start`, `rate`, `urgentAt` | A level in [0, 1] per person. `start` is rolled once; `rate` is the change per day; above `urgentAt` (default 0.7) it is urgent and people re-think when they cross it. |
| `goal` | `tier`, `weight` | `tier` 1 survive, 2 secure, 3 belong, 4 grow. `weight` in [0, 1]: how much it matters now. An urgent tier-1 goal takes over, unless determination holds the person a little longer. |
| `action` | `steps`, `serves` | `steps`: what the action does (see Steps). `serves`: how much it helps each goal. |

People pick the action with the highest **sum over goals of `weight × serves`**,
and re-think when an action ends, a need crosses a line, or Molly signals dusk/dawn.

Number values (`start`, `rate`, `weight`, `serves.*`, step amounts) are a number
or an expression: `"needs.Hunger * 2"` (or `{ "expr": "…" }`).

### Names in expressions

| Name | Value |
|---|---|
| `needs.Fear` | the person's level of a need |
| `knows.Tree` | how many things of a memorable type they know |
| `night` | true from dusk (21:00) to dawn (06:00) |
| `doing` | name of their current action |
| `self.age`, `self.id` | the person's attributes and id |
| `plan.active`, `plan.missing`, `plan.ready`, `plan.workLeft` | their building project: whatever they are building under any `build` rule (one at a time) |
| `home` | true once they live in something they built |
| `target.<attr>`, `target.id` | inside steps: what the action is aimed at (its real state, they are there) |
| `it.<attr>` | in `where`: what the person **remembers** of a thing (only `remember`ed attributes); in reactions: the thing's **real** attributes |
| `other.<attr>`, `other.id` | in reactions to `meets`: the other person |
| `rel.<edge>` | in reactions to `meets`: true if the person has that edge to the other |
| `action` | in reactions to `finished`: the action that ended |

## Steps

An action is a list of steps, run in order. Steps that take time (walking,
working, staying) can be interrupted when the person re-thinks; the rest are
instant.

| Step | Example | Does |
|---|---|---|
| `goto` | `{ "goto": { "known": "Bush", "where": "it.food > 0" } }` | walk to the nearest **remembered** thing of a memorable type that matches `where` (read with `it.*`); it becomes the `target` |
| | `{ "goto": "home" }` / `"plan"` / `"target"` | to their home, their building site, or the current target |
| | `{ "goto": { "explore": true } }` | toward the unknown |
| | `{ "goto": { "wander": 6 } }` | a short stroll within that radius (around home if near) |
| | `{ "goto": { "linked": "grudge" } }` | to the nearest person they have that edge to |
| | `"optional": true` | if there is nowhere to go, skip instead of ending the action |
| `work` | `{ "work": 0.04 }` | stay busy for that many days; `"progress": "worked"` adds the time spent to that attribute of the target, even if interrupted |
| `take` | `{ "take": { "from": "food", "to": "carrying", "amount": 1 } }` | move up to `amount` from the target's attribute to the person's (`to` may be left out: used up at once). If the target has none, the person **finds it empty**: their memory is updated and the `found-empty` reaction fires. The engine records `lastTakenBy` on the target. |
| `give` | `{ "give": { "from": "carrying", "to": "stock", "amount": "self.carrying" } }` | move from the person's attribute to the target's |
| `effect` | `{ "effect": { "needs.Hunger": "-0.5" } }` | change things (see Effects) |
| `if` | `{ "if": "target.food > 0" }` | end the action here unless true |
| `finish` | `{ "finish": "plan" }` | complete their building project (shelter) |
| `stay` | `{ "stay": true }` | stay put until they re-think (resting) |

When the last step is done the action ends and the person chooses again.

What ends an action early: a `goto` with nowhere to go (unless `optional`), a
`take` that finds nothing, a failing `if`. The person then chooses again at once.
**Choosing can't see whether a `goto` will find a target**, so make `serves`
depend on something visible (`knows.Bush > 0`, a need, `self.<attr>`) or the
person may keep picking an action that ends immediately. The engine stops such
loops after three tries at the same moment by having the person wait.

Steps and effects may read and write attributes a type does not declare (the
engine stores them), but declare them anyway so others know they exist.


### Effects

Used by the `effect` step and by reactions. Keys:

| Key | Value | Does |
|---|---|---|
| `"needs.<Need>"` | number or expression | **adds** to the person's need (use a negative number to lower it) |
| `"self.<attr>"` | number or expression | sets the person's attribute |
| `"target.<attr>"` | number or expression | sets the target's attribute (in reactions: the thing involved) |
| `"link"` | `{ "edge": "grudge", "to": "other" }` | adds an edge from the person; `to` is `"target"`, `"other"`, or an expression giving a node id, e.g. `"it.lastTakenBy"` |
| `"unlink"` | same | removes it |

## Reactions

A reaction runs effects when something happens to a person.

```json
{ "on": "meets", "if": "rel.grudge", "do": { "needs.Anger": 0.3 } }
```

| `on` | When | Extra names |
|---|---|---|
| `sees` | they notice a memorable thing for the first time | `it` |
| `meets` | another person comes within sight | `other`, `rel` |
| `found-empty` | a `take` found nothing where they remembered something | `it` |
| `finished` | an action ended normally | `action` |
| `dusk`, `dawn` | Molly's day signals | |

All reactions for an event run in pack load order, and each sees the effects of
the ones before it (an edge added by the first is visible to `rel.*` in the
second). A `meets` happens when someone starts walking and will pass within
sight of another person; the same pair meets at most once every 0.5 days, so
people standing together don't meet over and over.

## Memory

On a knowledge type (`core` puts it on `Sighting`):

```json
"memory": { "recall": 0.85, "fade": -0.02, "reinforce": "confidence + (1 - confidence) * 0.6", "forgetBelow": 0.2 }
```

| Key | Meaning |
|---|---|
| `recall` | chance a new sighting is remembered at all |
| `fade` | confidence change per day (negative fades) |
| `reinforce` | new confidence when seen again (reads `confidence`) |
| `forgetBelow` | below this they forget it: the memory link is removed |

## Entity rules

**`build`** — something people build. Molly places a *concept* where a person's
need, remembered material and a good spot line up; actions do the rest
(`goto: "plan"`, `give`, `work` with `progress`, `finish: "plan"`).

| Key | Meaning |
|---|---|
| `meets` | the need it meets once built |
| `material`, `materialAttr`, `amount` | a memorable entity type, its number attribute holding the material, and how much is needed |
| `work` | days of work once all material is delivered |
| `planner`, `resident` | edges from the person to the project and to the finished thing |
| `when` | how much the person needs it, 0..1 |
| `spot` | how good a place is, 0..1; reads `field.<name>` there (fields: `height`, `water`, `fertility`; this is the only place fields can be read for now) |
| `near` | never closer than `min` to another of the same type; best within `prefer` |
| `wear` | condition lost per day once built |

The engine keeps progress in `state` (`planned`/`built`), `stock`, `worked`,
`condition`; declare the first three in `attrs`.

**`recognize`** — a group Molly notices (a village): `members`, `radius`, `min`,
`full`, `formAt`, `memberEdge`.

**`spread`** — Entropy grows more of a leaf: `every` (days), `count`, `radius`,
optional `field` (only where it is above 0.3). New ones always land on walkable
ground, so `"field": "water"` means the shore.

## Attributes

| Key | Meaning |
|---|---|
| `type` | `number`, `string` or `boolean` |
| `min`, `max` | numbers only; values outside are clamped |
| `default` | a literal, or `{ "expr": "…" }` evaluated once at creation (`pick("Ayla", "Bora")` for text) |
| `description` | free text |

## Edges

| Key | Meaning |
|---|---|
| `from`, `to` | node kind at each end: `entity`, `knowledge`, `mind` or `any` |
| `fromData`, `toData` | attribute definitions for each end's own data |
| `description` | free text |

## Expression language

| | |
|---|---|
| Values | `3`, `0.5`, `"oak"`, `true`, `false`, `null` |
| Arithmetic | `+ - * / %`, unary `-` (numbers only; division by zero is an error) |
| Comparison | `== !=` (any values), `< <= > >=` (numbers) |
| Logic | `and`, `or`, `not` |
| Functions | `min`, `max`, `clamp(x, lo, hi)`, `lerp(a, b, t)`, `abs`, `floor`, `ceil`, `round`, `sqrt`, `if(cond, a, b)` |
| Random | `rand()`, `rand_range(a, b)`, `rand_int(a, b)`, `pick(a, b, …)`: only in attribute defaults and need `start` |

Limits: 500 characters, nesting depth 48, 10 000 steps.

## Checklist for a new pack

1. `requires: ["core"]`.
2. Things in the world: entity types; `leaf` if Noah may place them; `memorable` + `remember` if people should find them by memory.
3. A need (how it rises and falls), a goal that weighs it, actions whose `steps` do something about it and whose `serves` say when.
4. Reactions for what should happen on its own (anger on meeting someone, a grudge when a tree is found empty).
5. Load it; fix whatever Archie reports, using the paths in its messages.

`src/packs/core.json` and `src/packs/shelter.json` are the reference examples.
