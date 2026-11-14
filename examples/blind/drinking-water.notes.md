# drinking-water: notes from a blind pack test

Written using only `docs/PACKS.md` and `src/packs/core.json`.

## What the pack does

- `Spring`: a memorable leaf entity (`water` attr, remembered). People see springs, remember them and walk back to them by memory. Springs never run dry.
- `Thirst`: a need. Starts at 0 to 0.3, rises 0.9 per day, urgent at 0.7.
- `Quench`: a tier-1 goal, weight `clamp((needs.Thirst - 0.25) * 2, 0, 1)`, so it barely counts until thirst passes a quarter.
- `Drink`: walk to the nearest remembered spring (`goto known Spring where it.water > 0`), spend a short time, then `needs.Thirst -0.8`. It serves Quench only when the person knows at least one spring.
- `SeekWater`: when no spring is known, explore (serves Quench 0.8).

Run it with `--place Spring=N`. **Springs are not tied to lakes** (see the gaps below), so this is a workaround for the theme, not the real thing.

## Checker errors

None. Archie accepted the first version, and every later version, with no errors. All the work went into behaviour that the checker does not judge.

## Iterations driven by the simulation (not by Archie)

1. v1: `Spring` with `spread: { field: "water" }` and a `take` of 1 from `water` per drink.
   - Springs **never spread** (8 placed, 8 at the end on every seed, also with 40 placed). When I removed `field` or set it to `fertility`, springs spread normally (8 became 38). So spreading on `field: "water"` never succeeds. My guess is that lake cells can't hold entities, and land cells never have water above 0.3, but the guide doesn't say.
   - On seeds 2 and 3 some people ended with Thirst 1.00 and Hunger 1.00 while doing Forage. 8 springs held about 240 drinks and about 240 Drink actions were started, so the springs probably ran dry. Lakes don't run dry, so I removed `take` and `spread`.
2. v2: springs that never run dry. Thirst stays bounded on every seed, but people started Drink whenever thirst was above about 0.18, because a raw `needs.Thirst` weight beats Wander's 0.3 × 0.6.
3. v3 (final): a thresholded Quench weight. Drink starts fell from about 245 to about 200 per 10 days.

## Simulation results (final pack, `--days 10 --place Spring=8`)

Seed 1:
```
✓ Archie accepts: core 0.4.0, shelter 0.2.0, hunger 0.1.0, hostility 0.1.0, drinking-water 0.1.0
  actions started: Wander 352, Drink 198, Forage 148, Rest 95, Explore 43, Gather 34, Build 26, SeekWater 20, Deliver 16
    Vera: doing Drink; ... Thirst 0.76
    Tuna: doing Drink; ... Thirst 0.36
    Yaz: doing Forage; ... Thirst 0.29
  highest need levels seen: ... Thirst 0.28
  no runtime warnings
```
Seed 3: `Drink 203, SeekWater 11`. Thirst at the end is between 0.27 and 0.70 for everyone.

Without `--place Spring=N`, Noah places no springs:
```
  actions started: SeekWater 485, Forage 134, Rest 60, Explore 18
    Yaz: doing Forage; ... Thirst 1.00
```
Everyone stays at Thirst 1.00 and explores forever. Nobody ever drinks.

What this shows: people do find springs (SeekWater, then Drink), and thirst stays bounded when springs exist, so drinking happens. The checker output doesn't say how many Drink actions *completed*. About 200 starts against roughly 66 drinks needed (0.9/day × 6 people × 10 days / 0.8) suggests that many walks get interrupted by re-thinking and started again. I can't check this from the checker output.

## What I wanted to express but could not

1. **Drinking from the world's water (lakes).** The `water` field is readable only as `field.<name>` inside a build rule's `spot`. There is no `goto` toward a field (for example `{ "goto": { "field": "water", "above": 0.3 } }`), no `field.*` name in action, need or `where` expressions (for example "is there water here / nearby"), and people can't sense or remember field places. Lakes are not entities either, so people can't `see` or remember them.
2. **Placing water sources at lakes.** Noah's placement can't be steered by a field (no `field` for `leaf`, only for `spread`). `spread.field: "water"` produced nothing (see above). So springs can't be anchored to lakes at all.
3. **Leaves that Noah places by default.** A new leaf type appears only with `--place`. The guide doesn't say how a pack sets a default count, so the pack is useless in a normal run without that flag.
4. **Refilling.** There is no per-day attribute change on entities (needs have `rate`, attributes don't), so a spring that is drained by `take` can't refill. That is why the springs in the final pack never run dry.
5. (Considered, not tried) a `build` rule for a `Well` with `spot: field.water`. It is the one place the format reads fields. But `goto: "plan"`, `finish: "plan"` and `plan.*` are documented as "their building project (shelter)", in the singular. It's unclear whether a person can have a second, different build project at the same time.

## Unclear or misleading in PACKS.md

- `spread.field`: "only where it is above 0.3". With `water` this never placed anything, and the guide doesn't say whether entities can stand on lake cells.
- `leaf: true` "means Noah may place it at the start", but in practice Noah places none of a new leaf type unless `--place` is given, and there is no pack key for how many. ("May" was literally true.)
- The guide never says that `field.<name>` is limited to `spot`, or which fields exist (`height`, `water`, `fertility` came from the task text, not the guide).
- `plan` / `finish: "plan"` / `plan.*` are marked "(shelter)". It's unclear whether `build` is a general mechanism that several packs can use at once.
- How `serves` interacts with tiers is vague: "An urgent tier-1 goal takes over, unless determination holds..." doesn't say what happens when two tier-1 goals (Hunger/Eat and Quench) are urgent together.
- Weight scaling: nothing tells the author that a raw need level as weight will beat idle actions (Wander 0.18) almost all the time, or what Hunger's Eat uses. It would help to have hunger.json listed as a reference, or a sentence on calibrating weights.
- `take`: it's unclear whether a `take` that finds the target empty ends the action (so the later `effect` doesn't fire) or only fires `found-empty` and continues. The `if` step exists, which suggests you have to guard with `if` yourself.
- Checker output: "highest need levels seen: Thirst 0.28" while the same run's end-state lists Thirst 0.76 (and 1.00 in the no-spring run). That line doesn't seem to mean the maximum level reached, or it samples at some other moment. The checker also reports actions *started* but not *completed*, which makes it hard to confirm that an action's last step runs.
- Baseline oddity, not caused by this pack: at the end of day 10 (midnight) everyone shows Fear 1.00 but is doing Wander/Drink/Forage, not Rest. This also happens with an empty probe pack.
