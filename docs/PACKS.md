# Writing packs

Castellan is an engine; everything the world *is* and *does* comes from packs
(ADR-0027). A pack is **plain JSON**: types of things, what people need and
want, what their actions do step by step, how they react to events, how they
remember. Nothing in a pack runs as code; logic is written in Castellan's small
expression language, which Castellan parses and evaluates itself.

This page is the whole contract, written so a person *or an LLM* can write a
valid pack from it. Archie checks every pack before it loads and explains each
problem with its exact place, so a failed pack can be fixed from the error alone.

Format version: **0.6**: adds planning over facts (`facts`, `requires`, `gives`), emotions, `scales`, `restraint`, know-how (`knowhow`, `prefer`, `teach`), telling (`tell`), remembered events (`reports`, `did`), reactions `failed` and `learned`. (0.5 added `extends`, `place`, `events`, traits, death, bonds, field targets, regrowing attributes.)

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
| `extends` | no | changes to types defined by packs loaded earlier (see Extending) |
| `place` | no | how many of a leaf Noah places at the start, e.g. `{ "Bush": { "count": 70, "prefer": "fertility", "avoid": { "water": 0.05 } } }` |
| `events` | no | named world events this pack can raise (see Events) |
| `facts` | no | named facts about what a person believes, for planning (see Planning) |

Unknown keys are errors, with a "did you mean" hint. A type or edge name can be
defined by only one pack; to change someone else's type, use `extends`.

### Order, and turning packs on and off

Packs load in the order you give (in the demo: the pack list at the bottom of the
page; `?packs=core,shelter,…` in the URL), but always after the packs they
`require`. A pack whose requirement is turned off is an error. When several packs
change the same thing with `extends`, **the one loaded later wins**.

### Extending

```json
"extends": {
  "Person": { "attrs": { "stash": { "type": "number", "default": 0 } } },
  "Survive": { "weight": "max(needs.Fear, needs.Dread)" },
  "Forage": { "serves": { "Eat": "if(needs.Hunger > 0.5, 1, 0)" } }
}
```

`attrs`, `serves` and `scales` are merged key by key; any other key (`weight`, `rate`,
`steps`, `distribution`, …) is replaced. The kind of a type can't change. Errors
in an extension are reported against the extending pack.

## What `core` gives you

Types: `Person` (memorable: remembered where last met; attrs `name`, `age`,
`carrying`), `Tree` (memorable, remembers `wood`), `Stone` (memorable),
knowledge `Sighting` and `Report` (an event), trait `Determination`, emotion
`Fear`, need `Fatigue`, goals `Survive` (tier 1), `Recover` (2), `Grow` (4),
methods `Explore` (gives `known.*`), `Wander`, `Rest`. Edges `knows`, `about`,
`has`, `knowsHow`, `actor`. Reactions: a method that finished is preferred a
little more, one that failed a little less.

## The other default packs

Always loaded with `core`; you may `require` and use them.

| Pack | Gives |
|---|---|
| `shelter` | need `Shelter`, goal `Secure` (tier 2), facts `hasLoad`, `siteReady`, methods `Gather` (gives `hasLoad`), `Deliver` (needs `hasLoad`, gives `siteReady`), `Build` (needs `siteReady`, serves Secure; 70% know it from birth); entities `House` (build rule) and `Village` (recognised); edges `builds`, `livesIn`, `memberOf`. `home` and `plan.*` come from it. |
| `hunger` | leaf `Bush` (memorable, remembers `food`, spreads), need `Hunger`, goal `Eat` (tier 1), method `Forage` (eat one `food` on the spot, Hunger −0.4; knowing no bush, the planner explores) |
| `hostility` | emotion `Anger` (wears restraint down), goal `Vent` (tier 3), methods `Confront` and `Attack` (kill; restraint 0.97), edge `grudge`, event `Murder`, reactions on `found-empty`, `meets`, `witness` |
| `psychopathy` | trait `Psychopathy` (rare; scales restraint, fear and dread down), need `Bloodlust`, emotion `Dread`, goal `Prey`, methods `Murder`, `Hide`, edge `hates`; extends `Survive` |
| `talk` | need `Isolation`, goal `Company` (tier 3), method `Chat` (tells 3 things and teaches a method, both ways) |

Note: `Person.carrying` is shared. Shelter's `Deliver` gives whatever is carried to a building site, so a pack that also uses `carrying` for something else will mix with wood.

## Types

| Key | Meaning |
|---|---|
| `kind` | `entity` (exists in the world, has a place), `knowledge` (a shared claim), or `mind` (a shared piece of how people think) |
| `leaf` | entities: `true` means Noah *may* place it at the start; how many is set in Noah's configuration, not in the pack (`npm run check-pack -- … --place Bush=40`). Entropy can grow more with `spread`. Derived things (houses) are never leaves. |
| `memorable` | entities: people remember seeing it (they form a `Sighting`) and can `goto` it by memory |
| `remember` | memorable entities: attributes people notice and remember, readable later as `it.<attr>`. Memory can be out of date. |
| `memory` | knowledge types: how well people remember (see Memory) |
| `role` | mind types, required: `need`, `emotion`, `goal`, `action` (a method) or `trait` |
| `distribution` | traits: how values are spread over people (see Traits) |
| `scales` | traits, needs, emotions: multipliers on other parts of the mind (see Scales) |
| `attrs` | attribute definitions (see Attributes) |
| `build`, `recognize`, `spread` | entity rules (see Entity rules) |
| `description` | free text |

## Needs, goals and actions

| Role | Keys | Meaning |
|---|---|---|
| `need` | `start`, `rate`, `urgentAt` | A level in [0, 1] per person. `start` is rolled once; `rate` is the change per day; above `urgentAt` (default 0.7) it is urgent and people re-think when they cross it. |
| `emotion` | `start`, `rate`, `urgentAt` | Works like a need (a level that moves), read as `emotions.X` and changed with `emotions.X` effects. Use it for fast states that colour behaviour (fear, anger) rather than drives that actions satisfy. |
| `goal` | `tier`, `weight` | `tier` 1 survive, 2 secure, 3 belong, 4 grow. `weight` in [0, 1]: how much it matters now. An urgent tier-1 goal takes over, unless determination holds the person a little longer. |
| `action` | `steps`, `serves`, `requires`, `gives`, `restraint`, `cost`, `knowhow` | A method. `steps`: what it does (see Steps). `serves`: how much it helps each goal. The rest: see Planning and Know-how. |

People score each method they know that serves a goal by the **sum over goals
of `weight × serves`**, check they can get there (Planning), and do the first
step. They re-think when an action ends, a need or emotion crosses a line, or
Molly signals dusk/dawn.

## Planning

Methods never name each other. Each one says what must be true before it
(`requires`) and what it makes true (`gives`); the engine chains them.

```json
"facts": { "hasLoad": "self.carrying >= 4", "siteReady": "plan.ready" },
"types": {
  "Build":   { "requires": ["siteReady"], "serves": { "Secure": 1 }, "steps": [ … ] },
  "Deliver": { "requires": ["hasLoad"],   "gives": ["siteReady"],   "steps": [ … ] },
  "Gather":  {                            "gives": ["hasLoad"],     "steps": [{ "goto": { "known": "Tree", "where": "it.wood > 0" } }, … ] }
}
```

- A **fact** is a condition on what the person believes, declared under `facts`
  (mind names), or one the engine reads: `known.<MemorableType>`, `linked.<edge>`,
  `home`, `plan`, `person` (someone nearby).
- Steps imply requirements: a `goto` that isn't `optional` and has one target
  needs that target (`goto known Tree where …` requires `known.Tree`, checked with
  the `where`). A `goto explore` gives `known.*`: any memorable thing.
- When a method's facts don't hold, each missing fact becomes a sub-problem: the
  cheapest method the person knows that `gives` it, planned the same way, with no
  depth limit. Above: Build → no `siteReady` → Deliver → no `hasLoad` → Gather →
  knows no tree → Explore. A method with no way to get there is not a choice.
- A method with no `serves` is only ever done on the way to another; it needs `gives`.
- `cost` (default 1) makes a way more or less attractive among alternatives.
- `restraint` (0..1, mind names) holds people back: the score is multiplied by
  `1 − restraint`, and at 1 the method is never planned. Emotions and traits can
  scale it (see Scales).
- The history records what each step was for (`for`), so stories read "gathered
  wood to build a house".

## Scales

Traits, needs and emotions can raise or damp other parts of the mind:

```json
"Anger": { "kind": "mind", "role": "emotion", "rate": -0.4,
  "scales": { "restraint": "1 - value * 0.4", "goal.Company": "1 - value * 0.5" } }
```

Keys: `goal.<Goal>` (its weight), `action.<Method>` (its score), `restraint`
(every method's restraint), `restraint.<Method>`, `need.<Need>`,
`emotion.<Emotion>`, `trait.<Trait>`. The expression reads `value`, the scaling
type's own (unscaled) value, and gives a multiplier. All multipliers are worked
out from unscaled values, then `traits.*`, `needs.*` and `emotions.*` read the
scaled ones.

## Know-how

Methods are know-how: people only plan with methods they know.

```json
"Build": { "knowhow": { "innate": 0.7, "watch": 0.5 } }
```

- `innate`: the chance to know it from birth (default 1; may read `self`, `traits`).
- `watch`: the chance to learn it on seeing someone do it (when they meet, or
  when witnessing an event).
- Effect `teach` passes a method on; effect `prefer` changes how much someone
  prefers it (preference multiplies the score; at 0 the method is forgotten).

Number values (`start`, `rate`, `weight`, `serves.*`, step amounts) are a number
or an expression: `"needs.Hunger * 2"` (or `{ "expr": "…" }`).

### Names in expressions

| Name | Value |
|---|---|
| `needs.Hunger` | the person's level of a need |
| `emotions.Fear` | the person's level of an emotion |
| `reports.Murder` | how many events of that kind they know of |
| `knows.Tree` | how many things of a memorable type they know |
| `night` | true from dusk (21:00) to dawn (06:00) |
| `doing` | name of their current action |
| `self.age`, `self.id` | the person's attributes and id |
| `traits.Psychopathy` | the person's value of a trait (drawn once; scales can raise or damp it) |
| `links.grudge` | how many edges of that type the person has to living others |
| `field.water` | a field's value where the person stands |
| `plan.active`, `plan.missing`, `plan.ready`, `plan.workLeft` | their building project: whatever they are building under any `build` rule (one at a time) |
| `home` | true once they live in something they built |
| `target.<attr>`, `target.id` | inside steps: what the action is aimed at (its real state, they are there) |
| `it.<attr>` | in `where`: what the person **remembers** of a thing (only `remember`ed attributes); in reactions: the thing's **real** attributes |
| `other.<attr>`, `other.id` | in reactions: the other person (`meets`; the actor of a `witness`/`hears` event) |
| `rel.<edge>` | true if the person has that edge to the other person (reactions; `person` targets) |
| `bond.<edge>.<field>` | the person's own data on that edge to the other person or target (0 if none) |
| `did.Murder` | true if the person knows the other did that (reactions; `person` targets) |
| `action` | in reactions to `finished`/`failed`: the action that ended; in `witness`: what the actor was doing |
| `reason` | in `failed`: why it ended (`nothing to go to`, `found it empty`, …) |
| `method` | in `learned`: the method just learned |
| `preference` | in a `prefer` amount: the current preference for that method |
| `event.name`, `event.known` | in `witness`/`hears`: which event, and whether the culprit is known |

Random functions (`rand()`, `rand_range`, `rand_int`, `pick`) also work in steps,
effects and reactions (seeded, so worlds stay reproducible), not in `serves`,
`weight` or `rate`.

## Traits

A trait is a fixed personal value, drawn once per person by Adam from a
distribution the pack gives:

```json
"Psychopathy": { "kind": "mind", "role": "trait",
  "distribution": { "histogram": [[0, 0.1, 88], [0.1, 0.5, 9], [0.75, 1, 3]] } }
```

- `histogram`: bins `[from, to, weight]`; a bin is picked by weight, then a value uniformly inside it.
- or a generating function: `"distribution": "if(rand() < 0.03, rand_range(0.75, 1), rand_range(0, 0.1))"`.

Read it as `traits.Psychopathy` in any expression (a need's `rate`, a goal's
`weight`, …). Another pack can change the distribution with `extends`.

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
| | `{ "goto": { "person": "nearest", "within": 25, "where": "not rel.friend" } }` | to the nearest living person in range matching `where` (`it` = them, `rel`, `bond`) |
| | `{ "goto": { "field": "water", "above": 0.5 } }` | to the nearest walkable spot at the edge of where a field is high (a lake shore) |
| | `{ "goto": [ {…}, {…} ] }` | alternatives: the first one with somewhere to go is used |
| | `"optional": true` | if there is nowhere to go, skip instead of ending the action |

Walking to a person who moves: on arrival, if they are no longer there, the
person follows again (up to three times), then gives up.
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
**An action whose first step is a `goto` with nowhere to go is not a choice at
all**, so a friendless person won't keep picking "visit a friend". If actions still
end instantly over and over, the engine pauses the person briefly.

Steps and effects may read and write attributes a type does not declare (the
engine stores them), but declare them anyway so others know they exist.


### Effects

Used by the `effect` step and by reactions. Keys:

| Key | Value | Does |
|---|---|---|
| `"needs.<Need>"`, `"emotions.<Emotion>"` | number or expression | **adds** to the person's need or emotion (use a negative number to lower it) |
| `"other.needs.<Need>"`, `"target.emotions.<Emotion>"`, … | number or expression | adds to the other person's / the target person's need or emotion |
| `"self.<attr>"`, `"target.<attr>"`, `"other.<attr>"` | number or expression | sets that attribute (in reactions `target` is the thing involved) |
| `"link"` | `{ "edge": "friend", "to": "other", "mutual": true, "add": { "warmth": 1 } }` | adds an edge from the person if missing; `to` is `"target"`, `"other"`, or an id expression (`"it.lastTakenBy"`); `mutual` also adds it back from them; `add` / `set` change the edge's data on each side |
| `"unlink"` | `{ "edge": "friend", "to": "other", "mutual": true }` | removes it |
| `"kill"` | `"target"`, `"other"` or an id expression | the person dies: they stay in the world's history but stop acting |
| `"event"` | `{ "name": "Murder", "about": "target" }` | raises a world event declared under `events`; Molly decides who notices |
| `"prefer"` | `{ "method": "action", "add": -0.2, "on": "other" }` | changes a preference (`method`: a name, or `"action"`); at 0 the method is forgotten |
| `"teach"` | `{ "to": "target", "method": "any", "mutual": true }` | passes on a method the person knows and the other doesn't |
| `"tell"` | `{ "to": "target", "what": "any", "count": 3, "mutual": true }` | passes on what they know: places of a memorable type, events of a name, or `"any"`; newest first. A told event reaches the listener as `hears`. |

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
| `failed` | an action ended early (nowhere to go, found empty, a failing `if`, lost the person) | `action`, `reason` |
| `learned` | they learned a method (watching, being taught) | `method`, `other` (who from) |
| `dusk`, `dawn` | Molly's day signals | |
| `witness` | they saw an event happen (within its `seenWithin`) | `it` (who/what it was about), `other` (who did it), `event` |
| `hears` | they heard of an event (per its `heard` rule) | `it`, `event`; `other` only if someone saw who did it (`event.known`) |

All reactions for an event run in pack load order, and each sees the effects of
the ones before it (an edge added by the first is visible to `rel.*` in the
second). A `meets` happens when someone starts walking and will pass within
sight of another person; the same pair meets at most once every 0.5 days, so
people standing together don't meet over and over.

## Events

```json
"events": { "Murder": { "seenWithin": 7, "heard": "everyone" } }
```

An `event` effect raises it. Molly records it in the history (with who saw it)
and makes it a shared `Report` claim (with who did it, if anyone saw). People
within `seenWithin` cells get `witness` and know the claim; everyone else gets
`hears` if `heard` is `"everyone"`, or only people of the same village if
`"village"` (`"nobody"`: no one else). Witnesses may also pick up the method by
watching. `tell` spreads Reports further.

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
| `regrow` | entity number attributes with a `max`: amount regained per day (Entropy), e.g. berries |
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
| Random | `rand()`, `rand_range(a, b)`, `rand_int(a, b)`, `pick(a, b, …)`: in attribute defaults, need `start`, trait `distribution`, steps, effects and reactions |

Limits: 500 characters, nesting depth 48, 10 000 steps.

## Checklist for a new pack

1. `requires: ["core"]`.
2. Things in the world: entity types; `leaf` if Noah may place them; `memorable` + `remember` if people should find them by memory.
3. A need (how it rises and falls), a goal that weighs it, methods whose `steps` do something about it and whose `serves` say when. If a method needs something first, write it as a fact in `requires` and let another method `give` it; don't write "when they don't know X, explore" by hand.
4. Reactions for what should happen on its own (anger on meeting someone, a grudge when a tree is found empty).
5. Load it; fix whatever Archie reports, using the paths in its messages.

`src/packs/*.json` are the reference examples; `examples/blind/` has packs written by outside authors from this page alone. Try a pack with `npm run check-pack -- my-pack.json` (`--help` for options).
