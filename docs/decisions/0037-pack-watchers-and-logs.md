# 0037 — Packs bring their own watchers and logs

- Status: accepted (built in M6; the requirements are the user's, the shape is Claude's and open to change)
- Date: 2026-11-14

## Context
The user wants to open a pack in the UI and see what that pack is doing: for
`psychopathy`, a table of how psychopathic each person is and the log lines that
have to do with psychopathy.

Today the only view is the person story (`src/ui/story.ts`), and it knows pack
content by name: it has word tables for `Gather`, `Forage`, `Attack`, `Murder`,
`Chat` and a special case for the `Murder` event. A new pack gets no words and no
view unless the UI code is edited. That breaks ADR-0027, and by ADR-0035 being
able to watch what you modelled is one of the tools a pack author needs.

## Options
- A — Keep views in UI code, one per pack. What we have; doesn't scale past our own packs.
- B — A generic inspector that shows everything and lets the user filter. No pack
  work, but nobody knows which values matter for a pack except its author.
- C — Each pack declares what to track and what to log; the UI is generic and
  only draws what packs declare.

## Decision
Option C. What the user asked for, point by point:

1. **Every pack has its own watchers and logs.** Opening a pack in the UI shows them.
2. **They are declared in the pack**: "track these" and "this node triggers this log".
3. **Each log type has a checkbox that makes it global**, so the user picks what
   to follow in the shared log.
4. **Each pack has its own log colour and style.**
5. **Log types are grouped**, and the UI lets the user expand a group and select from it.

### Sketch of the pack side (before building; see "As built" for what changed)
```json
"watch": {
  "style": { "color": "#a23b3b", "icon": "knife" },
  "tables": {
    "People": {
      "rows": "Person",
      "columns": {
        "Psychopathy": "traits.Psychopathy",
        "Bloodlust": "needs.Bloodlust",
        "Dread": "emotions.Dread",
        "Hates": "links.hates"
      },
      "sort": "Psychopathy"
    }
  },
  "logs": {
    "Killings": {
      "Murder": { "on": "happened", "if": "event.name == \"Murder\"", "text": "{actor.name} killed {about.name}", "global": true },
      "Stalking": { "on": "started", "if": "action == \"Murder\"", "text": "{self.name} started stalking {target.name}" }
    },
    "Mind": {
      "Urge": { "on": "urgent", "if": "need == \"Bloodlust\"", "text": "{self.name} can't hold it back any more" }
    }
  }
}
```
- **Tables** ("track these"): rows are the nodes of a type, columns are
  expressions in that node's scope. Values are read live; nothing is stored.
- **Logs** ("this node triggers this log"): the first level is the group, the
  second the log type. Each type says what triggers it (an action of a method
  starting, finishing or failing; a need or emotion crossing its line; a world
  event; an edge added or removed; a meeting; a death), an optional condition and
  a line of text with expressions in braces. `global` is only the pack's
  suggestion for the checkbox's starting state.
- A `log` effect for steps and reactions covers what a trigger can't describe.
- Words for methods (what `story.ts` hard-codes today) move into the packs, so
  the person story is built from the same declarations.

### UI side
- The pack list gets an expandable panel per pack: its tables, then its own log.
- A log picker: packs → groups → types, each level with a checkbox; groups
  expand and collapse. Checked types appear in the global log.
- Lines carry their pack's colour and icon everywhere they appear.
- The choice is kept between runs (URL or local storage).

### Where log lines come from
Proposed: they are **derived from the event log** by a DOM-free module in
`src/core`, the way `StoryBook` works today. Watching never changes the world: no
state, no randomness, and turning a log on or off can't alter a run (ADR-0013).
The `log` effect is the one exception that writes an event, because a reaction's
condition can't be worked out again afterwards.

## Consequences
- Format grows (`watch`, a `log` effect, text with `{…}`); Archie checks names,
  triggers and colours. PACKS.md gets a section.
- `story.ts` loses its word tables and special cases. The M6 timeline could be
  the global log, which would make this part of M6 instead of extra work.
- Every default pack needs a `watch` block; a blind test should cover it.
- A pack that extends another pack's types should be able to add logs for them.

## As built (2026-11-14, format 0.7)
- `watch` in a pack: `color`, optional `mark` (one or two characters), `tables`, `logs`.
- Tables: `rows` (an entity type), optional `where`, `columns` (name → expression),
  optional `sort`. Rows of `Person` read the whole mind scope; other rows read
  `self.*`, lazy values included. The dead are left out.
- Logs: group → type → `on`, `if`, `text`, `global`, `emphasis` (`strong`,
  `normal`, `quiet`). Triggers: `started`, `happened`, `witness`, `hears`, `met`,
  `linked`, `unlinked`, `learned`, `died`, `created`, `signal`.
- All lines are derived from the event log by `src/core/watch.ts` (`Watcher`), which
  has no DOM and never writes. A test checks that watching leaves the world's digest
  unchanged.
- Methods carry `words` (`doing`, `did`, `purpose`, `name`) and entities `plural`.
  `story.ts` and the person panel lost every pack name except `Rest` (staying out
  late); a person's moments are the pack log lines about them.
- UI: a world log, and one panel per pack with its tables, a picker (pack → group →
  type, each with a checkbox, groups expand) and its own log. Choices are kept in
  local storage. Clicking a person's row selects them.
- Different from the sketch: no `log` effect and no `urgent` trigger (a need
  crossing its line is not in the event log), `icon` became `mark`.

## Open questions
- ~~Is this built inside M6 (as the timeline and story panel) or after it?~~ Inside M6 (2026-11-14).
- ~~Derived lines or stored lines.~~ Derived only; the `log` effect was left out.
- ~~Does the per-person story use the same lines, filtered by person?~~ Yes.
- Summary values for a table (mean, count).
- A `log` effect and a trigger for needs and emotions crossing their line.
- Lines are worded when they are read, not when they happened: a condition such as
  `rel.grudge` sees the world a moment later. Fine while the UI reads every frame.

## Discussion
- 2026-11-14 — User: another wish is for every pack to have its own watchers and
  logs. For example, opening psychopathy in the UI should show a table of how
  psychopathic people are, and the logs that have to do with psychopathy. These
  details must be stated in the pack, like "track these" or "this node triggers
  this log". There should be a checkbox in the UI to make logs global, so the user
  can choose what to follow. Every pack should have its own log colour and style,
  and log types should be groupable so the user can expand a group in the UI and
  select easily.
- 2026-11-14 — User: do ADR-0037 inside M6. Accepted and built the same day as the
  M6 timeline and story panel.
