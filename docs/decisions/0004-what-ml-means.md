# 0004 — What "ML" means in v0.1

- Status: deferred — learning is a separate stage after hand-written rules work (2026-11-14)
- Date: 2026-11-13

## Context
"WFC + ML" can mean many things. Saying it precisely matters: it decides the
architecture, and a portfolio reviewer will ask. The original idea combines
**node similarity** with learning.

## Options
1. **Statistical learning from examples** — count adjacencies and parent/child
   pairs in example castles, turn them into weighted compatibility (like WFC's
   sample learning, extended across levels). Cheap, explainable, runs in the browser.
2. **Learned embeddings for similarity** — each node type gets a vector learned
   from the contexts it appears in (word2vec-style on the examples). Similar
   vectors = interchangeable types, which lets the solver substitute instead of
   failing on contradictions. Small enough to train in the browser.
3. **Discriminative model** (Karth & Smith 2019) — learn from good *and* bad
   examples, reject bad local patterns during solving.
4. **Neural generator** guiding collapse order or choices. Most impressive on paper,
   needs real training data we don't have.

## Settled so far
- 2026-11-14: no real neural network. "ML" here means learning from examples with lightweight methods (counting, weighting, simple embeddings), not training a model. Option 4 is out.

## Leaning
1 as the base in M3, 2 as the "node similarity" piece if time allows. 3 is a
strong follow-up. 4 is out for v0.1.

## Open questions
- How many example castles are enough, and who authors them (in-app editor vs JSON)?
- Is similarity used only for substitution, or also to weight choices?
