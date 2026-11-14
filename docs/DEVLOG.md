# Devlog

Newest first. One entry per session: what changed, what was learned, what's next.
Add a screenshot/GIF path whenever something is visible.

## 2026-11-15 — Blind pack test

- New tool: `npm run check-pack -- pack.json` (Archie + a short simulation + runtime warnings).
- Three fresh agents wrote packs from PACKS.md + core.json alone: friendship, drinking water, food storage
  (`examples/blind/`). All accepted by Archie on the first try and all work in simulation, each with a
  compromise. Gaps and proposed primitives in ADR-0029.
- Fixed: `spread` on the water field could never succeed; checker reporting; PACKS.md gaps they hit.

## 2026-11-15 — M5 Behaviour in packs

- Engine work: Adam no longer knows verbs. Actions are step programs (goto, work, take, give, effect,
  if, finish, stay); reactions fire on sees / meets / found-empty / finished / dusk / dawn; memory rules
  (recall, fade, reinforce, forget) live on knowledge types; people notice each other (`meets`).
- Content work: `core` and `shelter` rewritten as steps (Gather split into Gather + Deliver); all earlier
  tests pass unchanged. New default packs `hunger` and `hostility`, written from PACKS.md only.
- Emergent: a feud in seed 3 (two people hold grudges against Una, who later holds one back).
- Pack rules that fail at runtime are skipped with a warning instead of crashing the world.
- PACKS.md rewritten for format 0.4. ADR-0028. 50 tests.
- **Next:** M6: WFC house layouts, story panel polish, Noah config in the URL, README with GIF → v0.1.

## 2026-11-15 — Engine, not game

- Checked whether hunger, hostility and imperfect memory could be packs: they can't (actions can't
  change needs, nothing creates relations on events, memory is hard-coded). Proposed ADR-0026:
  actions as step programs, reactions to events, memory rules on knowledge types.
- Principle accepted (ADR-0027): Castellan is an engine and our content is its default pack; code only
  for what can't be expressed simply, everything else in packs.

## 2026-11-14 — M4 Shelter

- New `shelter` pack (Shelter need, Secure goal, Scout/Gather/Build, House, Village); `core` no longer
  mentions shelter. Pack format v0.3: `build`, `recognize`, `spread`.
- Molly places house concepts each dawn with the fuzzy triple (need × spot × known wood × company);
  people gather wood from trees they know, carry it, build, and move in. Villages form when finished
  houses are close, and get a name.
- Entropy spreads trees and wears houses down (lazy condition).
- Bugs found by probing, not by tests: houses stalled at 8/10 wood (`plan.missing` counted carried wood);
  empty choice lists at dawn; loners never got a plan; two villages side by side. All fixed.
- 42 tests, including wood conservation and "same world however time is sliced". Checked in Chrome.
- **Next:** M5: WFC house layouts, story panel polish, Noah config in the URL, README with GIF → v0.1.

## 2026-11-14 — M3 Adam

- People live: event-driven walking legs (A* over the fields), sight events computed ahead along each leg,
  explore/wander/rest, shared `Sighting` claims with `about` + `knows` edges.
- Minds from the pack: needs (Fear, Fatigue, Shelter) as lazy levels, goals with tiers (Survive, Recover,
  Secure, Grow), actions with verbs and `serves`. Determination keeps people going after dark: in tests,
  fully determined people start resting later than undetermined ones.
- Molly signals dusk and dawn; everyone re-thinks. Day starts at dawn (06:00), night from 21:00.
- Pack format v0.2 (`memorable`, need/goal/action rules; `pick()` for names); Archie checks names used in
  mind expressions. ADR-0024, PACKS.md updated.
- First tuning: trees are dense, so a fixed "know 8 trees" threshold ended exploring after one leg; curiosity
  now fades with familiarity (explore phase on day 1, then local life).
- UI: real-time playback with speed control, night shading, click a person to see needs, what they know
  (ringed) and their story built from the log. 33 tests; 5 days × 6 people ≈ 0.2 s.
- **Next:** M4 shelter: house concepts, gathering wood, building, village recognition and naming.

## 2026-11-14 — M2 Archie and the interpreter

- Expression language (`expr.ts`): own tokenizer + Pratt parser, strict types, fixed function list,
  seeded randomness only, names checked at load time, bounded (length, depth, steps), errors with columns.
- Pack format v0.1 and Archie's checks (`packs.ts`): strict keys with "did you mean" hints, naming rules,
  missing/circular requirements, conflicts; packs ordered by requirements.
- `loadPacks` emits `pack.loaded` events carrying the pack JSON; replay rebuilds the registry from the log.
- `src/packs/core.json`: Person, Tree, Stone (leaves with rolled defaults), Sighting, Survive, Shelter,
  Explore, and the `knows` / `has` edges. Noah now only places leaf types from loaded packs.
- `docs/PACKS.md`: the author guide, written so an LLM can produce a valid pack from it. ADR-0023.
- 27 tests. Checked in Chrome: same map as M1 for the same seed, packs shown, no console errors.
- **Next:** M3, Adam: people wander, see, explore, remember, choose by weighted goals.

## 2026-11-14 — M1 world core

- Core modules: `space` (fields from seeded fBm or derived from another field), `graph` (3 node kinds,
  typed edges stored once and read from both ends), `lazy` (values computed on read, threshold times),
  `queue` (event heap, deterministic ties, lazy cancel), `world` (one write channel, event log with `by`,
  `runUntil`, `replay`, `digest`), `noah` (genesis from config).
- Technical choices recorded in ADR-0022; time unit is days.
- 16 tests: determinism, replay from the log reproduces the world, leaves never land in water, etc.
- UI: terrain view and per-field views, seeded via `?seed=`, "New world" button, counts.
  Checked in Chrome: renders, no console errors.
- Not yet: Noah placing starting knowledge (needs sightings, comes with Adam in M3).
- **Next:** M2, Archie and the pack interpreter.

## 2026-11-14 — M0 skeleton (local)

- Entropy is its own character (ADR-0021 accepted; Molly keeps meaning-making).
- Skeleton: Vite 8, TypeScript 7, Vitest 4; `src/core` (pure) and `src/ui` (canvas).
- The no-DOM rule for `src/core` is enforced by `tsconfig.core.json` (no DOM lib); verified a
  `document` reference in core fails `npm run typecheck`.
- Seeded RNG (mulberry32) with `fork(salt)` for per-node generators; 4 tests pass.
- Placeholder page draws seeded dots; `?seed=` in the URL changes them.
- GitHub Actions workflow tests, builds and deploys to Pages on push to `main`.
- Repo: github.com/OmurMericArici/castellan (public). First Actions run green; live at
  https://omurmericarici.github.io/castellan/. Needed `gh auth refresh -s workflow` to push the workflow file.
- **M0 done. Next:** M1 world core.

## 2026-11-14 — VISION and SCOPE rewritten

- Accepted 0011 (first slice), 0013 (layers, one write channel), 0014 (ids, identity, folding).
- VISION and SCOPE rewritten for the node-world model; milestones M0–M5; castles moved to the parking lot as a future pack.
- Determination added to the mind (0016 addendum); Adam will later assign characters (0020).
- Proposed Entropy as its own character acting on space, entities and knowledge; knowledge drift
  as variants; lies as a separate future pack (ADR-0021).
- **Next:** decide ADR-0021; start M0.

## 2026-11-14 — Adam, interpreter, node kinds settled

- ADR-0019 accepted: entity / knowledge / mind; villages and house concepts are entities;
  events stay in the log; two peoples can name the same river differently.
- Packs run on our own interpreter: data + small language, no code, deterministic and bounded (ADR-0018).
- **Adam** runs the people (ADR-0020). Cast: Archie, Noah, Molly, Adam.
- **Next:** accept 0011, 0013, 0014; rewrite VISION and SCOPE; then M0.

## 2026-11-14 — The cast: Noah and Archie; packs; three node kinds

- **Noah** starts a world: space, first leaves and knowledge; the user configures Noah (ADR-0017).
- **Archie** owns packs; everything, including our house building, is a pack; packs can be
  written by an LLM and loaded mid-run; Archie checks them (ADR-0018). Format leaning: data + small expression language.
- Node kinds **entity / knowledge / mind** with "shared node, personal edge" (ADR-0019, under discussion).
- 0015 and 0016 accepted.
- **Next:** settle ADR-0019's open points and the pack format; accept 0011, 0013, 0014; rewrite VISION and SCOPE.

## 2026-11-14 — Knowledge and the mind

- "Beliefs" became **knowledge nodes**: typed, immutable, shared claims; many people link to one
  record; telling someone is adding a link; trade routes can emerge from who knows what (ADR-0015).
- The mind holds **weighted, tiered goals**, never one target; re-scores on every event,
  so a person carrying wood flees a bear and comes back later (ADR-0016).
- **Next:** accept 0011, 0013–0016; rewrite VISION and SCOPE; then M0.

## 2026-11-14 — Molly, wandering, seeing

- The System is named **Molly** (from Moira).
- Fixed docs that listed materials as a field: fields are properties of the space; trees/stones are leaf nodes.
- Proposed movement/perception/memory (ADR-0015): truth vs belief, one event per walking leg,
  sight events computed along the path, exploring as a behaviour whose outcome (beliefs) lives in the graph.
- Parking lot: desire paths becoming roads.
- **Next:** accept 0013/0014/0015 and 0011, rewrite VISION and SCOPE, then M0.

## 2026-11-14 — Time, the System, layers

- Time: event queue with lazy continuous values, threshold events, people woken by the queue (ADR-0007 accepted).
- The System: recognises/names, defines concepts (house concept → person works it into a house),
  influences people (night → fear → go home), manages entropy (ADR-0012; name pending).
- North star stated: emergence and environmental storytelling.
- Proposed: world layers vs technical engines, one write channel, event log as history (ADR-0013);
  integer ids, identity kept through transformation, folding settled composites (ADR-0014).
- Utility scoring for decisions; people released first, birth later; edges both ways.
- **Next:** name the System, accept 0013/0014/0011, rewrite VISION and SCOPE, then M0.

## 2026-11-14 — People, composites, value kinds

- Leaves: person, stone, tree, tool. People are decision makers; needs drive actions (ADR-0008).
- A house emerges from needy person + material + buildable spot, via a construction process;
  a person–house link meets the need. DF-style personal stories.
- Derived nodes are composite (house → walls, windows); WFC and the actualizer live at that layer (ADR-0009).
- Measurable values (needs, damage) are derived; happiness is relative (ADR-0010).
- Proposed new first slice "from people to a village" (ADR-0011), superseding the castle slice.
- **Next:** time model, material fate, decision mechanism; then accept ADR-0011 and rewrite VISION/SCOPE.

## 2026-11-14 — Space, leaves, time

- Space with fields is the root; outside input only at the leaves; cities etc. must emerge (ADR-0006).
- Graph not tree, single source of truth, actualizer can't contradict the graph (ADR-0005 accepted).
- Time: random tick vs event queue written up (ADR-0007, open).
- New open questions: what is a leaf, how to measure abstract values like happiness.
- Decision records now carry a Discussion section for every decision moment.
- **Next:** decide the leaf type and time model, then choose the first slice.

## 2026-11-14 — The working principle

- Reframed: Castellan is a node-based world builder, not a castle generator.
  Units group upward (houses → village → city → kingdom → empire) and unfold downward.
- Two layers: story (node graph, abstract attributes, rules) and actualizer
  (physical form only). WFC moves into the actualizer. Drafted in MODEL.md, ADR-0005.
- Learning is a later stage; rules are hand-written for now. No neural network.
- Stack accepted: TypeScript + Vite (ADR-0002).
- **Next:** answer MODEL.md open questions, pick a new vertical slice to replace ADR-0003.

## 2026-11-13 — Day zero

- Started fresh (the old `Desktop/Code/WFC` experiment is reference only).
- Wrote vision, scope, inspirations and the first decision records.
- Working name: Castellan (the officer who kept a castle — and later its records, which fits the history/memory layers).
- **Next:** accept or change ADR-0002 and ADR-0003, then M0: Vite skeleton + Pages deploy.
