# 0034 — Five primitives for modelling behaviour

- Status: proposed
- Date: 2026-11-14

## Context
The user asked what else is needed to model real human behaviour, and brought two
ideas of their own: **inquiry** (seeing a dead body and asking someone who it was;
asking how to build a house) and **association** (afraid at night while far from
home, then afraid whenever far from home). Later they added: forgetting the way
home, abandoning a home, building paths, and explorers who stay close because
they fear losing the way when there is no path.

Checking these and sixteen other behaviours against format 0.6 gave: five can be
written as packs today, eight need a small addition, eleven need something the
engine does not have. Almost all of the gaps come down to the five primitives
below. By ADR-0027 and ADR-0035 the answer is to add the primitives, never the
behaviours.

The pack syntax shown here is a sketch to make each idea concrete, not a format.

## Options
- A — Write each behaviour into the engine as it comes up. Fast for the first
  one, breaks ADR-0027, and every pack author gets only the behaviours we thought of.
- B — Add a few general primitives and write the behaviours as packs. More
  design work up front; each primitive pays for several behaviours.

## Decision (proposed)
Option B, with these five primitives.

### 1. Association
People link what was around them to what they felt, and the link later brings the
feeling back.

- A pack declares **cues**: named features of the moment, as expressions
  (`"cues": { "dark": "night", "farFromHome": "clamp(distHome / 40, 0, 1)" }`).
  The engine offers cues it can see itself: the person met, the thing acted on,
  the method being done, the place.
- A cue is a mind node; each person's link to it carries a strength per emotion
  (shared node, personal edge, ADR-0019).
- When an emotion jumps, the cues active at that moment are strengthened for that
  person. Later an active cue pushes that emotion up in proportion to its
  strength. A cue that is active while the emotion stays low weakens (the fear
  wears off with safe repeats).
- Readable in expressions (`assoc.Fear.farFromHome`), so goals, `scales` and
  restraint can use it.

What it replaces or opens: the hand-written night fear in `core`, `grudge` (this
person → anger), `prefer` (this method → good or bad outcome), habits (cue →
method), abandoning a home whose surroundings became tied to fear, staying close
to home.

### 2. The `claim` effect
Packs can make knowledge nodes, not only link to the two the engine makes
(`Sighting`, `Report`).

- An effect `claim` names a knowledge type, what it is about and its attributes.
  The same claim is the same shared node (ADR-0015); the person gets a `knows`
  link with their own confidence and source.
- Claims of any type can be told (`tell`), counted and read about the person or
  thing in front of them.

What it opens: reputation and gossip (an opinion about a person), identity (this
body is Bora), ownership ("mine" as a claim), who knows what ("Bora knows how to
build"), names that peoples give to things (ADR-0019).

### 3. Fields that packs can write, and walking cost in packs
- A pack can declare a field (`trail`), with a start value and a daily change that
  Entropy applies lazily (ADR-0007).
- Effects can write a field where the person stands; a walking leg can write
  along its way (a worn track).
- Walking cost becomes an expression that reads fields. Water blocking and slope
  cost, today fixed in `path.ts`, move into `core`.
- Molly can recognise a connected stretch of a field as a thing (a road).

What it opens: desire paths, paths built on purpose, roads to far places, any
other mark people leave on the land (cleared ground, tilled soil).

### 4. Unknowns in the planner
Today a method with no plan is silently "not a choice", and a method a person
doesn't know doesn't exist for them. Both should become something the person holds.

- A missing fact that no known method gives stays with the person as an **open
  question**.
- A goal that none of their methods serves is also an open question ("how do I
  get shelter?"). The person never needs to know a method's name to ask: they ask
  about the goal or the fact, and the answer is a method that serves or gives it.
  No method names another (ADR-0032).
- Steps can use the question: tell or teach **what was asked**, from the other
  person to the asker.
- Open questions are readable (how many, about what), so curiosity can depend on them.
- Things can be seen without being identified: the dead stay visible, and who a
  body was is a claim (primitive 2) that someone may or may not hold.

What it opens: inquiry in both of the user's forms, curiosity driven by what one
knows one doesn't know, and later "nobody knows, so try" (learning by trying).

### 5. Names the expression language lacks
Small additions, each general:

- the other person's mind: `other.emotions.*`, `other.needs.*`, `other.traits.*`
  (emotion contagion, choosing whom to copy);
- distances: `distHome`, and to anything the person has an edge to;
- `knowhow.watch` and `tell` may read `other` and `bond`, and `tell` may set the
  confidence of what is passed (trust, selective imitation);
- a `mismatch` reaction when what is found differs from what was remembered,
  with both values readable (`found-empty` becomes one case of it);
- **home is a memory**: where home is becomes a remembered place that fades like
  any other and is renewed by being there. The `home` fact means "knows the way
  home", so it can turn false.

With 3 and 5 together a pack can say "on a trail" (`field.trail`) and "far from
home", which with 1 gives the user's scenario without writing it: someone far
away loses the way and is afraid, the fear is tied to being far from home, it
doesn't happen on a path, so people who want to go far make paths.

## Consequences
- Format grows to 0.7 or more; PACKS.md gains four sections. Each primitive ships
  with a default pack that uses it and a blind test (ADR-0029).
- Hand-written rules in our packs (night fear, grudge) should be rewritten on top
  of association once it exists. That will change how current worlds play out.
- Performance: association adds per-person edges that change often; writable
  fields invalidate path caches. Both need measuring on crowded runs.
- Not covered here, because they are not small: learning by trying, foresight,
  attention. They stay in the parking lot.

## Open questions
- Association: how coarse is a "place" as a cue? Does it sit beside `prefer` and
  `grudge` or replace them? Do positive emotions associate the same way?
- Claims: when two claims disagree, which does a person act on?
- Fields: several packs giving walking costs, multiplied or last one wins?
- Unknowns: whom to ask (nearest, trusted, known to know)? Does asking cost anything?
- Order and timing. Suggested order: 5, 1, 3, 2, 4. Whether any of it comes
  before M6 is the user's call.

## Discussion
- 2026-11-14 — User: imagined an "inquiry" mechanic and "association". Examples:
  on seeing a dead body, asking someone who it was, or asking how to build a
  house; being afraid at night while far from home, tying being far from home to
  the fear, and being afraid of it afterwards.
- 2026-11-14 — User asked how much of the list can be a pack and how much needs
  new mechanics, and added: forgetting the way home and being afraid; abandoning
  a home (by tying its surroundings to fear, or by finding a better place);
  building paths. People who set out might not go far when there is no path, for
  fear of losing the way home; roads could be made to far places.
- 2026-11-14 — User asked for a decision record for the five primitives. Written
  as proposed; nothing is built.
