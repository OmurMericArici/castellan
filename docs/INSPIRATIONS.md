# Inspirations

What we look at, and **what exactly we take from it**. An entry without a
"take" line is just a bookmark; give it one or delete it.

Status: `core` = shapes the design · `reference` = useful for a specific part ·
`to review` = suggested, not read yet.

## Our own starting points

### Minecraft castle building — `core`
Where the idea came from: procedurally generating castles in Minecraft.
**Take:** the castle as the first target; parts that must connect believably
(walls meet towers, a gate sits in a wall); eventually a voxel look.

### Vector-Based Synthesis Lab (own earlier experiment, `Desktop/Code/WFC`) — `reference`
Learned point patterns in continuous 2D space: categories are clustered
(DBSCAN) into sub-patterns, then two kinds of learned rules drive synthesis —
additive *proposal* kernels (A→A, A→B: where the next point should go) and
multiplicative *modulation* kernels (personal space / exclusion).
**Take:** the habit of *learning from examples instead of writing rules*,
intra- vs inter-category rules (maps to sibling vs parent/child compatibility),
and the diagnostic panels (score-field heatmaps) as a model for the step-through
view. Code is not reused.

### Minecraft random tick — `reference`
Each game tick, a few random blocks per chunk get a chance to update (crops grow, grass spreads).
**Take:** option A of the time model (ADR-0007): simple per-node chances.

## Suggested (to review)

### Gillespie algorithm / discrete-event simulation — `to review`
Sample when each possible event happens, run the earliest, re-sample what it affected
(Gillespie 1977; Gibson & Bruck's "next reaction method" for the efficient version).
**Take:** option B of the time model (ADR-0007), exact timestamps for history.


### WaveFunctionCollapse — Maxim Gumin (2016) — `to review`
github.com/mxgmn/WaveFunctionCollapse. Learns adjacency from a sample bitmap,
then fills a grid by lowest-entropy collapse + propagation.
**Take:** the solver core for M1; "rules come from a sample" is already a tiny form of learning.

### Model Synthesis — Paul Merrell (2007–2009) — `to review`
WFC's predecessor; generates large models in overlapping blocks.
**Take:** ideas for solving big areas in chunks and recovering from contradictions.

### Hierarchical Semantic WFC — Alaka & Bidarra (FDG 2023) — `to review`
WFC with meta-tiles arranged in a hierarchy, refined from coarse to fine.
**Take:** closest prior art to our level structure. Read before M2 so we know what is genuinely new here.

### Procedural Modeling of Buildings — Müller et al. (2006) / CityEngine — `to review`
Shape grammars that split a mass into floors, facades, windows.
**Take:** the abstract→concrete "expand" step; how to keep child parts aligned to the parent.

### Joris Dormans — mission/space graph grammars (Unexplored) — `to review`
Generate an abstract graph first, then turn it into space.
**Take:** layout level as a graph (keep connects to courtyard connects to gate) before geometry.

### Oskar Stålberg — Townscaper, Bad North — `to review`
Real-time WFC on irregular grids, very readable results.
**Take:** presentation bar for the demo; watching it build is half the appeal.

### Boris the Brave — blog posts on WFC and constraint-based generation — `to review`
**Take:** practical tricks: backtracking, path/connectivity constraints, weighting.

### Karth & Smith — "WFC is constraint solving in the wild" (2017), "Addressing the fundamental tension of PCGML with discriminative learning" (2019) — `to review`
**Take:** the second paper learns from positive *and* negative examples on top of WFC. Directly relevant to M3.

### GDMC — Generative Settlement Design in Minecraft (competition) — `to review`
Settlement generators judged on adaptation, function, narrative; has a "chronicle" side challenge.
**Take:** a benchmark mindset and a community that cares about exactly our long road.

### Dwarf Fortress — `core`
World/legends generation and per-creature simulation.
**Take:** people simulated one by one, each with a readable personal history (ADR-0008).

### Caves of Qud sultan histories — Grinblat & Bucklew (2017) — `to review`
Generate events first, then invent the causes that explain them.
**Take:** "rationalise after the fact" as a cheap way to make history explain the castle.

### RimWorld — `to review`
Colonists with needs build from real materials; a storyteller paces events.
**Take:** needs → construction from material leaves found in the world; construction as a visible process.

### Utility AI (Dave Mark) and GOAP (Jeff Orkin, F.E.A.R.) — `to review`
Utility AI: score every possible action, pick the best. GOAP: plan a chain of actions whose preconditions are met.
**Take:** utility scoring = our fuzzy triple for one need; GOAP fits once knowledge nodes become action preconditions (MODEL.md 9).

### Lévy walks (animal foraging research) — `to review`
Searchers make many short moves and occasional long ones; efficient when targets are sparse.
**Take:** leg choice for exploration (ADR-0015).

### Talk of the Town — James Ryan et al. — `to review`
NPCs hold beliefs about each other that spread, mutate and decay.
**Take:** the model for rumour/memory nodes, much later.
