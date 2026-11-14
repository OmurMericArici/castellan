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
  /** The method this was a step toward (ADR-0033). */
  for?: string;
  /** Who told them things during this stretch, and how many. */
  told: Map<NodeId, number>;
  /** Minutes they stayed out after dusk before resting. */
  lateMinutes?: number;
}

interface Moment {
  t: number;
  text: string;
}

const MORE_VERB: Record<string, string> = { Hide: "hid at home", Murder: "stalked someone", Attack: "went after someone", Chat: "chatted" };
const MORE_ONGOING: Record<string, string> = { Hide: "hiding at home", Murder: "stalking someone", Attack: "going after someone", Chat: "chatting" };
const VERB: Record<string, string> = { Explore: "explored", Wander: "wandered", Rest: "rested", Gather: "gathered wood", Deliver: "carried wood to the site", Build: "built", Forage: "foraged", Confront: "confronted someone" };
const ONGOING: Record<string, string> = { Explore: "exploring", Wander: "wandering", Rest: "resting", Gather: "gathering wood", Deliver: "carrying wood to the site", Build: "building", Forage: "foraging", Confront: "confronting someone" };
/** What a sub-problem was for, read as "gathered wood to build a house" (ADR-0033). */
export const PURPOSE: Record<string, string> = { Build: "build a house", Forage: "find food", Chat: "find someone to talk to", Confront: "confront someone", Attack: "attack someone", Murder: "kill", Drink: "find water" };
const METHOD: Record<string, string> = { Build: "build a house", Gather: "cut wood", Deliver: "carry wood", Forage: "forage", Chat: "chat", Attack: "kill in anger", Murder: "kill", Confront: "confront people" };
const PLURAL: Record<string, string> = { Tree: "trees", Stone: "stones", Person: "people", Bush: "bushes" };

export class StoryBook {
  private read = 0;
  private readonly segments = new Map<NodeId, Segment[]>();
  private readonly moments = new Map<NodeId, Moment[]>();
  private lastDusk = -Infinity;
  private readonly names = new Map<NodeId, string>();

  private note(person: NodeId, t: number, text: string): void {
    const list = this.moments.get(person) ?? [];
    list.push({ t, text });
    this.moments.set(person, list);
  }

  update(world: World): void {
    const g = world.graph;
    for (; this.read < world.log.length; this.read++) {
      const { t, by, event: e } = world.log[this.read]!;
      if (e.kind === "node.created" && e.node.type === "Person") this.names.set(e.node.id, String(e.node.attrs["name"] ?? "someone"));
      if (e.kind === "signal" && e.name === "dusk") this.lastDusk = t;
      if (e.kind === "happened" && e.name === "Murder") {
        const name = (id: NodeId | undefined) => (id === undefined ? "someone" : String(g.node(id)?.attrs["name"] ?? "someone"));
        this.note(e.actor, t, `killed ${name(e.about)}${e.witnesses.length ? `, seen by ${e.witnesses.map(name).join(", ")}` : ", unseen"}`);
        if (e.about !== undefined) this.note(e.about, t, `was killed by ${name(e.actor)}`);
        for (const wi of e.witnesses) this.note(wi, t, `saw ${name(e.actor)} kill ${name(e.about)}`);
      }
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
        const seg: Segment = { action: e.activity.action, start: t, seen: new Map(), told: new Map(), ...(e.activity.for ? { for: e.activity.for } : {}) };
        // Staying out late: only if they were out doing something, not already inside.
        const inside = last !== undefined && (last.action === "Hide" || last.action === "Rest");
        if (e.activity.action === "Rest" && !inside && t > this.lastDusk && t - this.lastDusk < 1 - DUSK) {
          const late = Math.round((t - this.lastDusk) * 24 * 60);
          if (late >= 10) seg.lateMinutes = late;
        }
        list.push(seg);
        this.segments.set(e.person, list);
      }
      if (e.kind === "edge.created") {
        const edge = e.edge;
        const name = (id: NodeId | undefined) => (id === undefined ? "someone" : String(g.node(id)?.attrs["name"] ?? "someone"));
        if (edge.type === "knows") {
          const claim = g.node(edge.to);
          const teller = typeof edge.fromData?.["from"] === "number" ? (edge.fromData["from"] as NodeId) : undefined;
          const seg = this.segments.get(edge.from)?.at(-1);
          if (claim?.type === "Report") {
            const actor = g.edgesOf(claim.id, "actor").find((x) => x.from === claim.id)?.to;
            const about = g.edgesOf(claim.id, "about").find((x) => x.from === claim.id)?.to;
            const witnessed = world.log.some((l) => l.event.kind === "happened" && l.event.witnesses.includes(edge.from) && Math.abs(l.t - t) < 1e-9);
            if (!witnessed && actor !== edge.from) {
              const what = claim.attrs["event"] === "Murder" ? `${actor !== undefined ? name(actor) : "someone"} killed ${name(about)}` : String(claim.attrs["event"]).toLowerCase();
              this.note(edge.from, t, teller !== undefined ? `${name(teller)} told them ${what}` : `heard that ${what}`);
            }
          } else if (teller !== undefined) {
            if (seg) seg.told.set(teller, (seg.told.get(teller) ?? 0) + 1);
          } else {
            const subject = g.edgesOf(edge.to, "about")[0];
            const type = subject ? g.node(subject.to)?.type : undefined;
            if (seg && type) seg.seen.set(type, (seg.seen.get(type) ?? 0) + 1);
          }
        } else if (edge.type === "knowsHow" && edge.fromData?.["how"] !== "born") {
          const method = String(g.node(edge.to)?.type ?? "");
          const what = METHOD[method] ?? method.toLowerCase();
          const from = typeof edge.fromData?.["from"] === "number" ? (edge.fromData["from"] as NodeId) : undefined;
          this.note(edge.from, t, edge.fromData?.["how"] === "watched" ? `learned to ${what} by watching ${name(from)}` : `${name(from)} taught them to ${what}`);
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
      const verb = s.end === undefined ? (ONGOING[s.action] ?? MORE_ONGOING[s.action] ?? s.action.toLowerCase()) : (VERB[s.action] ?? MORE_VERB[s.action] ?? s.action.toLowerCase());
      const parts = [s.for ? `${verb} to ${PURPOSE[s.for] ?? s.for.toLowerCase()}` : verb];
      if (s.lateMinutes) parts.push(`after staying out ${s.lateMinutes} min past dark`);
      const seen = [...s.seen].map(([type, n]) => `${n} new ${n === 1 ? type.toLowerCase() : (PLURAL[type] ?? `${type.toLowerCase()}s`)}`);
      if (seen.length) parts.push(`saw ${seen.join(", ")}`);
      for (const [who, n] of s.told) parts.push(`heard of ${n} ${n === 1 ? "thing" : "things"} from ${this.names.get(who) ?? "someone"}`);
      entries.push({ t: s.start, text: `${clockLabel(s.start)} – ${end} · ${parts.join(" · ")}` });
    }
    for (const m of this.moments.get(person) ?? []) entries.push({ t: m.t + 1e-9, text: `<strong>${clockLabel(m.t)} · ${m.text}</strong>` });
    return entries
      .sort((a, b) => b.t - a.t)
      .slice(0, max)
      .map((e) => e.text);
  }
}
