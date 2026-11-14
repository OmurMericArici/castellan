# 0031 — How ADR-0029 and ADR-0030 were built

- Status: accepted (technical; designed by Claude, open to change)
- Date: 2026-11-14

## Decision

### Pack order and `extends`
- Before checking, packs are put in the given order, moved after what they
  require (stable). Then each pack's `extends` is merged, in that order, into the
  owner's raw type definition: `attrs` and `serves` merge by key, everything else
  is replaced, `kind` can't change. Each merge is checked on its own so errors are
  blamed on the extending pack; cross-reference errors on a changed type say which
  packs changed it. Later packs win.
- Duplicate definitions are still errors; `extends` is the only way to change
  another pack's type.

### Traits
- Role `trait` with `distribution`: histogram bins `[from, to, weight]` or an
  expression with random functions. Adam draws the value once per person (seeded
  by person) and stores it on the `has` edge as `value`; `traits.X` reads it.

### Death and events
- Effect `kill`: emits `died`, the node gets `dead: true`, Adam cancels the
  person's tickets, the person leaves `people()`; the node and history remain.
- Effect `event`: Adam hands it to Molly; Molly emits `happened` with the witness
  list, then runs `witness` reactions for people within `seenWithin` and `hears`
  for the rest per `heard` (everyone / village / nobody). `event.known` tells
  hearers whether anyone saw who did it.

### ADR-0029 primitives
1. **Availability:** an action whose first step is a non-optional `goto` with no
   destination is skipped while choosing.
2. **Bonds:** `bond.<edge>.<field>` reads the person's end of the edge (declared
   fields default to 0); `link` takes `add`, `set`, `mutual`.
3. **Fields:** `goto: { field, above }` finds the nearest walkable cell edge next
   to where the field is above the level (preferring cells that are themselves
   slightly wet); `field.<name>` reads the value where the person stands.
4. **`extends`** as above.
5. **Regrow:** a number attribute with `regrow` and `max` regains that much per
   day; Entropy applies it once a day to things below max.
6. **Randomness** in steps, effects and reactions, seeded per person, step or reaction.
7. **Other person:** `other.needs.X`, `target.needs.X`, `other.<attr>`; mutual links.
8. **Fallbacks:** `goto` takes a list of alternative targets.
9. **Counting:** `links.<edge>`.
- Also: `goto` to a `person` (nearest living, within range, with `where`), and
  chasing a moving target up to three times.
- Packs can suggest starting counts (`place`); Noah's config overrides them
  (`withPackPlacement`).

### Robustness and speed
- The loop guard now pauses a person briefly instead of freezing them in an
  action that counts as ongoing.
- Knowledge and mind scope are cached per person until the log grows: 12 days
  with five packs went from ~3 s back to ~1 s.

## Consequences
- With psychopathy's default 3% rate, most six-person worlds have no killer; a
  pack (or the user) can raise it with `extends`. Seed 1 with a raised rate: two
  unseen murders, dread, hiding.
- Grudges are rarer now that berries regrow (fewer emptied bushes); the hostility
  test moved to a seed where they still occur.

## Discussion
- 2026-11-14 — Built after the user asked for all primitives plus ADR-0030.
