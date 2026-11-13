# Writing packs

A pack adds things to a Castellan world: types of entities, knowledge and mind,
edge types, and (from M3 on) rules. Packs are **plain JSON**. Nothing in a pack
runs as code: values that need logic use Castellan's small expression language,
which Castellan parses and evaluates itself.

This page is the whole contract. It is written so a person *or an LLM* can write
a valid pack from it. Archie (the architect) checks every pack before it loads
and explains each problem with its exact place, so a failed pack can be fixed
from the error alone.

Format version: **0.1** (M2). Rules arrive in M3; this page grows with them.

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
| `role` | mind types only, required: `need`, `goal`, `action` or `trait` |
| `attrs` | attribute definitions, by name |
| `description` | free text |

## Attributes

Attribute names are camelCase (`wood`, `learnedAt`).

| Key | Meaning |
|---|---|
| `type` | `number`, `string` or `boolean` |
| `min`, `max` | numbers only; values outside are clamped |
| `default` | a literal of the right type, or `{ "expr": "…" }` (number/boolean only) evaluated once when the node is created |
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
| Random | `rand()` in [0, 1), `rand_range(a, b)`, `rand_int(a, b)` inclusive; seeded, only where the place allows it |

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
4. Add mind types: needs, goals, actions, traits.
5. Add edges with the data each end needs.
6. Load it; fix whatever Archie reports, using the paths in its messages.

The built-in `core` pack (`src/packs/core.json`) is the reference example.
