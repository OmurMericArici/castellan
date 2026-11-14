# 0032 — A problem-solving mind: methods, emotions, new node types, morality

- Status: accepted (direction settled; timing: before M6)
- Date: 2026-11-14

## Context
The user described the next layer of the mind and asked for it to be noted.

## What exists today (honest baseline)
- **New node types:** packs can already add entity, knowledge and mind types, edges,
  and change others' types (`extends`). What they can't add is a new *kind* of node
  beyond entity / knowledge / mind.
- **Interactions:** steps act on a target (`take`, `give`, effects on `target` /
  `other`), but there is no declared "interaction" between two node types that
  either side can use (e.g. "a person can chop a tree", "two people can marry").
- **Emotions:** only needs (levels with rates). A need's rate can already read other
  needs (`needs.X` in `rate`), so "more X makes Anger rise faster" is expressible,
  but there is no separate, fast-changing emotional state that colours *how* people
  choose.
- **Decisions are flat** (utility AI): every action is scored directly against goals.
  There is no decomposition: "build a house" doesn't call "find wood", which doesn't
  call "remember a tree". Our packs fake it with separate actions and `serves`
  conditions (Gather / Deliver / Build).

## Direction
1. **Problem-solving methods.** A goal or need raises a *problem*; the person picks
   a *method* from the methods they know that solves it; a method's steps can raise
   sub-problems, which are solved the same way, down to primitive steps. Example:
   build a house → no wood → *find wood* → *find a tree* → *recall* (memory) or
   *explore*. Another: desire → *find a mate* → a friend of the opposite sex → *marry*.
   (This is hierarchical task planning: HTN / GOAP family.)
2. **Methods are knowledge.** Methods are know-how nodes people link to (ADR-0015):
   they can be **learned** (from others, from success), **preferred** (a per-person
   weight on each method that rises with success and falls with failure or
   punishment), and forgotten.
3. **Emotions as their own mechanic.** Short-lived states driven by needs and events
   (anger, joy, fear, shame), which shift method choice and goal weights. Example
   from the user: high sexual desire raises aggression; low desire lowers it.
4. **Interactions as declared pairs.** A pack declares what one node type can do to
   or with another; methods use them.
5. **Morality emerges.** When methods are learned and preferred, and others react
   to how problems get solved (a killer is hated, a sharer is liked), a large, long
   simulation should show norms forming: methods that cause hatred get punished
   and abandoned, others spread. Observing that is a goal in itself.

## Consequences
- This replaces flat action choice with planning over methods; the current
  `actions` become the leaves (primitive methods). Step programs, reactions and
  memory rules stay.
- Needs crowds and long runs: performance work (and probably a Web Worker) comes with it.
- Fits ADR-0027: the planner is engine; methods, emotions and interactions are pack content.

## Settled (2026-11-14)
1. **GOAP**, chosen for emergence: methods declare preconditions and effects on what
   the person believes; the planner searches backward from the goal to steps the
   person can take now. **No depth limit.** Plans stay short in practice (a house
   is a few links from "go to a tree"), and planning is part of the person's thinking,
   which runs inside simulated time like everything else.
2. **Learning through talk and observation**, both as mechanics: watching someone use
   a method can teach it; talking passes knowledge and methods on. Talking itself is
   a **pack**; a good enough pack could even let people build schools.
3. **Emotions are multipliers** on other behaviour: they scale goal weights, method
   preferences and the thresholds that hold people back. Existing nodes and packs get
   updated to read them. All fuzzy:
   - someone who would never kill might, when very afraid and very angry;
   - two people who wouldn't mate might, when very happy or very deprived.
4. **Traits and emotions support or suppress each other**: a mechanic for one mind
   value raising or damping another (an angry person is less friendly at the same time).
5. No neural networks (ADR-0004): the mind is built by hand, and grows emergently
   through learning, preference and others' reactions.

## Still open
- ~~When: before v0.1 (M6) or right after.~~ Before M6 (2026-11-14).
- ~~The exact shape of method preconditions/effects.~~ Named facts, local requires/gives, derived preconditions (2026-11-14; ADR-0033).

## Discussion
- 2026-11-14 — User: note these to add: new node types and interactions between
  nodes; emotions as a mechanic beside needs (e.g. high sexual desire raises
  aggression, low lowers it); a problem-solving brain: build a house, no wood →
  the "find wood" method from a list of skill nodes → which calls "find a tree" →
  which calls memory; desire → look for a mate → a friend of the opposite sex →
  marry. If behaviour isn't modelled this way already, we will switch to it. These
  methods should be learnable and preferable, which brings morality; in a crowded,
  long enough simulation we could watch morality emerge.
- 2026-11-14 — User: use GOAP for emergence; no depth limit, the thought process
  runs anyway and reaching "cut a tree" takes few steps. Learning by adding talk and
  observation mechanics; talk via a pack (a good enough pack even allows building a
  school). Emotions are a multiplier affecting other behaviours, which means updating
  existing nodes: someone who normally wouldn't kill can when scared and angry; two
  people who normally wouldn't mate can when very happy or very deprived. All fuzzy.
  No neural network, but built by hand and emergently. Traits can support or
  suppress each other (an angry person may not be very friendly at the same time).
- 2026-11-14 — User: finish everything we addressed before moving on to M6. So ADR-0032
  is built first (milestone M5b), together with the gaps found while reviewing how people
  are modelled: determination becomes a trait like Psychopathy, people remember witnessed
  events and other people, emotions get their own layer.
- 2026-11-14 — User: emotions move out of needs into their own role (Fear, Anger, Dread
  become emotions); one `scales` mechanism lets emotions, traits and needs multiply goal
  weights, method scores, restraint and each other. All four extras are built before M6:
  a talk pack, events remembered as knowledge, ordinary people able to kill when afraid
  and angry enough, people remembering each other.
- 2026-11-14 — User, on GOAP: no predefined decision tree. People should hold a
  requirement/desire in their head that propagates step by step: the house needs wood,
  wood needs a tree. That order must come out emergently. Unsure whether giving it
  up front would be more useful.
- 2026-11-14 — Settled the open question: each method states only its own local
  preconditions (`requires`) and results (`gives`) over named facts about what the person
  believes; no method names another. The engine plans backward at every decision, so a
  missing fact becomes a sub-desire with the same urgency, and "house → wood → tree"
  emerges. Preconditions are derived from steps where possible (`goto known Tree` means
  "must know a tree"); `gives` is written by hand. Rejected HTN-style fixed decompositions
  (a predefined tree). User's reasoning: the order must come out emergently, not be handed to people.
