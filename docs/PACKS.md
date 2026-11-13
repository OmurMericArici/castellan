# Writing packs

A pack adds things to a Castellan world: types of entities, knowledge and mind,
edge types, and the rules of how people's minds work. Packs are **plain JSON**. Nothing in a pack
runs as code: values that need logic use Castellan's small expression language,
which Castellan parses and evaluates itself.

This page is the whole contract. It is written so a person *or an LLM* can write
a valid pack from it. Archie (the architect) checks every pack before it loads
and explains each problem with its exact place, so a failed pack can be fixed
from the error alone.

Format version: **0.3** (M4): adds `build`, `recognize` and `spread` rules for entities.

## Shape

```json
{
  "pack": "firearms",
  "version": "0.1.0",
  "description": "Gunpowder and muskets.",
  "requires": ["core"],
  "types": { "Musket": { "kind": "entity", "attrs": { "condition": { "type": "number", "min": 0, "max": 1, "default": 1 } } } },
  "edges": { "owns": { "from": "entity", "to": "entity" } }
}
```

| Key | Required | Meaning |
|---|---|---|
| `pack` | yes | id: lowercase letters, digits, dashes; starts with a letter (`firearms`) |
| `version` | yes | `major.minor.patch` (`0.1.0`) |
| `description` | no | one or two sentences |
| `requires` | no | ids of packs this one builds on; they load first |
| `types` | no | type definitions, by name |
| `edges` | no | edge type definitions, by name |

Unknown keys are errors (typos are caught, with a "did you mean" hint).

## Types

Type names are PascalCase (`Musket`, `Sighting`). A name can be defined by only one pack.

| Key | Meaning |
|---|---|
| `kind` | `entity` (exists in the world, has a place), `knowledge` (a shared claim or skill), or `mind` (a shared piece of how people think) |
| `leaf` | entities only. `true` means Noah may place it at the start (person, tree, stone). Derived things (house, village) are **not** leaves: they must emerge. |
| `memorable` | entities only. `true` means people remember seeing it (they form a shared `Sighting` claim). |
| `role` | mind types only, required: `need`, `goal`, `action` or `trait` |
| `attrs` | attribute definitions, by name |
| `description` | free text |

## Mind rules

Mind types carry the rules for how people think. Packs decide **why** people do
things; the engine (Adam) knows **how** to do a fixed set of verbs.

| Role | Keys | Meaning |
|---|---|---|
| `need` | `start`, `rate`, `urgentAt` | A level in [0, 1] per person. `start` is rolled once (can use `self` and random functions); `rate` is the change per day; above `urgentAt` (default 0.7) the need is urgent and people re-think when they cross it. |
| `goal` | `tier`, `weight` | `tier` 1 survive, 2 secure, 3 belong, 4 grow. `weight` in [0, 1] says how much the goal matters right now. An urgent tier-1 goal takes over from everything else (unless the person's determination holds them a little longer). |
| `action` | `do`, `serves` | `do` is the verb Adam carries out: `explore`, `wander`, `rest`, `gather`, `build`. `serves` maps goal names to how much the action helps each one. |

Each of `start`, `rate`, `weight` and the values in `serves` is a number or
`{ "expr": "…" }`. Inside them these names exist:

| Name | Value |
|---|---|
| `needs.Fear` | the person's current level of the need `Fear` (any need type) |
| `knows.Tree` | how many things of the memorable type `Tree` the person knows |
| `night` | true between dusk (21:00) and dawn (06:00) |
| `doing` | the name of the action the person is doing, e.g. `"Rest"` |
| `self.age` | the person's own attributes |
| `plan.active`, `plan.missing`, `plan.ready` | their building project: has one; material not yet delivered; all material there |
| `carrying` | material units in hand |
| `home` | true once they live in something they built |

People pick the action with the highest score: the sum over goals of
`weight × serves`. Example from `core`:

```json
"Fear":    { "kind": "mind", "role": "need", "start": 0, "rate": { "expr": "if(night, 6, -8)" }, "urgentAt": 0.6 },
"Survive": { "kind": "mind", "role": "goal", "tier": 1, "weight": { "expr": "needs.Fear" } },
"Rest":    { "kind": "mind", "role": "action", "do": "rest", "serves": { "Survive": { "expr": "if(night, 1, 0)" }, "Recover": 1 } }
```

## Entity rules

Derived things never get placed; these rules say how they come to exist.

**`build`** — something people build (a house). Molly places a *concept* where a
person's need, known material and a good spot line up; the person gathers the
material and does the work.

```json
"build": {
  "meets": "Shelter",           "material": "Tree", "materialAttr": "wood", "amount": 10,
  "work": 0.5,                  "planner": "builds", "resident": "livesIn",
  "when": { "expr": "needs.Shelter" },
  "spot": { "expr": "clamp(0.4 + field.fertility - field.water * 2, 0, 1)" },
  "near": { "min": 2.5, "prefer": 9 }, "wear": 0.004
}
```

| Key | Meaning |
|---|---|
| `meets` | the need it meets once built |
| `material`, `materialAttr`, `amount` | a memorable entity type, its number attribute holding the material, and how much is needed |
| `work` | days of work once all material is delivered |
| `planner`, `resident` | edges (entity → entity) from the person to the project and to the finished thing |
| `when` | how much the person needs it, 0..1 (mind names) |
| `spot` | how good a place is, 0..1; reads `field.<name>` at the candidate spot |
| `near` | never closer than `min` to another of the same type; best within `prefer` |
| `wear` | condition lost per day once built |

The engine keeps progress in the attributes `state` (`planned` / `built`),
`stock` (material delivered), `worked` (days done) and `condition`; declare the
first three in `attrs`.

**`recognize`** — a group Molly notices (a village): `members` (entity type),
`radius`, `min` and `full` (membership ramps from just possible to certain),
`formAt` (degree needed), `memberEdge`.

**`spread`** — Entropy grows more of a leaf: `every` (days), `count`, `radius`,
optional `field` (only where it is above 0.3).

## Attributes

Attribute names are camelCase (`wood`, `learnedAt`).

| Key | Meaning |
|---|---|
| `type` | `number`, `string` or `boolean` |
| `min`, `max` | numbers only; values outside are clamped |
| `default` | a literal of the right type, or `{ "expr": "…" }` evaluated once when the node is created (`pick("Ayla", "Bora")` for text) |
| `description` | free text |

Expression defaults are rolled with the node's own seeded generator, so the same
world seed always gives the same values. The rolled value is written into the
world's log, so replay never rolls again.

## Edges

Edge names are camelCase (`knows`, `livesIn`). An edge is stored once and read
from both ends; each end can carry its own data.

| Key | Meaning |
|---|---|
| `from`, `to` | the node kind at each end: `entity`, `knowledge`, `mind` or `any` |
| `fromData`, `toData` | attribute definitions for each end's own data |
| `description` | free text |

Example: `knows` goes from a person (entity) to a claim (knowledge); the person's
end holds `learnedAt` and `confidence`.

## Expression language

Small and pure: an expression reads values and returns one. It cannot change
anything, loop, or call anything outside the list below.

| | |
|---|---|
| Values | numbers `3`, `0.5`; text `"oak"`; `true`, `false`, `null` |
| Arithmetic | `+ - * / %` and unary `-` (numbers only; division by zero is an error) |
| Comparison | `== !=` (any values), `< <= > >=` (numbers) |
| Logic | `and`, `or`, `not` (true/false only) |
| Grouping | `( … )` |
| Names | `self.age`; which names exist depends on where the expression is. In attribute defaults: none. |
| Functions | `min(a, …)`, `max(a, …)`, `clamp(x, lo, hi)`, `lerp(a, b, t)`, `abs`, `floor`, `ceil`, `round`, `sqrt`, `if(cond, a, b)` (only the chosen branch runs) |
| Random | `rand()` in [0, 1), `rand_range(a, b)`, `rand_int(a, b)` inclusive, `pick(a, b, …)` one of its arguments; seeded, only where the place allows it (attribute defaults and need `start`) |

Limits: 500 characters, nesting depth 48, 10 000 evaluation steps.

Examples:

```
rand_int(16, 45)
round(rand_range(0.2, 0.8) * 100) / 100
if(rand() < 0.1, 3, 1)
```

## Checklist for a new pack

1. Pick an id and `requires` (almost always `"core"`).
2. Add entity types; mark only truly basic things as `leaf`.
3. Add knowledge types for what people can know about them (and know-how later).
4. Add mind types: needs (how they rise and fall), goals (tier and weight), actions (a verb and the goals it serves).
5. Add edges with the data each end needs.
6. Load it; fix whatever Archie reports, using the paths in its messages.

The built-in `core` pack (`src/packs/core.json`) is the reference example.
