import { clockLabel, DUSK } from "../core";
import type { NodeId, World } from "../core";

/**
 * Turns the event log into short per-person story lines. Reads the log
 * incrementally; everything here is derived, nothing is stored in the world.
 */
interface Segment {
  action: string;
  start: number;
  end?: number;
  seen: Map<string, number>;
  /** Minutes they stayed out after dusk before resting. */
  lateMinutes?: number;
}

interface Moment {
  t: number;
  text: string;
}

const VERB: Record<string, string> = { Explore: "explored", Wander: "wandered", Rest: "rested", Scout: "scouted for trees", Gather: "gathered wood", Deliver: "carried wood to the site", Build: "built", Forage: "foraged", SeekFood: "looked for food", Confront: "confronted someone" };
const ONGOING: Record<string, string> = { Explore: "exploring", Wander: "wandering", Rest: "resting", Scout: "scouting for trees", Gather: "gathering wood", Deliver: "carrying wood to the site", Build: "building", Forage: "foraging", SeekFood: "looking for food", Confront: "confronting someone" };
const PLURAL: Record<string, string> = { Tree: "trees", Stone: "stones", Person: "people" };

export class StoryBook {
  private read = 0;
  private readonly segments = new Map<NodeId, Segment[]>();
  private readonly moments = new Map<NodeId, Moment[]>();
  private lastDusk = -Infinity;

  private note(person: NodeId, t: number, text: string): void {
    const list = this.moments.get(person) ?? [];
    list.push({ t, text });
    this.moments.set(person, list);
  }

  update(world: World): void {
    const g = world.graph;
    for (; this.read < world.log.length; this.read++) {
      const { t, by, event: e } = world.log[this.read]!;
      if (e.kind === "signal" && e.name === "dusk") this.lastDusk = t;
      if (e.kind === "met") {
        const name = (id: NodeId) => String(g.node(id)?.attrs["name"] ?? "someone");
        const grudge = (a: NodeId, b: NodeId) => g.edgesOf(a, "grudge").some((x) => x.from === a && x.to === b);
        if (grudge(e.a, e.b)) this.note(e.a, t, `ran into ${name(e.b)} and got angry`);
        if (grudge(e.b, e.a)) this.note(e.b, t, `ran into ${name(e.a)} and got angry`);
      }
      if (e.kind === "activity") {
        const list = this.segments.get(e.person) ?? [];
        const last = list[list.length - 1];
        if (last && last.action === e.activity.action) continue;
        if (last) last.end = t;
        const seg: Segment = { action: e.activity.action, start: t, seen: new Map() };
        if (e.activity.action === "Rest" && t > this.lastDusk && t - this.lastDusk < 1 - DUSK) {
          const late = Math.round((t - this.lastDusk) * 24 * 60);
          if (late >= 10) seg.lateMinutes = late;
        }
        list.push(seg);
        this.segments.set(e.person, list);
      }
      if (e.kind === "edge.created") {
        const edge = e.edge;
        if (edge.type === "knows") {
          const subject = g.edgesOf(edge.to, "about")[0];
          const type = subject ? g.node(subject.to)?.type : undefined;
          const seg = this.segments.get(edge.from)?.at(-1);
          if (seg && type) seg.seen.set(type, (seg.seen.get(type) ?? 0) + 1);
        } else if (edge.type === "builds" && by === "molly") {
          this.note(edge.from, t, "Molly marked a spot for their house");
        } else if (edge.type === "grudge") {
          const other = g.node(edge.to);
          this.note(edge.from, t, `found something emptied by ${String(other?.attrs["name"] ?? "someone")} and now holds a grudge`);
        } else if (edge.type === "livesIn") {
          this.note(edge.from, t, "finished their house and moved in");
        } else if (edge.type === "memberOf") {
          const village = g.node(edge.to);
          const residents = g.edgesOf(edge.from, "livesIn").filter((x) => x.to === edge.from);
          for (const r of residents) this.note(r.from, t, `their house became part of ${String(village?.attrs["name"] ?? "a village")}`);
        }
      }
    }
  }

  /** Newest first. */
  lines(person: NodeId, max = 14): string[] {
    const entries: Moment[] = [];
    for (const s of this.segments.get(person) ?? []) {
      const sameDay = s.end !== undefined && Math.floor(s.start) === Math.floor(s.end);
      const end = s.end === undefined ? "now" : sameDay ? clockLabel(s.end).replace(/^Day \d+, /, "") : clockLabel(s.end);
      const verb = s.end === undefined ? (ONGOING[s.action] ?? s.action.toLowerCase()) : (VERB[s.action] ?? s.action.toLowerCase());
      const parts = [verb];
      if (s.lateMinutes) parts.push(`after staying out ${s.lateMinutes} min past dark`);
      const seen = [...s.seen].map(([type, n]) => `${n} new ${n === 1 ? type.toLowerCase() : (PLURAL[type] ?? `${type.toLowerCase()}s`)}`);
      if (seen.length) parts.push(`saw ${seen.join(", ")}`);
      entries.push({ t: s.start, text: `${clockLabel(s.start)} – ${end} · ${parts.join(" · ")}` });
    }
    for (const m of this.moments.get(person) ?? []) entries.push({ t: m.t + 1e-9, text: `<strong>${clockLabel(m.t)} · ${m.text}</strong>` });
    return entries
      .sort((a, b) => b.t - a.t)
      .slice(0, max)
      .map((e) => e.text);
  }
}
