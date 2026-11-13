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

const VERB: Record<string, string> = { Explore: "explored", Wander: "wandered", Rest: "rested" };
const ONGOING: Record<string, string> = { Explore: "exploring", Wander: "wandering", Rest: "resting" };
const PLURAL: Record<string, string> = { Tree: "trees", Stone: "stones", Person: "people" };

export class StoryBook {
  private read = 0;
  private readonly segments = new Map<NodeId, Segment[]>();
  private lastDusk = -Infinity;

  update(world: World): void {
    const g = world.graph;
    for (; this.read < world.log.length; this.read++) {
      const { t, event: e } = world.log[this.read]!;
      if (e.kind === "signal" && e.name === "dusk") this.lastDusk = t;
      if (e.kind === "activity") {
        const list = this.segments.get(e.person) ?? [];
        const last = list[list.length - 1];
        if (last && last.action === e.activity.action) continue;
        if (last) last.end = t;
        const seg: Segment = { action: e.activity.action, start: t, seen: new Map() };
        if (e.activity.action === "Rest" && t - this.lastDusk < 1 - DUSK && t > this.lastDusk) {
          const late = Math.round((t - this.lastDusk) * 24 * 60);
          if (late >= 10) seg.lateMinutes = late;
        }
        list.push(seg);
        this.segments.set(e.person, list);
      }
      if (e.kind === "edge.created" && e.edge.type === "knows") {
        const subject = g.edgesOf(e.edge.to, "about")[0];
        const type = subject ? g.node(subject.to)?.type : undefined;
        const seg = this.segments.get(e.edge.from)?.at(-1);
        if (seg && type) seg.seen.set(type, (seg.seen.get(type) ?? 0) + 1);
      }
    }
  }

  /** Newest first. */
  lines(person: NodeId, max = 12): string[] {
    const list = this.segments.get(person) ?? [];
    const out: string[] = [];
    for (let i = list.length - 1; i >= 0 && out.length < max; i--) {
      const s = list[i]!;
      const span = `${clockLabel(s.start)}${s.end !== undefined ? ` – ${clockLabel(s.end).replace(/^Day \d+, /, sameDay(s.start, s.end) ? "" : "$&")}` : " – now"}`;
      const verb = s.end === undefined ? (ONGOING[s.action] ?? s.action.toLowerCase()) : (VERB[s.action] ?? s.action.toLowerCase());
      const parts = [verb];
      if (s.lateMinutes) parts.push(`after staying out ${s.lateMinutes} min past dark`);
      const seen = [...s.seen].map(([type, n]) => `${n} new ${n === 1 ? type.toLowerCase() : (PLURAL[type] ?? `${type.toLowerCase()}s`)}`);
      if (seen.length) parts.push(`saw ${seen.join(", ")}`);
      out.push(`${span} · ${parts.join(" · ")}`);
    }
    return out;
  }
}

function sameDay(a: number, b: number): boolean {
  return Math.floor(a) === Math.floor(b);
}
