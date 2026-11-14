import { clockLabel, formatValue, logKey } from "../core";
import type { LogLine, NodeId, WatchDef, Watcher, World } from "../core";

/**
 * The packs' own watchers and logs (ADR-0037). Nothing here knows any pack by
 * name: tables, log types, groups and colours all come from the packs' `watch`
 * blocks. The user ticks which log types also show in the world log.
 */
const STORE = "castellan.logs.v1";
const GLOBAL_MAX = 80;
const PACK_MAX = 60;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

interface PackView {
  def: WatchDef;
  root: HTMLDetailsElement;
  tables: HTMLElement;
  log: HTMLOListElement;
  count: HTMLElement;
  /** Lines drawn in this pack's own log, to skip redrawing when nothing changed. */
  drawn: number;
  /** How many lines this pack has logged so far. */
  total: number;
}

export class WatchPanel {
  /** Log types shown in the world log, by `pack/group/type`. */
  private readonly chosen = new Set<string>();
  private readonly views: PackView[] = [];
  private globalDrawn = -1;
  /** How far into the watcher's lines the per-pack totals have counted. */
  private counted = 0;
  private readonly colors = new Map<string, string>();

  constructor(
    world: World,
    private readonly watcher: Watcher,
    private readonly list: HTMLElement,
    private readonly globalLog: HTMLOListElement,
    private readonly onSelect: (id: NodeId) => void,
  ) {
    const saved = this.load();
    for (const def of world.registry.watch.values()) {
      this.colors.set(def.pack, def.color);
      for (const l of def.logs) {
        const key = logKey(l);
        if (saved[key] ?? l.global) this.chosen.add(key);
      }
      if (def.tables.length || def.logs.length) this.views.push(this.build(def));
    }
    if (this.views.length === 0) list.innerHTML = `<p class="hint">None of the loaded packs has a <code>watch</code> block.</p>`;
  }

  /** Call often; it only touches what changed or is open. */
  render(): void {
    const lines = this.watcher.lines;
    if (lines.length !== this.globalDrawn) {
      this.globalDrawn = lines.length;
      const shown: LogLine[] = [];
      for (let i = lines.length - 1; i >= 0 && shown.length < GLOBAL_MAX; i--) {
        const l = lines[i]!;
        if (this.chosen.has(`${l.pack}/${l.group}/${l.type}`)) shown.push(l);
      }
      this.globalLog.innerHTML = shown.length
        ? shown.map((l) => this.line(l, l.pack)).join("")
        : `<li class="hint">Nothing yet. Tick log types in the packs below to follow them here.</li>`;
    }
    if (this.counted < lines.length) {
      for (; this.counted < lines.length; this.counted++) {
        const v = this.views.find((x) => x.def.pack === lines[this.counted]!.pack);
        if (v) v.total++;
      }
      for (const v of this.views) v.count.textContent = `${v.total} ${v.total === 1 ? "line" : "lines"}`;
    }
    for (const v of this.views) {
      if (!v.root.open) continue;
      this.drawTables(v);
      if (v.drawn === lines.length) continue;
      v.drawn = lines.length;
      const own: LogLine[] = [];
      for (let i = lines.length - 1; i >= 0 && own.length < PACK_MAX; i--) {
        if (lines[i]!.pack === v.def.pack) own.push(lines[i]!);
      }
      v.log.innerHTML = own.length ? own.map((l) => this.line(l, `${l.group} · ${l.type}`)).join("") : `<li class="hint">Nothing logged yet.</li>`;
    }
  }

  private line(l: LogLine, tag: string): string {
    const color = this.colors.get(l.pack) ?? "#888888";
    return `<li class="line ${l.emphasis}" style="--pack: ${color}"><span class="when">${clockLabel(l.t)}</span> <span class="ptag">${esc(tag)}</span> ${esc(l.text)}</li>`;
  }

  private drawTables(v: PackView): void {
    v.tables.innerHTML = v.def.tables
      .map((t) => {
        const view = this.watcher.table(v.def.pack, t);
        const numeric = view.columns.map((_, i) => view.rows.some((r) => typeof r.cells[i] === "number"));
        const head = `<th></th>${view.columns.map((c, i) => `<th class="${numeric[i] ? "num" : ""}">${esc(c)}</th>`).join("")}`;
        const body = view.rows
          .map((r) => {
            const cells = r.cells.map((c) => `<td class="${typeof c === "number" ? "num" : ""}">${esc(formatValue(c))}</td>`).join("");
            return `<tr data-id="${r.id}"><th>${esc(r.label)}</th>${cells}</tr>`;
          })
          .join("");
        const empty = view.rows.length ? "" : `<tr><td class="hint" colspan="${view.columns.length + 1}">No rows right now.</td></tr>`;
        return `<h3>${esc(t.name)}</h3><div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}${empty}</tbody></table></div>`;
      })
      .join("");
  }

  private build(def: WatchDef): PackView {
    const root = document.createElement("details");
    root.className = "pack-watch";
    root.style.setProperty("--pack", def.color);
    const groups = new Map<string, WatchDef["logs"][number][]>();
    for (const l of def.logs) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);
    const picker = [...groups]
      .map(
        ([group, types]) => `
        <details class="group">
          <summary><input type="checkbox" data-group="${esc(group)}" aria-label="All of ${esc(group)} to the world log"> ${esc(group)} <span class="hint" data-tally="${esc(group)}"></span></summary>
          ${types
            .map((l) => `<label><input type="checkbox" data-key="${esc(logKey(l))}"> ${esc(l.name)} <span class="hint">${l.on}</span></label>`)
            .join("")}
        </details>`,
      )
      .join("");
    root.innerHTML = `
      <summary><span class="swatch">${esc(def.mark ?? "")}</span><strong>${esc(def.pack)}</strong>
        <span class="hint">${def.tables.length} ${def.tables.length === 1 ? "table" : "tables"} · ${def.logs.length} log ${def.logs.length === 1 ? "type" : "types"} · <span data-count>0 lines</span></span></summary>
      <div class="tables"></div>
      ${
        def.logs.length
          ? `<div class="picker">
              <p class="hint">Show in the world log:</p>
              <label class="all"><input type="checkbox" data-all> everything from this pack</label>
              ${picker}
            </div>
            <h3>Log</h3>
            <ol class="log"></ol>`
          : ""
      }`;
    const view: PackView = {
      def,
      root,
      tables: root.querySelector<HTMLElement>(".tables")!,
      log: root.querySelector<HTMLOListElement>("ol.log") ?? document.createElement("ol"),
      count: root.querySelector<HTMLElement>("[data-count]")!,
      drawn: -1,
      total: 0,
    };
    const sync = () => {
      const boxes = [...root.querySelectorAll<HTMLInputElement>("input[data-key]")];
      for (const b of boxes) b.checked = this.chosen.has(b.dataset["key"]!);
      const mark = (box: HTMLInputElement | null, of: HTMLInputElement[]) => {
        if (!box) return;
        const on = of.filter((b) => b.checked).length;
        box.checked = on === of.length && of.length > 0;
        box.indeterminate = on > 0 && on < of.length;
        return on;
      };
      for (const g of root.querySelectorAll<HTMLDetailsElement>("details.group")) {
        const of = [...g.querySelectorAll<HTMLInputElement>("input[data-key]")];
        const on = mark(g.querySelector<HTMLInputElement>("input[data-group]"), of);
        g.querySelector<HTMLElement>("[data-tally]")!.textContent = `${on ?? 0} of ${of.length}`;
      }
      mark(root.querySelector<HTMLInputElement>("input[data-all]"), boxes);
    };
    root.addEventListener("change", (ev) => {
      const box = ev.target as HTMLInputElement;
      if (box.type !== "checkbox") return;
      const scope = box.dataset["key"] !== undefined ? [box] : box.dataset["group"] !== undefined ? [...box.closest("details.group")!.querySelectorAll<HTMLInputElement>("input[data-key]")] : [...root.querySelectorAll<HTMLInputElement>("input[data-key]")];
      for (const b of scope) {
        if (box.checked) this.chosen.add(b.dataset["key"]!);
        else this.chosen.delete(b.dataset["key"]!);
      }
      sync();
      this.save();
      this.globalDrawn = -1;
    });
    root.addEventListener("toggle", () => (view.drawn = -1));
    view.tables.addEventListener("click", (ev) => {
      const row = (ev.target as HTMLElement).closest<HTMLElement>("tr[data-id]");
      if (row) this.onSelect(Number(row.dataset["id"]));
    });
    sync();
    this.list.append(root);
    return view;
  }

  /** The user's own choices, kept between worlds. Works without storage too. */
  private load(): Record<string, boolean> {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) ?? "{}") as unknown;
      return typeof raw === "object" && raw !== null ? (raw as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      const all: Record<string, boolean> = { ...this.load() };
      for (const l of this.watcher.logTypes()) all[logKey(l)] = this.chosen.has(logKey(l));
      localStorage.setItem(STORE, JSON.stringify(all));
    } catch {
      // No storage (private window): the choice lasts for this page only.
    }
  }
}
