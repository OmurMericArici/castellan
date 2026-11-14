import type { Adam } from "./adam";
import { evaluate } from "./expr";
import type { Compiled, Scope, Value } from "./expr";
import type { Attrs, EdgeId, GraphNode, NodeId } from "./graph";
import { isLazy, readLazy } from "./lazy";
import type { LogTrigger, Registry, WatchLog, WatchTable, Words } from "./packs";
import type { World } from "./world";

/**
 * Pack watchers and logs (ADR-0037). Packs say what to track (tables) and what
 * triggers a log line; this module turns the world's event log into those lines
 * and reads the tables. It only reads: watching never changes the world.
 */
export interface LogLine {
  /** World time in days. */
  readonly t: number;
  readonly seq: number;
  readonly pack: string;
  readonly group: string;
  readonly type: string;
  readonly text: string;
  readonly emphasis: WatchLog["emphasis"];
  /** People the line is about, for per-person stories. */
  readonly people: readonly NodeId[];
}

export interface TableView {
  readonly pack: string;
  readonly name: string;
  readonly columns: readonly string[];
  readonly rows: readonly { readonly id: NodeId; readonly label: string; readonly cells: readonly Value[] }[];
}

/** `pack/group/type`: how a log type is named everywhere outside the pack. */
export function logKey(l: { pack: string; group: string; name: string }): string {
  return `${l.pack}/${l.group}/${l.name}`;
}

interface Fire {
  self?: NodeId;
  other?: NodeId;
  about?: NodeId;
  teller?: NodeId;
  /** Other people the line is about (witnesses). */
  also?: readonly NodeId[];
  /** Plain names for the scope; everything not given stays empty. */
  values?: Scope;
  /** The method whose words `words.*` should read. */
  method?: string;
}

const NOBODY: Scope = { id: 0, name: "someone", type: "" };

export class Watcher {
  readonly lines: LogLine[] = [];
  readonly warnings: string[] = [];
  private read = 0;
  private registry: Registry | undefined;
  private byTrigger = new Map<LogTrigger, WatchLog[]>();
  private readonly lastAction = new Map<NodeId, string>();
  /** Edges between entities, kept so a removal can still say what it was. */
  private readonly links = new Map<EdgeId, { type: string; from: NodeId; to: NodeId }>();
  /** Who saw which event, so hearing of it later isn't logged for them. */
  private readonly witnessed: { t: number; witnesses: readonly NodeId[] }[] = [];
  private readonly warned = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly adam: Adam,
  ) {}

  /** Log types of every loaded pack, in pack order. */
  logTypes(): WatchLog[] {
    return [...this.world.registry.watch.values()].flatMap((w) => w.logs);
  }

  /** Read whatever the world logged since last time. */
  update(): void {
    const w = this.world;
    if (this.registry !== w.registry) {
      this.registry = w.registry;
      this.byTrigger = new Map();
      for (const l of this.logTypes()) this.byTrigger.set(l.on, [...(this.byTrigger.get(l.on) ?? []), l]);
    }
    const g = w.graph;
    for (; this.read < w.log.length; this.read++) {
      const { t, seq, by, event: e } = w.log[this.read]!;
      const fire = (on: LogTrigger, f: Fire) => this.fire(on, t, seq, by, f);
      switch (e.kind) {
        case "activity": {
          if (this.lastAction.get(e.person) === e.activity.action) break;
          this.lastAction.set(e.person, e.activity.action);
          fire("started", { self: e.person, values: { action: e.activity.action, purpose: e.activity.for ?? "" }, method: e.activity.action });
          break;
        }
        case "happened": {
          this.witnessed.push({ t, witnesses: e.witnesses });
          const seenBy = e.witnesses.length ? e.witnesses.map((id) => this.nameOf(id)).join(", ") : "nobody";
          const event: Scope = { name: e.name, witnesses: e.witnesses.length, seenBy, known: e.witnesses.length > 0, told: false };
          fire("happened", { self: e.actor, ...(e.about !== undefined ? { about: e.about } : {}), also: e.witnesses, values: { event } });
          for (const wi of e.witnesses) fire("witness", { self: wi, other: e.actor, ...(e.about !== undefined ? { about: e.about } : {}), values: { event } });
          break;
        }
        case "met":
          fire("met", { self: e.a, other: e.b });
          fire("met", { self: e.b, other: e.a });
          break;
        case "died":
          fire("died", { self: e.id, ...(e.by !== undefined ? { other: e.by } : {}) });
          break;
        case "signal":
          fire("signal", { values: { signal: e.name } });
          break;
        case "node.created":
          if (e.node.kind === "entity") fire("created", { self: e.node.id, values: { type: e.node.type } });
          break;
        case "edge.removed": {
          const link = this.links.get(e.id);
          if (!link) break;
          this.links.delete(e.id);
          fire("unlinked", { self: link.from, other: link.to, values: { edge: link.type } });
          break;
        }
        case "edge.created": {
          const edge = e.edge;
          const from = typeof edge.fromData["from"] === "number" ? (edge.fromData["from"] as NodeId) : undefined;
          if (edge.type === "knows") {
            const claim = g.node(edge.to);
            if (claim?.type !== "Report") break;
            const actor = g.edgesOf(claim.id, "actor").find((x) => x.from === claim.id)?.to;
            const about = g.edgesOf(claim.id, "about").find((x) => x.from === claim.id)?.to;
            const saw = this.witnessed.some((x) => Math.abs(x.t - t) < 1e-9 && x.witnesses.includes(edge.from));
            if (saw || actor === edge.from) break;
            const event: Scope = { name: String(claim.attrs["event"] ?? ""), witnesses: 0, seenBy: "", known: actor !== undefined, told: from !== undefined };
            fire("hears", {
              self: edge.from,
              ...(actor !== undefined ? { other: actor } : {}),
              ...(about !== undefined ? { about } : {}),
              ...(from !== undefined ? { teller: from } : {}),
              values: { event },
            });
          } else if (edge.type === "knowsHow") {
            const how = String(edge.fromData["how"] ?? "");
            if (how === "born") break;
            const method = g.node(edge.to)?.type ?? "";
            fire("learned", { self: edge.from, ...(from !== undefined ? { other: from } : {}), values: { method, how }, method });
          } else if (g.node(edge.from)?.kind === "entity" && g.node(edge.to)?.kind === "entity") {
            this.links.set(edge.id, { type: edge.type, from: edge.from, to: edge.to });
            fire("linked", { self: edge.from, other: edge.to, values: { edge: edge.type } });
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /** Lines about one person, newest first. */
  linesFor(person: NodeId, max = 40): LogLine[] {
    const out: LogLine[] = [];
    for (let i = this.lines.length - 1; i >= 0 && out.length < max; i--) {
      if (this.lines[i]!.people.includes(person)) out.push(this.lines[i]!);
    }
    return out;
  }

  /** A pack's table as it stands right now. */
  table(pack: string, table: WatchTable): TableView {
    const g = this.world.graph;
    const people = table.rows === "Person";
    const rows: { id: NodeId; label: string; cells: Value[] }[] = [];
    for (const n of g.nodes({ kind: "entity", type: table.rows })) {
      if (n.attrs["dead"] === true) continue;
      const scope: Scope = people ? this.adam.scopeFor(n) : { self: this.entity(n.id) };
      if (table.where && this.value(table.where, scope) !== true) continue;
      rows.push({ id: n.id, label: this.nameOf(n.id), cells: table.columns.map((c) => this.value(c.expr, scope)) });
    }
    const by = table.sort === undefined ? -1 : table.columns.findIndex((c) => c.name === table.sort);
    rows.sort((a, b) => {
      const x = by < 0 ? null : a.cells[by]!;
      const y = by < 0 ? null : b.cells[by]!;
      if (typeof x === "number" && typeof y === "number" && x !== y) return y - x;
      return a.label.localeCompare(b.label) || a.id - b.id;
    });
    return { pack, name: table.name, columns: table.columns.map((c) => c.name), rows };
  }

  // ---------------------------------------------------------------- internals

  private fire(on: LogTrigger, t: number, seq: number, by: string, f: Fire): void {
    const logs = this.byTrigger.get(on);
    if (!logs) return;
    const scope = this.scope(by, f);
    for (const l of logs) {
      const where = logKey(l);
      try {
        if (l.cond) {
          const ok = evaluate(l.cond, { scope });
          if (typeof ok !== "boolean") throw new Error(`"if" must give true or false, got ${JSON.stringify(ok)}`);
          if (!ok) continue;
        }
        const text = l.text.map((part) => (typeof part === "string" ? part : formatValue(evaluate(part, { scope })))).join("");
        this.lines.push({ t, seq, pack: l.pack, group: l.group, type: l.name, text, emphasis: l.emphasis, people: this.peopleOf(f) });
      } catch (e) {
        if (this.warned.has(where)) continue;
        this.warned.add(where);
        this.warnings.push(`${l.pack} › watch.logs.${l.group}.${l.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Every name in LOG_SCOPE gets a value, so a log never fails for a missing one. */
  private scope(by: string, f: Fire): Scope {
    const g = this.world.graph;
    const self = f.self === undefined ? undefined : g.node(f.self);
    const mind = self?.type === "Person" ? this.adam.mind(self.id) : undefined;
    const rel: Scope = {};
    for (const [name, def] of this.world.registry.edges) {
      if (def.from === "entity" && def.to === "entity") rel[name] = false;
    }
    if (f.self !== undefined && f.other !== undefined) {
      for (const e of g.edgesOf(f.self)) if (e.from === f.self && e.to === f.other && e.type in rel) rel[e.type] = true;
    }
    return {
      self: this.entity(f.self),
      other: this.entity(f.other),
      about: this.entity(f.about),
      teller: this.entity(f.teller),
      event: { name: "", witnesses: 0, seenBy: "", known: false, told: false },
      action: "",
      purpose: "",
      edge: "",
      method: "",
      how: "",
      type: self?.type ?? "",
      signal: "",
      by,
      rel,
      words: this.words(f.method),
      traits: mind?.traits ?? {},
      needs: mind?.needs ?? {},
      emotions: mind?.emotions ?? {},
      ...f.values,
    };
  }

  private words(method: string | undefined): Scope {
    const w: Words = (method ? this.world.registry.types.get(method)?.action?.words : undefined) ?? {};
    const plain = (method ?? "").toLowerCase();
    return { doing: w.doing ?? plain, did: w.did ?? plain, purpose: w.purpose ?? plain, name: w.name ?? plain };
  }

  private entity(id: NodeId | undefined): Scope {
    const n = id === undefined ? undefined : this.world.graph.node(id);
    if (!n) return NOBODY;
    return { ...attrScope(n.attrs, this.world.time), id: n.id, type: n.type, name: this.nameOf(n.id) };
  }

  private nameOf(id: NodeId): string {
    const n = this.world.graph.node(id);
    if (!n) return "someone";
    const name = n.attrs["name"];
    return typeof name === "string" && name !== "" ? name : `a ${n.type.toLowerCase()}`;
  }

  /** People named by the line; for a thing, the people linked to it (a house's residents). */
  private peopleOf(f: Fire): NodeId[] {
    const g = this.world.graph;
    const isPerson = (n: GraphNode | undefined): boolean => n?.type === "Person";
    const out = new Set<NodeId>();
    for (const id of [f.self, f.other, f.about, f.teller, ...(f.also ?? [])]) {
      if (id !== undefined && isPerson(g.node(id))) out.add(id);
    }
    const self = f.self === undefined ? undefined : g.node(f.self);
    if (self && !isPerson(self)) {
      for (const e of g.edgesOf(self.id)) if (e.to === self.id && isPerson(g.node(e.from))) out.add(e.from);
    }
    return [...out];
  }

  /** A table cell: a value, or nothing when the expression has no value for this row. */
  private value(expr: Compiled, scope: Scope): Value {
    try {
      return evaluate(expr, { scope });
    } catch {
      return null;
    }
  }
}

/** How a value reads in a line or a cell. */
export function formatValue(v: Value): string {
  if (v === null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v;
}

function attrScope(attrs: Attrs, t: number): Scope {
  const out: Scope = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (isLazy(v)) out[k] = readLazy(v, t);
    else if (v === null || typeof v !== "object") out[k] = v;
  }
  return out;
}
