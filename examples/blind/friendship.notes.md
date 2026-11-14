# friendship pack: notes from a blind test

Written using only `docs/PACKS.md` and `src/packs/core.json`.

## What the pack does

- **Loneliness** (need): starts at 0.2 to 0.5 and rises 0.3 a day. It falls fast (-1.5 a day) while the person is doing `VisitFriend`.
- **Belong** (tier-3 goal): its weight is `needs.Loneliness`.
- **Joking** is a set of `meets` reactions, since a reaction cannot start an action. Each good encounter (no grudge, Anger < 0.6) lowers Loneliness a little and moves the pair one step up a ladder of edges: `joked` (first joke) -> `laughedWith` (second) -> `friend` (third). The edges stand in for an encounter counter. The reactions are listed in reverse ladder order (friend check first, `joked` last), so a single meeting cannot climb more than one rung if reactions are evaluated one after another against the updated `rel`.
- **Being friends changes behaviour**:
  - Meeting a friend lowers Loneliness by 0.3, Anger by 0.3 and Fear by 0.1.
  - Meeting a friend you also hold a grudge against removes the grudge.
  - `VisitFriend` (serves Belong) walks to the nearest friend (`goto: { linked: "friend" }`), hangs out for 0.08 days, then lowers Loneliness and Anger.
- **Attachment** (workaround need, rate 0): set to 1 when the person makes their first friend. `VisitFriend` only serves Belong when Attachment > 0.5 (see the gaps section for why).
- `requires: ["core", "hostility"]`, for `Anger` and `grudge`.

## Checker errors

Archie accepted the pack on the **first attempt**, and on every run after that. I hit no checker errors.

I did hit one behaviour bug that Archie cannot catch. In version 1, `VisitFriend` served Belong unconditionally. Friendless people kept picking it, the `goto linked` found no friend, and the action ended at once. That gave 49 useless `VisitFriend` starts in 10 days on seed 1. I fixed it with the `Attachment` flag need.

## What the simulation showed

Version 1 (no Attachment gate), seed 1, 10 days and 30 days:
```
actions started: Wander 193, Forage 103, Rest 77, VisitFriend 49, ...
edges created: ..., joked 10, ...
(30 days) edges created: ..., joked 10, ...   <- no laughedWith/friend ever
```
Version 1, seed 7: `joked 12, laughedWith 10, friend 8`, so the ladder does climb when the same people keep meeting.

Final version, 10 days:
```
seed 1: actions started: Wander 467, Forage 146, Rest 98, Gather 38, Explore 36, Build 23, VisitFriend 22, Deliver 18
        edges created: ..., joked 8, laughedWith 8, friend 6, ...
        Vera: doing VisitFriend; ... Loneliness 0.00, Attachment 1.00
        Yaz:  doing Wander;      ... Loneliness 1.00, Attachment 0.00
seed 7: edges created: ..., joked 12, laughedWith 8, friend 6, ..., grudge 2
seed 3: edges created: ..., joked 24, laughedWith 16, friend 12, ..., grudge 1
        Una: doing VisitFriend; ... Loneliness 0.00, Attachment 1.00
        Ilka: doing VisitFriend; ... Loneliness 0.00, Attachment 1.00
no runtime warnings
```
The behaviour does happen. People joke, the edges climb, friendships form (3 to 6 pairs in 10 days), and only people with friends start `VisitFriend`. They end with low Loneliness, while friendless people sit at 1.00. I could not see from the summary whether "meeting a friend calms Anger" or "grudge removed by friendship" ever fired. Anger stayed near 0 in most worlds, and the checker does not count reaction firings.

The checker's "highest need levels seen" on seed 1 says `Loneliness 0.79`, yet three people end at `Loneliness 1.00`. Either the maximum is sampled, or the end values are lazy values computed differently. Either way it is confusing.

## What I wanted to express but could not

1. **Per-pair state (a counter or score on a relationship).** Edges can declare `fromData`/`toData`, but no effect can read or write edge data, and `rel.<edge>` is only a boolean. I wanted "affinity += 0.2 per good joke, friends at 1.0". I had to fake it with a ladder of three edges.
2. **New per-person attributes.** I could not add e.g. `humor` or `friendCount` to `Person`: packs cannot change another pack's types, and `self.<attr>` can only set declared attributes. So I misused a need (`Attachment`, rate 0) as a boolean flag.
3. **Counting edges in expressions.** There is `knows.<Type>`, but nothing like `count.friend` or `has.friend`. Outside a `meets` reaction, an action's `serves` cannot ask "do I have a friend?". This is why I needed the Attachment hack.
4. **Chance in reactions.** `rand()` is only allowed in defaults and need `start`, so a joke cannot "sometimes fall flat". Every encounter that passes the conditions is a good one. The only variation comes from Anger.
5. **Joking as a real action between two people.** People are not memorable, so `goto: { known: "Person" }` is unavailable. Reactions cannot start actions, and there is no step that affects another person (no `other.*`/`target` needs in action effects on people). So joking cannot take time, need both parties to be idle, or change the other person's needs directly. Each side's own `meets` reaction has to do its half.
6. **Mutual links.** `link` only adds an edge from the person. Whether a friendship is symmetric depends on both people's `meets` reactions firing. Nothing guarantees `meets` fires for both sides at once.
7. **A need rate that depends on relationships**, e.g. "Loneliness rises slower if you have friends". The rate can read `needs.*`, so I could have used Attachment, but not the real number of friends.

## Unclear or misleading parts of PACKS.md

- **Order and isolation of reactions.** When several reactions match one event, are they all evaluated against the state before the event, or one after another, so that `rel.joked` set by one is visible to the next? Does more than one fire? This decides whether my ladder can climb several rungs in one meeting. I ordered the reactions defensively.
- **How often `meets` fires.** "Another person comes within sight" does not say whether it fires again for people who stay in sight (housemates), or whether there is a cooldown. On seed 1 in version 1, 30 days produced no second encounter at all.
- **`goto: { linked: ... }` with no linked person.** I had to infer that it ends the action. The `optional` note implies it but does not state it for `linked`.
- **No way to stop an action from being chosen when its target cannot exist.** `serves` cannot see edges. The guide does not say so, and does not suggest a pattern for it.
- **`self.<attr>` on undeclared attributes.** It is not stated whether this is an error. Together with "packs can't change another pack's types", it means a pack cannot give Person new state. That limit is important and is only implicit.
- **Edge `fromData`/`toData`.** The guide documents declaring them, but no expression or effect can touch them, so it is unclear what a pack author can use them for.
- **Edge `from`/`to` for person-to-person edges.** I guessed `entity`/`entity`. There is no `Person`-typed endpoint, so `friend` could in principle point at a tree.
- **`urgentAt` limits.** I needed a need that never becomes urgent and set `urgentAt: 1`. The guide does not say whether a level of exactly 1 counts as crossing it.
- **`check-pack` options.** The guide does not mention them, and `--help` is treated as a file path.
- Hunger, hostility and shelter are always loaded, but PACKS.md does not list their names (`Anger`, `grudge`, `home`, `Shelter` need). I relied on the task description for them.
