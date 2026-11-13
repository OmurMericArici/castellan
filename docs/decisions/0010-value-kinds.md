# 0010 — Measurable values are derived; unmeasurable values are relative

- Status: accepted (the exact form of relative values is open)
- Date: 2026-11-14

## Context
Open question 6: how do you measure "happiness", who is "the happiest"?
Chances are normalised and counts are counts, but abstract values were undecided.

## Options
- Derived only: every abstract value is a function of countable ones.
- Relative only: abstract values have no scale, only comparisons.
- Normalised by convention (0–1).

## Decision
There are two kinds of "abstract" value, and they are handled differently:
- **Measurable abstractions** (needs, building damage, food supply) are
  **derived** from countable state.
- **Unmeasurable abstractions** (happiness) are **relative**: they exist as
  comparisons, not absolute numbers.
- Both are used at once: happiness is computed relative to something, from the
  derived needs.

## Consequences
- No free-floating abstract numbers; everything traces back to state.
- Still open: relative to *what* (neighbours, own past, expectations). MODEL.md question 6.

## Discussion
- 2026-11-14 — User: there is a difference between abstract-abstract and
  concrete-abstract things. Happiness can't be measured, but needs can; damage to a
  building can. Happiness is relative, while needs and values can be derived; doing
  both at the same time is even better.
