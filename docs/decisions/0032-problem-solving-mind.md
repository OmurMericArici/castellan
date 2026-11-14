# 0032 — A problem-solving mind: methods, emotions, new node types, morality

- Status: proposed (direction noted for after v0.1)
- Date: 2026-11-15

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

## Open
- Planner style (HTN decomposition vs GOAP search), and how deep it may search per decision.
- How learning works without neural networks (ADR-0004): success counts, imitation, being taught.
- Whether emotions are a fourth mind role or a new kind of state.

## Discussion
- 2026-11-15 — User: note these to add: new node types and interactions between
  nodes; emotions as a mechanic beside needs (e.g. high sexual desire raises
  aggression, low lowers it); a problem-solving brain: build a house, no wood →
  the "find wood" method from a list of skill nodes → which calls "find a tree" →
  which calls memory; desire → look for a mate → a friend of the opposite sex →
  marry. If behaviour isn't modelled this way already, we will switch to it. These
  methods should be learnable and preferable, which brings morality; in a crowded,
  long enough simulation we could watch morality emerge.
