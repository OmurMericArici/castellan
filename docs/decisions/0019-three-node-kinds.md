# 0019 — Three node kinds: entity, knowledge, mind

- Status: accepted
- Date: 2026-11-14

## Context
Packs add three kinds of thing (ADR-0018): things in the world, what people know,
and how people think. Making these the fundamental kinds of node gives packs,
Archie and the engine one shared vocabulary.

## Proposal

| Kind | What it is | Lives where | Examples |
|---|---|---|---|
| **Entity** | something that exists in the world | positioned in the space | person (the body), tree, axe, house, village, construction site |
| **Knowledge** | a claim about the world or a skill | shared; people link to it | sighting of tree#812, know-how `BuildHouse`, a place name |
| **Mind** | a piece of how a person thinks | shared definitions; people link to them | need `Shelter`, goal `Survive`, action `ChopTree`, trait `Brave` |

### One pattern for both knowledge and mind
**Shared node, personal edge.** The node holds what is the same for everyone;
the edge holds what belongs to one person.

```
            knows {learnedAt, from, confidence}
 Person ───────────────────────────────▶ Sighting(tree#812)
   │
   │ has {weight, since}
   ├──────────────────────────────────▶ Goal(Survive)
   │ has {value, rate}
   └──────────────────────────────────▶ Need(Shelter)
```

A person is then an entity (the body in the space) plus its edges: its mind is
its links to mind nodes, its knowledge is its links to knowledge nodes.

### Edges between kinds
| Edge | From → to | Meaning |
|---|---|---|
| `knows` | person → knowledge | the person holds this claim/skill |
| `has` | person → mind | the person has this need/goal/trait, with personal values |
| `about` | knowledge → entity | the claim refers to this thing |
| `enables` | knowledge → mind (action) | know-how makes an action possible |
| `satisfies` | entity → mind (need) | a house meets shelter |
| `serves` | mind (action) → mind (goal) | chopping wood serves shelter and warmth |
| `partOf`, `memberOf`, `livesIn`, `uses` | entity → entity | as before |

With this, "what can this person do?" is a graph walk: their `knows` →
`enables` → actions, scored by their `has` goals via `serves`.

### Types vs instances
- **Types** (what a `House` is, what `ChopTree` does) come from packs; Archie owns them.
- **Instances** (this house, this sighting) are made by Noah at the start and by
  Molly and people while the world runs.

## Settled points
1. **Groups** are entities (a village has a place), created by Molly's recognition.
2. **A house concept** is an entity in a `planned` state: it occupies a spot and people work on it.
3. **Mind nodes are shared:** one `Goal(Survive)` for everyone; personal weights live on `has` edges.
4. **Events are not nodes;** they stay in the log. A person's memory of an event is
   a knowledge node pointing at the log entry.
5. **Names:** Molly's name for an entity is an attribute (for the observer); what
   people call it is knowledge, so two peoples can name the same river differently.

## Discussion
- 2026-11-14 — User proposed the knowledge / entity / mind split while
  describing what a pack adds, liked it, and asked to dwell on it.
- 2026-11-14 — User accepted points 1–4 as proposed (village = entity, house
  concept = planned entity, shared mind nodes, events stay in the log), and liked
  point 5: two peoples can call the same river by different names.
