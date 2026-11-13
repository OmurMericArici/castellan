# Decision records

One file per real choice, numbered, never rewritten. If a decision changes,
write a new record that **supersedes** the old one and mark the old one.

File name: `NNNN-short-title.md`. Template:

```markdown
# NNNN — Title

- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context
What forced a choice. Link inspirations.

## Options
- A — pros / cons
- B — pros / cons

## Decision
What we picked, in one or two sentences.

## Consequences
What this makes easy, what it makes hard, what we'll revisit.

## Discussion
- YYYY-MM-DD — the question asked, the user's reasoning in their own terms,
  what changed because of it.
```

The **Discussion** section is the decision moment itself: keep the user's
reasoning, not just the outcome. Append to it whenever the topic comes up again,
even while the record is still proposed.

| # | Title | Status |
|---|---|---|
| 0001 | [Record decisions and keep a devlog](0001-record-decisions.md) | accepted |
| 0002 | [Browser stack](0002-stack.md) | accepted |
| 0003 | [First vertical slice: one castle, two levels](0003-vertical-slice.md) | superseded by 0011 |
| 0004 | [What "ML" means in v0.1](0004-what-ml-means.md) | deferred (learning is a later stage) |
| 0005 | [Node graph and actualizer as separate layers](0005-node-graph-and-actualizer.md) | accepted |
| 0006 | [Space with fields as root; input only at leaves](0006-space-fields-leaf-input.md) | accepted |
| 0007 | [Time model](0007-time-model.md) | accepted |
| 0008 | [People are leaves and decision makers; derived things emerge through processes](0008-people-needs-construction.md) | accepted |
| 0009 | [Composite nodes with internal parts; typed edges](0009-composite-nodes-typed-edges.md) | accepted |
| 0010 | [Measurable values derived, unmeasurable values relative](0010-value-kinds.md) | accepted |
| 0011 | [First vertical slice: from people to a village](0011-first-slice.md) | accepted |
| 0012 | [Molly: recognises, names, defines, keeps entropy](0012-the-system.md) | accepted (entropy part superseded by 0021) |
| 0013 | [Layers and who talks to whom](0013-layers-and-communication.md) | accepted |
| 0014 | [Identity and memory](0014-identity-and-memory.md) | accepted |
| 0015 | [Movement, perception and knowledge](0015-movement-perception-memory.md) | accepted |
| 0016 | [Mind: weighted goals, never one target](0016-mind-weighted-goals.md) | accepted |
| 0017 | [Noah: genesis and the only door for outside input](0017-noah-genesis.md) | accepted |
| 0018 | [Archie and packs: the world's rules are expandable](0018-archie-and-packs.md) | accepted |
| 0019 | [Three node kinds: entity, knowledge, mind](0019-three-node-kinds.md) | accepted |
| 0020 | [Adam: the engine that runs people](0020-adam.md) | accepted |
| 0021 | [Entropy as its own character](0021-entropy.md) | accepted |
| 0022 | [World core: time unit and data structures](0022-world-core.md) | accepted (technical) |
