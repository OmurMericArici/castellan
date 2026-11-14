# food-storage: notes

Written using only `docs/PACKS.md` and `src/packs/core.json`.

## What the pack does

- `Provide` (goal, tier 2): weight `0.35 * (1 - needs.Hunger)` by day, 0 at night. It is the wish to put food by while not hungry.
- `Stash` (action, serves `Provide`): only for people who have a home, empty hands and know at least one bush. They walk to a bush they remember having berries, work briefly, and `take` up to 3 `food` into `carrying`.
- `EatStored` (action, serves `Eat` at 1.2): only when `carrying > 0` and Hunger > 0.4. They eat one portion from hand wherever they are (Hunger -0.4, carrying -1), with no walk to a bush.

The stash is kept **in hand** (`Person.carrying`). I first built a shared storage-pit design and dropped it (see "Could not express").

## Attempts and checker results

Archie accepted every version on the first try. I got **no checker errors** at any point. Every problem I hit showed up only in the simulation:

1. **Storage pits (`Cache` leaf, memorable, remembers `food`), `Stash` gated on `knows.Cache > 0`, `EatStored` = goto known Cache `where it.food > 0`, run with `--place Cache=3`.** `Stash` never started (0 starts). With 3 pits in the world, people never saw one, so `knows.Cache` stayed 0. Defne ended the run stuck in `doing EatStored` at Hunger 1.00.
2. **`Stash` serves set to a constant 1.** Stash ran 27 times, but people ended up holding `carrying=3` with no known pit to put it in. I changed `Stash` to go to a known pit first.
3. **`--place Cache=25`.** This was a disaster. Seed 1: `EatStored 66, Rest 60, Explore 11, Stash 8`, and all 6 people ended `doing EatStored; ... Hunger 1.00`. Forage stopped completely. `EatStored` has a higher `serves` than Forage whenever any pit is known, but nothing at choice time can tell whether a remembered pit holds food. The `goto ... where it.food > 0` finds nothing, the action ends, the same action wins again, and people starve.
4. **Switched to an in-hand stash (`carrying`).** It works, but people ate from the stash as soon as Hunger was about 0.2. Seed 1: `EatStored 87, Stash 73, Forage 28` (baseline Forage 141), and **Deliver 55 against a baseline of 15**. That suggests shelter's `Deliver` was carrying berries to building sites as if they were wood (see gaps).
5. **Final version: `Stash` gated on `home`, `EatStored` gated on Hunger > 0.4.**

## Simulation (final pack, 10 days, default packs, no `--place`)

Baseline (Stash/EatStored never chosen), seed 1: `Wander 466, Forage 141, Rest 98, ... Deliver 15`, peak Hunger 0.72.

Final pack:

```
seed 1  actions started: Wander 398, Forage 106, Rest 98, Explore 40, Gather 35, Deliver 24, EatStored 19, Build 15, Stash 13
        Yaz ... Hunger 0.16 carrying=1 | Tuna ... carrying=2 | Defne ... carrying=3 | Ilka ... carrying=2
        highest: Hunger 0.72
seed 2  actions started: Wander 491, Forage 120, Rest 97, Gather 37, Explore 30, Deliver 26, Build 14, EatStored 12, Stash 11
        highest: Hunger 0.53
seed 3  actions started: Wander 562, Forage 119, Rest 90, Gather 32, Explore 30, Deliver 23, Build 15, Stash 15, EatStored 13
        highest: Hunger 0.72
        no runtime warnings
```

The behaviour does happen. Once people have a house they pick extra berries (11 to 15 Stash per run) and later eat from hand (12 to 19 EatStored per run). Forage drops by roughly 15 to 25%, and most people end the run holding 1 to 3 portions. Peak hunger is about the same as the baseline. Deliver is still a little above baseline (23 to 26 against 15), so some berries may still be delivered as building material.

## What I wanted to express but could not

1. **A pack cannot add attributes to another pack's type.** I could not give `Person` a `food` or `pantry` attribute, so berries must share `carrying` with shelter's wood. Shelter's `Deliver`/`Gather` and my `EatStored` cannot tell berries from wood. Someone hungry while carrying wood "eats wood", and a berry carrier may "deliver berries". A per-type extension, or a typed inventory (`carrying.food`), would fix this.
2. **Action choice cannot see remembered state.** `knows.<Type>` counts every known thing, with no filter. I needed `knows("Cache", "it.food > 0")` or similar. Without it, an action that relies on a stocked store is chosen even when every remembered store is empty, and people loop on it until they starve (attempt 3). This is what killed the shared-storage design: storing in a place is fine, but deciding to eat from that place is not expressible safely.
3. **No fallback or branching in steps.** `optional` only skips a `goto`. I could not write "go to a stocked pit, else go to a bush".
4. **No way to make a stash near people.** Leaves are scattered at random by Noah. A personal pit would need `build`, but its rules (one `plan`, `goto: "plan"`, `home`) look tied to a single project per person. The guide doesn't say whether a second buildable type can coexist with the House.
5. **I can't store at home.** `goto: "home"` exists, but House belongs to shelter, so I can't add a `food` attribute to it.

## Unclear or misleading points in PACKS.md

- It doesn't say whether a person can have more than one building project, or what `plan`/`home` mean when two packs both use `build`.
- It doesn't document which names are allowed in which places. For example, I couldn't tell in advance whether `self.carrying` works inside an `if` step or a `serves` expression; the example uses `target.*`. (It does work.)
- What happens when a `goto` finds nothing, and the same action is immediately the best again? The guide says the action "ends", but in practice people sat in `doing EatStored` forever. Is there any cooldown or loop protection?
- `carrying` is described in core as "material units in hand (set by the engine)". It's not clear that packs may (or should) write it with `self.carrying`, or that shelter's actions read it.
- The guide doesn't describe the other default packs (shelter, hunger, hostility): their actions' `serves` values, Forage's effect, Deliver's condition. You need these to balance `serves` values against them; I had to guess the 1.2 and 0.4 numbers.
- The `found-empty` "if" condition and the `it` name in reactions are described, but there is no list of which attributes of `it` are the real state and which are remembered.
- `--place` is described in the task, but PACKS.md doesn't say how many leaves Noah places by default for a new leaf type (it seems to be none unless you pass `--place`).
