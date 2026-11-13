# 0021 — Entropy as its own character

- Status: accepted
- Date: 2026-11-14

## Context
ADR-0012 gave Molly four jobs, one of them entropy (growth, drought, wear,
ageing). Entropy touches everything, though: the space (drought), the graph
(houses wear, people age) and knowledge (claims fade, drift into variants).
Molly's other jobs are about *meaning*: recognising, naming, defining concepts.

## Decision
Split entropy out of Molly into its own character, **Entropy**, that works on
three things:

| Target | Examples |
|---|---|
| Space | droughts, floods, seasons shifting fields |
| Graph (entities) | trees regrow and fall, houses wear, people age |
| Knowledge | confidence fades, links are forgotten, claims **drift** into variants |

### Knowledge drift
Claims are immutable (ADR-0015), so drift never edits a claim. It creates a
**variant** linked to the original (`variantOf`): "oak at (40,17)" drifts to
"oak at (43,15)", or "a big oak" to "a forest". The person's `knows` edge moves
to the variant. Two people can then hold the original and a variant, and the
story notices the difference.

### Lies are not entropy
Drift is accidental. Knowledge given wrong **on purpose** is a lie, a whole new
dimension (motives, trust, discovery). It will be its own pack later and reuse
the same `variantOf` mechanism, with a teller who knows the truth.

## Consequences
- Molly keeps: recognise and name, define concepts, influence people.
- Supersedes the entropy part of ADR-0012.
- Name stays "Entropy" for now.

## Discussion
- 2026-11-14 — User wonders whether entropy should be a separate character tied
  to knowledge, space and the graph itself. The entropy–knowledge relation also
  brings out lies: knowledge can degrade (variants of claim A) or be given wrong
  on purpose. Lying is a completely new dimension; add it later as its own pack.
- 2026-11-14 — User: Entropy is separate. Accepted.
