# Vision

**North star: emergence and environmental storytelling.**

Castellan is a node-based world builder. You don't place villages, roads or
ruins. You set up a land and a few people, and they get built because people
need things, act on what they know, and leave traces. Every house, name and
ruin has a recorded cause you can read back.

## What it is

**An engine, and a default pack.** The engine holds only what can't be said simply
as data (pathfinding, time, perception, the pack interpreter, rendering). Everything
the world *is* and *does* lives in packs, starting with our own default set
([ADR-0027](decisions/0027-engine-and-default-pack.md)).

## What makes it different

- **Only the basics come from outside.** Noah places the land, the first people,
  trees and stones, and what those people know. Everything above that (houses,
  villages, trade routes) has to emerge.
- **People are the cause.** They hold several weighted goals at once, act on
  what they *know* (not on the truth), get stubborn, get scared, change plans.
- **Knowledge is part of the world.** A sighting, a skill or a name is a node
  that many people link to. It can be shared, go stale, drift and, later, be a lie.
- **The world reads itself.** Molly notices what formed and names it: these
  houses are a village, that path is a road.
- **Everything is a pack.** The engine knows no houses. House building is a pack;
  firearms, magic or technology can be packs too, written by hand or by an LLM,
  checked by Archie and run by our own interpreter, never as code.
- **Form comes last.** The actualizer gives nodes a physical shape (WFC lays out
  a house's walls), but it only dresses what the story already decided.

## The cast

| Character | Role |
|---|---|
| **Archie** | the architect: loads, checks and updates packs (types and rules) |
| **Noah** | genesis: defines the space, places the first leaves and knowledge; the user configures Noah |
| **Molly** | the world: recognises and names what forms, defines concepts, influences people |
| **Adam** | the people: wakes them, plans how to reach their goals, moves them, records what they see, learn and are told; gives them traits |
| **Entropy** | *([ADR-0021](decisions/0021-entropy.md))* growth and decay of space, things and knowledge |

## The long road

Each step is a set of packs on the same engine. Only the first is in scope
([SCOPE.md](SCOPE.md)).

1. **People to a village** *(v0.1)*: shelter, construction, a village that names itself.
2. **Living villages**: food, birth and ageing, personalities, more needs.
3. **Knowledge that travels**: telling, teaching, merchants, emerging trade routes.
4. **Settlements and powers**: towns, kingdoms, borders; war and trade derived from behaviour.
5. **Lies and drift**: knowledge that degrades, and knowledge given wrong on purpose.
6. **Anything else as packs**: technology, magic, firearms.
7. **Learning stage**: rules tuned from examples instead of by hand (no neural networks).

How it works in detail: [MODEL.md](MODEL.md). Why it works that way: [decisions](decisions/README.md).

## Glossary

Keep these words fixed so code, docs and talks use the same language.

| Term | Meaning |
|---|---|
| **Space** | The root: a map carrying fields. |
| **Field** | A continuous property of the space (height, water, fertility, soil). Not a thing. |
| **Node** | One unit in the graph. Three kinds: entity, knowledge, mind. |
| **Entity** | Something that exists in the world and has a place: person, tree, house, village. |
| **Knowledge** | A shared, immutable claim or skill that people link to: a sighting, know-how, a name. |
| **Mind** | A shared piece of how people think: a need, emotion, goal, method (action) or trait. |
| **Emotion** | A fast-changing state (fear, anger, dread) that scales goals, methods and restraint rather than being satisfied like a need. |
| **Method** | An action a person knows how to do: known from birth, learned by watching or being taught, preferred more or less, forgotten. |
| **Fact** | Something a person believes is true (`hasLoad`, `known.Tree`). Methods require and give facts; the planner chains them. |
| **Restraint** | What holds a person back from a method (0..1); emotions and traits can wear it down. |
| **Edge** | A typed link between nodes (`knows`, `has`, `livesIn`, `partOf`…), readable from both ends; each end may carry its own data. |
| **Leaf** | A type that is never derived (person, tree, stone, tool). Only leaves can come from outside. |
| **Derived** | A type that can only emerge through a process (house, village). |
| **Composite** | A derived entity made of parts folded into one node (a house and its walls). |
| **Concept** | A planned entity Molly places (a house site) that people turn real by working. |
| **Event** | One change to the world. Every change is an event; the event log is the history. |
| **Lazy value** | A value stored as (value, rate, since) and computed when read: hunger, age, wear. |
| **Determination** | A trait: how strongly a person sticks with their current action against risk and better-looking options. |
| **Pack** | A data bundle of types, rules and parts, checked by Archie and run by our interpreter. |
| **Actualizer** | Gives nodes a physical form; reads the world, never changes it. |
| **Seed** | Makes a run reproducible. Same Noah config + seed + packs = same world. |
