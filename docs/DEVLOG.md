# Devlog

Newest first. One entry per session: what changed, what was learned, what's next.
Add a screenshot/GIF path whenever something is visible.

## 2026-11-24 — Direction: back to the settlement chain (docs only)

- Reviewed the scope: the packs and the parking lot had drifted from settlements into depth
  of the mind (hostility, psychopathy, a mostly social-psychology parking lot).
- The user kept the definition: Castellan is about the bonds between house, village, town,
  city, castle and trade. ADR-0038 records it; SCOPE.md gets a direction rule.
- Parking lot split into Chain (ordered), Engine/tools/form, Mind (not now) and Done.
  No item was deleted.
- Learned: drift came one pack at a time, each step reasonable on its own; a one-line test
  per pack catches it earlier than a review.
- **Next:** rest of M6 (Noah config in the URL, README with GIF, WFC house layouts), then the
  first Chain item.

## 2026-11-14 — M6: packs bring their own watchers and logs

- The user moved ADR-0037 into M6; it is the milestone's timeline and story panel. Format 0.7.
- Engine: `watch` blocks checked by Archie (colour, tables, grouped log types, text with `{…}`),
  method `words` and entity `plural`; `src/core/watch.ts` derives log lines and reads tables from
  the event log without writing anything (a test compares world digests).
- Content: all six default packs got a `watch` block and words. `story.ts` and the person panel no
  longer know pack names (one left: `Rest`, for staying out late); relations in the panel are every
  edge to another person.
- UI: world log, a panel per pack (tables, picker with pack/group/type checkboxes, own log),
  choices kept in local storage. Checked in the browser on seed 8.
- Dates: every "2026-11-15" in the docs was wrong (all commits are from 2026-11-14) and is fixed.
- Learned: need and emotion crossings are not in the event log, so a derived log can't see them yet;
  the pack JSON files were re-indented by the script that added the blocks.
- **Next:** rest of M6 (WFC house layouts, Noah config in the URL, README GIF); the user's calls on
  ADR-0034 order and ADR-0036 ties.

## 2026-11-14 — Behaviour coverage: primitives, a principle, villages (docs only)

- Listed what modelling real human behaviour still needs, starting from the user's inquiry and
  association ideas; 21 draft items in the parking lot. Sorted against format 0.6: five are packs
  today, eight need a small addition, eleven need something new.
- ADR-0034 (proposed): five primitives that cover most of it: association, a `claim` effect,
  fields packs can write with walking cost in packs, unknowns in the planner, missing names
  (including home as a fading memory).
- ADR-0035 (accepted): as an engine, Castellan must offer every tool needed to model human behaviour.
- ADR-0036 (direction accepted): a village is an entity and its members, not a radius; recognition
  by ties is proposed and not built.
- ADR-0037 (proposed): packs declare their own watchers (tables) and logs (grouped types, pack colour);
  the UI shows them per pack with a checkbox to make a log type global. `story.ts` hard-codes pack words today.
- Learned: `other`'s mind can't be read in expressions, the dead are invisible to the living, fields
  are written once at genesis, and Molly has a fixed `MATERIAL_RADIUS` in code.
- No code changed. **Next:** the user decides the order and timing of ADR-0034 and the ties for
  ADR-0036; otherwise M6.

## 2026-11-14 — M5b: the mind

- Decided with the user: build ADR-0032 before M6. No predefined decision tree: each method states its
  own local `requires` / `gives` over named facts, the engine plans backward at every decision, and
  "house → wood → tree" emerges. Requirements are also derived from steps (`goto known Tree`).
- Emotions are their own role (Fear, Anger, Dread moved from needs). One `scales` mechanism lets traits,
  needs and emotions multiply goal weights, method scores, restraint and each other.
- Methods are know-how (`knowsHow` edges): some known from birth, learned by watching and through the new
  `talk` pack, preferred more or less; witnesses push a killer away from the method they used.
- Events become shared `Report` claims (who did it, if seen) that spread by telling; `did.Murder` in
  reactions. People remember each other from meetings. Determination is a trait.
- `hostility` got `Attack`: restraint 0.97, worn down by anger and fear; an ordinary person very angry and
  very afraid may kill.
- Found while probing: preference ran away (short, always-finishing Wander reached the cap and pushed out
  exploring) → success now saturates at 1.5 and failure alone never makes someone forget; people forgot
  how to drink after repeated failures at an unreachable shore (same fix); `Loneliness`/`Belong` clashed
  with the blind-test friendship pack → `Isolation`/`Company`.
- Seed 8: two people who couldn't build were taught by neighbours; all six houses got built.
- 74 tests (new `mind.test.ts`). PACKS.md format 0.6. ADR-0033. `scripts/probe.ts` prints a run summary.
- Blind-test packs migrated mechanically to 0.6 (`needs.Anger`/`needs.Fear` → `emotions.*`); all three still pass check-pack.
- **Next:** M6: WFC house layouts, story panel polish, Noah config in the URL, README with GIF → v0.1.

## 2026-11-14 — All primitives, traits, murder, pack order

- Built all nine ADR-0029 primitives: un-startable actions aren't choices; bond data on edges (read, add,
  set, mutual); field targets (lake shores) and field values where people stand; `extends` with
  order-based overrides; regrowing attributes; randomness in steps and reactions; effects on the other
  person; goto alternatives; link counts.
- ADR-0030: traits drawn by Adam from a histogram or generating function; `kill` (death); world events
  that Molly notices (witnesses vs those who hear); pack `place` suggestions; enable/disable/order packs
  (demo: pack list at the bottom, `?packs=` in the URL).
- New default pack `psychopathy`. With a raised rate (via `extends`), seed 1: Tuna (psychopathy 1.00)
  stalks and kills Yaz on day 3 and Vera on day 5, unseen; the village hears, dreads and hides.
- Found while probing: killers struck at a victim's old position (now: chase moving targets); a guard
  that left people waiting forever; shore targets on dry cells; performance (knowledge cached per log length).
- 62 tests. ADR-0031. PACKS.md format 0.5.

## 2026-11-14 — Blind pack test

- New tool: `npm run check-pack -- pack.json` (Archie + a short simulation + runtime warnings).
- Three fresh agents wrote packs from PACKS.md + core.json alone: friendship, drinking water, food storage
  (`examples/blind/`). All accepted by Archie on the first try and all work in simulation, each with a
  compromise. Gaps and proposed primitives in ADR-0029.
- Fixed: `spread` on the water field could never succeed; checker reporting; PACKS.md gaps they hit.

## 2026-11-14 — M5 Behaviour in packs

- Engine work: Adam no longer knows verbs. Actions are step programs (goto, work, take, give, effect,
  if, finish, stay); reactions fire on sees / meets / found-empty / finished / dusk / dawn; memory rules
  (recall, fade, reinforce, forget) live on knowledge types; people notice each other (`meets`).
- Content work: `core` and `shelter` rewritten as steps (Gather split into Gather + Deliver); all earlier
  tests pass unchanged. New default packs `hunger` and `hostility`, written from PACKS.md only.
- Emergent: a feud in seed 3 (two people hold grudges against Una, who later holds one back).
- Pack rules that fail at runtime are skipped with a warning instead of crashing the world.
- PACKS.md rewritten for format 0.4. ADR-0028. 50 tests.
- **Next:** M6: WFC house layouts, story panel polish, Noah config in the URL, README with GIF → v0.1.

## 2026-11-14 — Engine, not game

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
