# 0016 — Mind: weighted goals, never one target

- Status: accepted
- Date: 2026-11-14

## Context
A person who chases one target at a time feels like a robot. While carrying
wood to build a house, a person who sees a bear must drop everything and run.
ADR-0008 chose utility scoring; this record says what is being scored.

## Proposal

### Goals, not a target
Every person always holds **several goals at once**, each with a **priority
tier** and a **weight**:

| Tier | Goals (examples) | Weight comes from |
|---|---|---|
| 1 Survive | flee danger, eat, drink, stay warm | threat seen, hunger, thirst, cold |
| 2 Secure | shelter, store food | shelter need, season |
| 3 Belong | partner, children, community | age, loneliness |
| 4 Grow | build a better house, learn, trade | personality, opportunity |

Weights are lazy values (ADR-0007): they rise and fall with needs and with what
Molly signals (night → fear raises "be home").

### Choosing what to do
On every event that concerns the person (arrival, sight, threshold crossed,
night falls) the mind re-scores the actions it knows are possible:

```
score(action) = Σ over goals  weight(goal) × contribution(action, goal)
```

- **Tiers pre-empt:** an urgent tier-1 goal (above a threshold) beats any lower
  tier outright. Below the threshold, everything competes by score.
- **Commitment bonus:** the current action gets a small bonus so the person
  doesn't dither between two equal options.
- **One action serves many goals:** gathering wood helps shelter *and* warmth;
  that is why it gets done.

### Plans are steps toward goals
"Build a house" breaks into steps (find wood → carry wood → build). The plan is
kept, but every step is re-scored like any other action, so it can be interrupted
and resumed: drop the wood, flee the bear, come back for the wood later (if the
person still knows where it is).

### Personality (later)
Per-person multipliers on goal weights (a brave person's "flee" rises slower).
Gives individual stories without new rules.

## Addendum (2026-11-14): determination
The commitment bonus becomes **determination**, a per-person value:
- The current action keeps a bonus that scales with determination, so people
  don't keep switching between actions.
- It also raises the bar for pre-emption: danger must exceed
  `urgentThreshold + determination × commitment` before survival takes over.
  A stubborn person keeps carrying the wood a while longer despite the risk; a
  timid one drops it at the first sign.
- Commitment grows the longer and the more invested a person is in a task
  (almost home with the wood → harder to give up).
- With traits (later, assigned by Adam) determination becomes part of character.

## Consequences
- Re-scoring happens only on events, so it fits the event queue and stays cheap.
- Every interruption is an event in the person's history: "dropped the wood and
  ran from a bear" is a story nobody wrote.
- When know-how knowledge arrives, the set of "actions it knows are possible"
  comes from the person's knowledge links, which is where GOAP-style planning fits.

## Discussion
- 2026-11-14 — User: people's minds must never be aimed at one single target.
  They should have goals with weights and priority order: survive, have
  children, build a house. So to build a house they first need to carry wood,
  but if they see a bear on the way they run.
- 2026-11-14 — User: "these are good." Accepted.
- 2026-11-14 — User: people need a kind of determination so they don't keep
  switching actions. Carrying wood under danger, they should keep going a bit
  despite the risk, be stubborn. Character traits will add more depth. → Addendum.
