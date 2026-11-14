import { clockLabel, DUSK } from "../core";
import type { NodeId, Watcher, World } from "../core";

/**
 * Turns the event log into short per-person story lines. Reads the log
 * incrementally; everything here is derived, nothing is stored in the world.
 * What people did is put into words by the packs (method `words`, entity
 * `plural`), and the moments come from the packs' own logs (ADR-0037).
 */
interface Segment {
  action: string;
  start: number;
  end?: number;
  seen: Map<string, number>;
  /** The method this was a step toward (ADR-0033). */
  for?: string;
  /** Who told them things during this stretch, and how many. */
  told: Map<NodeId, number>;
  /** Minutes they stayed out after dusk before resting. */
  lateMinutes?: number;
  /** Whether they were staying put at the end of it (not walking). */
  still: boolean;
}

interface Entry {
  t: number;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export class StoryBook {
  private read = 0;
  private readonly segments = new Map<NodeId, Segment[]>();
  private lastDusk = -Infinity;
  private readonly names = new Map<NodeId, string>();

  update(world: World): void {
    const g = world.graph;
    for (; this.read < world.log.length; this.read++) {
      const { t, event: e } = world.log[this.read]!;
      if (e.kind === "node.created" && e.node.type === "Person") this.names.set(e.node.id, String(e.node.attrs["name"] ?? "someone"));
      if (e.kind === "signal" && e.name === "dusk") this.lastDusk = t;
      if (e.kind === "activity") {
        const list = this.segments.get(e.person) ?? [];
        const last = list[list.length - 1];
        const still = e.activity.leg === undefined;
        if (last && last.action === e.activity.action) {
          last.still = still;
          continue;
        }
        if (last) last.end = t;
        const seg: Segment = { action: e.activity.action, start: t, seen: new Map(), told: new Map(), still, ...(e.activity.for ? { for: e.activity.for } : {}) };
        // Staying out late: only if they were out doing something, not already staying somewhere.
        const inside = last !== undefined && last.still;
        if (e.activity.action === "Rest" && !inside && t > this.lastDusk && t - this.lastDusk < 1 - DUSK) {
          const late = Math.round((t - this.lastDusk) * 24 * 60);
          if (late >= 10) seg.lateMinutes = late;
        }
        list.push(seg);
        this.segments.set(e.person, list);
      }
      if (e.kind === "edge.created") {
        const edge = e.edge;
        if (edge.type !== "knows") continue;
        const claim = g.node(edge.to);
        if (claim?.type === "Report") continue;
        const teller = typeof edge.fromData?.["from"] === "number" ? (edge.fromData["from"] as NodeId) : undefined;
        const seg = this.segments.get(edge.from)?.at(-1);
        if (!seg) continue;
        if (teller !== undefined) {
          seg.told.set(teller, (seg.told.get(teller) ?? 0) + 1);
        } else {
          const subject = g.edgesOf(edge.to, "about")[0];
          const type = subject ? g.node(subject.to)?.type : undefined;
          if (type) seg.seen.set(type, (seg.seen.get(type) ?? 0) + 1);
        }
      }
    }
  }

  /** Newest first: what they did, with the pack log lines about them in between. */
  lines(world: World, watcher: Watcher, person: NodeId, max = 14): string[] {
    const types = world.registry.types;
    const words = (action: string) => types.get(action)?.action?.words ?? {};
    const entries: Entry[] = [];
    for (const s of this.segments.get(person) ?? []) {
      const sameDay = s.end !== undefined && Math.floor(s.start) === Math.floor(s.end);
      const end = s.end === undefined ? "now" : sameDay ? clockLabel(s.end).replace(/^Day \d+, /, "") : clockLabel(s.end);
      const w = words(s.action);
      const verb = (s.end === undefined ? w.doing : w.did) ?? s.action.toLowerCase();
      const parts = [s.for ? `${verb} to ${words(s.for).purpose ?? s.for.toLowerCase()}` : verb];
      if (s.lateMinutes) parts.push(`after staying out ${s.lateMinutes} min past dark`);
      const seen = [...s.seen].map(([type, n]) => `${n} new ${n === 1 ? type.toLowerCase() : (types.get(type)?.plural ?? `${type.toLowerCase()}s`)}`);
      if (seen.length) parts.push(`saw ${seen.join(", ")}`);
      for (const [who, n] of s.told) parts.push(`heard of ${n} ${n === 1 ? "thing" : "things"} from ${this.names.get(who) ?? "someone"}`);
      entries.push({ t: s.start, text: esc(`${clockLabel(s.start)} – ${end} · ${parts.join(" · ")}`) });
    }
    for (const l of watcher.linesFor(person, max)) {
      if (l.emphasis === "quiet") continue;
      const color = world.registry.watch.get(l.pack)?.color ?? "#888888";
      entries.push({ t: l.t + 1e-9, text: `<strong class="moment" style="--pack: ${color}">${esc(`${clockLabel(l.t)} · ${l.text}`)}</strong>` });
    }
    return entries
      .sort((a, b) => b.t - a.t)
      .slice(0, max)
      .map((e) => e.text);
  }
}
