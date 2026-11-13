import type { Rng } from "./rng";

/**
 * The pack expression language (ADR-0023).
 *
 * Small, pure and bounded: expressions read values and return a value. They can't
 * change anything, call arbitrary code, loop or hang. Castellan parses and
 * evaluates them itself; nothing from a pack is ever run as JavaScript.
 *
 *   round(rand_range(4, 12))
 *   self.age > 16 and not tired
 *   if(night, 0.5, 1) * base
 */

export type Value = number | string | boolean | null;

/** What an expression can see: plain values or nested records of them (`self.age`). */
export interface Scope {
  [name: string]: Value | Scope;
}

export class ExprError extends Error {
  constructor(
    message: string,
    readonly column?: number,
  ) {
    super(column === undefined ? message : `${message} (column ${column})`);
  }
}

type Ast =
  | { k: "lit"; v: Value }
  | { k: "var"; name: string; col: number }
  | { k: "member"; obj: Ast; name: string; col: number }
  | { k: "call"; name: string; args: Ast[]; col: number }
  | { k: "unary"; op: "-" | "not"; arg: Ast; col: number }
  | { k: "binary"; op: BinaryOp; l: Ast; r: Ast; col: number };

type BinaryOp = "or" | "and" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%";

export interface Compiled {
  readonly source: string;
  /** Root variable names the expression reads (`self` for `self.age`). */
  readonly vars: ReadonlySet<string>;
  readonly usesRandom: boolean;
  readonly ast: Ast;
}

export const LIMITS = { sourceLength: 500, depth: 48, steps: 10_000 } as const;

// ---------------------------------------------------------------- functions

interface FnDef {
  readonly min: number;
  readonly max: number;
  readonly random?: boolean;
  readonly call?: (args: number[], rng: Rng | undefined, col: number) => Value;
}

const num1 = (f: (x: number) => number): FnDef => ({ min: 1, max: 1, call: ([x]) => f(x!) });

const FUNCTIONS: Record<string, FnDef> = {
  min: { min: 1, max: 16, call: (a) => Math.min(...a) },
  max: { min: 1, max: 16, call: (a) => Math.max(...a) },
  clamp: { min: 3, max: 3, call: ([x, lo, hi]) => Math.min(hi!, Math.max(lo!, x!)) },
  lerp: { min: 3, max: 3, call: ([a, b, t]) => a! + (b! - a!) * t! },
  abs: num1(Math.abs),
  floor: num1(Math.floor),
  ceil: num1(Math.ceil),
  round: num1(Math.round),
  sqrt: num1(Math.sqrt),
  // `if` is lazy: only the chosen branch is evaluated. Handled in evaluate().
  if: { min: 3, max: 3 },
  rand: { min: 0, max: 0, random: true, call: (_a, rng, col) => needRng(rng, "rand", col).next() },
  rand_range: {
    min: 2,
    max: 2,
    random: true,
    call: ([a, b], rng, col) => a! + needRng(rng, "rand_range", col).next() * (b! - a!),
  },
  rand_int: {
    min: 2,
    max: 2,
    random: true,
    call: ([a, b], rng, col) => needRng(rng, "rand_int", col).int(Math.ceil(a!), Math.floor(b!)),
  },
};

export const FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS);

function needRng(rng: Rng | undefined, name: string, col: number): Rng {
  if (!rng) throw new ExprError(`${name}() is not available here`, col);
  return rng;
}

// ---------------------------------------------------------------- tokenizer

type Tok =
  | { t: "num"; v: number; col: number }
  | { t: "str"; v: string; col: number }
  | { t: "id"; v: string; col: number }
  | { t: "op"; v: string; col: number }
  | { t: "end"; col: number };

const OPS = ["==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "(", ")", ",", "."];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    const col = i + 1;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      out.push({ t: "num", v: Number(m[0]), col });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], col });
      i += m[0].length;
    } else if (ch === '"') {
      let s = "";
      i++;
      for (;;) {
        if (i >= src.length) throw new ExprError("string is not closed", col);
        const c = src[i]!;
        if (c === '"') break;
        if (c === "\\" && i + 1 < src.length) {
          s += src[i + 1];
          i += 2;
        } else {
          s += c;
          i++;
        }
      }
      i++;
      out.push({ t: "str", v: s, col });
    } else {
      const op = OPS.find((o) => src.startsWith(o, i));
      if (!op) throw new ExprError(`unexpected character "${ch}"`, col);
      out.push({ t: "op", v: op, col });
      i += op.length;
    }
  }
  out.push({ t: "end", col: src.length + 1 });
  return out;
}

// ---------------------------------------------------------------- parser (Pratt)

const BINARY: Record<string, { prec: number; op: BinaryOp }> = {
  or: { prec: 1, op: "or" },
  and: { prec: 2, op: "and" },
  "==": { prec: 4, op: "==" },
  "!=": { prec: 4, op: "!=" },
  "<": { prec: 4, op: "<" },
  "<=": { prec: 4, op: "<=" },
  ">": { prec: 4, op: ">" },
  ">=": { prec: 4, op: ">=" },
  "+": { prec: 5, op: "+" },
  "-": { prec: 5, op: "-" },
  "*": { prec: 6, op: "*" },
  "/": { prec: 6, op: "/" },
  "%": { prec: 6, op: "%" },
};
const KEYWORDS = new Set(["and", "or", "not", "true", "false", "null"]);

class Parser {
  private pos = 0;
  readonly vars = new Set<string>();
  usesRandom = false;

  constructor(private readonly toks: Tok[]) {}

  parse(): Ast {
    const ast = this.expr(0, 0);
    const t = this.peek();
    if (t.t !== "end") throw new ExprError(`unexpected ${describe(t)}`, t.col);
    return ast;
  }

  private peek(): Tok {
    return this.toks[this.pos]!;
  }

  private next(): Tok {
    return this.toks[this.pos++]!;
  }

  private expectOp(v: string): void {
    const t = this.next();
    if (t.t !== "op" || t.v !== v) throw new ExprError(`expected "${v}" but found ${describe(t)}`, t.col);
  }

  private expr(minPrec: number, depth: number): Ast {
    if (depth > LIMITS.depth) throw new ExprError("expression is nested too deeply", this.peek().col);
    let left = this.prefix(depth);
    for (;;) {
      const t = this.peek();
      const key = t.t === "op" || t.t === "id" ? t.v : "";
      const bin = BINARY[key];
      if (!bin || bin.prec <= minPrec) return left;
      this.next();
      const right = this.expr(bin.prec, depth + 1);
      left = { k: "binary", op: bin.op, l: left, r: right, col: t.col };
    }
  }

  private prefix(depth: number): Ast {
    const t = this.next();
    switch (t.t) {
      case "num":
        return { k: "lit", v: t.v };
      case "str":
        return { k: "lit", v: t.v };
      case "op":
        if (t.v === "-") return { k: "unary", op: "-", arg: this.expr(7, depth + 1), col: t.col };
        if (t.v === "(") {
          const inner = this.expr(0, depth + 1);
          this.expectOp(")");
          return inner;
        }
        throw new ExprError(`unexpected ${describe(t)}`, t.col);
      case "id":
        return this.identifier(t, depth);
      case "end":
        throw new ExprError("expression ended too early", t.col);
    }
  }

  private identifier(t: Extract<Tok, { t: "id" }>, depth: number): Ast {
    if (t.v === "true") return { k: "lit", v: true };
    if (t.v === "false") return { k: "lit", v: false };
    if (t.v === "null") return { k: "lit", v: null };
    if (t.v === "not") return { k: "unary", op: "not", arg: this.expr(3, depth + 1), col: t.col };
    if (KEYWORDS.has(t.v)) throw new ExprError(`unexpected "${t.v}"`, t.col);

    const after = this.peek();
    if (after.t === "op" && after.v === "(") {
      this.next();
      const fn = FUNCTIONS[t.v];
      if (!fn) throw new ExprError(`unknown function "${t.v}"${suggest(t.v, FUNCTION_NAMES)}`, t.col);
      const args: Ast[] = [];
      if (!(this.peek().t === "op" && (this.peek() as { v: string }).v === ")")) {
        for (;;) {
          args.push(this.expr(0, depth + 1));
          const sep = this.peek();
          if (sep.t === "op" && sep.v === ",") {
            this.next();
            continue;
          }
          break;
        }
      }
      this.expectOp(")");
      if (args.length < fn.min || args.length > fn.max) {
        const want = fn.min === fn.max ? `${fn.min}` : `${fn.min} to ${fn.max}`;
        throw new ExprError(`${t.v}() takes ${want} argument(s), got ${args.length}`, t.col);
      }
      if (fn.random) this.usesRandom = true;
      return { k: "call", name: t.v, args, col: t.col };
    }

    this.vars.add(t.v);
    let node: Ast = { k: "var", name: t.v, col: t.col };
    while (this.peek().t === "op" && (this.peek() as { v: string }).v === ".") {
      this.next();
      const field = this.next();
      if (field.t !== "id") throw new ExprError(`expected a name after "." but found ${describe(field)}`, field.col);
      node = { k: "member", obj: node, name: field.v, col: field.col };
    }
    return node;
  }
}

function describe(t: Tok): string {
  switch (t.t) {
    case "end":
      return "end of expression";
    case "str":
      return `string "${t.v}"`;
    default:
      return `"${t.v}"`;
  }
}

/** ` (did you mean "x"?)` when a close name exists. */
export function suggest(name: string, options: Iterable<string>): string {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const o of options) {
    const d = editDistance(name.toLowerCase(), o.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  const limit = name.length <= 3 ? 1 : Math.max(2, Math.floor(name.length / 3));
  return best !== undefined && bestDist <= limit ? ` (did you mean "${best}"?)` : "";
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

// ---------------------------------------------------------------- public API

/**
 * Parse an expression once. `allowedVars` lists the names this place may read;
 * anything else is reported now, not when the world is running.
 */
export function compile(source: string, allowedVars: Iterable<string> = []): Compiled {
  if (source.length > LIMITS.sourceLength) {
    throw new ExprError(`expression is longer than ${LIMITS.sourceLength} characters`);
  }
  const parser = new Parser(tokenize(source));
  const ast = parser.parse();
  const allowed = new Set(allowedVars);
  for (const v of parser.vars) {
    if (!allowed.has(v)) {
      const where = allowed.size ? ` here; available: ${[...allowed].join(", ")}` : " here; no names are available in this place";
      throw new ExprError(`unknown name "${v}"${suggest(v, allowed)}${where}`);
    }
  }
  return { source, vars: parser.vars, usesRandom: parser.usesRandom, ast };
}

export interface EvalContext {
  scope?: Scope;
  /** Needed by rand(), rand_range(), rand_int(). Seeded per node, so results are reproducible. */
  rng?: Rng;
}

export function evaluate(expr: Compiled, ctx: EvalContext = {}): Value {
  let steps = 0;
  const scope = ctx.scope ?? {};

  const num = (v: Value | Scope, col: number, what: string): number => {
    if (typeof v !== "number") throw new ExprError(`${what} needs a number, got ${typeName(v)}`, col);
    return v;
  };
  const bool = (v: Value | Scope, col: number, what: string): boolean => {
    if (typeof v !== "boolean") throw new ExprError(`${what} needs true or false, got ${typeName(v)}`, col);
    return v;
  };

  const ev = (n: Ast): Value | Scope => {
    if (++steps > LIMITS.steps) throw new ExprError(`expression took more than ${LIMITS.steps} steps`);
    switch (n.k) {
      case "lit":
        return n.v;
      case "var": {
        const v = scope[n.name];
        if (v === undefined) throw new ExprError(`"${n.name}" has no value here`, n.col);
        return v;
      }
      case "member": {
        const obj = ev(n.obj);
        if (obj === null || typeof obj !== "object") throw new ExprError(`cannot read ".${n.name}" of ${typeName(obj)}`, n.col);
        const v = obj[n.name];
        if (v === undefined) throw new ExprError(`".${n.name}" has no value here`, n.col);
        return v;
      }
      case "unary": {
        const v = ev(n.arg);
        return n.op === "-" ? -num(v, n.col, "-") : !bool(v, n.col, "not");
      }
      case "binary": {
        if (n.op === "and") return bool(ev(n.l), n.col, "and") && bool(ev(n.r), n.col, "and");
        if (n.op === "or") return bool(ev(n.l), n.col, "or") || bool(ev(n.r), n.col, "or");
        const l = ev(n.l);
        const r = ev(n.r);
        if (n.op === "==") return l === r;
        if (n.op === "!=") return l !== r;
        return arithmetic(n.op, num(l, n.col, n.op), num(r, n.col, n.op), n.col);
      }
      case "call": {
        if (n.name === "if") {
          return bool(ev(n.args[0]!), n.col, "if") ? ev(n.args[1]!) : ev(n.args[2]!);
        }
        const fn = FUNCTIONS[n.name]!;
        const args = n.args.map((a) => num(ev(a), n.col, `${n.name}()`));
        return fn.call!(args, ctx.rng, n.col);
      }
    }
  };

  const result = ev(expr.ast);
  if (result !== null && typeof result === "object") throw new ExprError("expression gives a record, not a value");
  return result;
}

function arithmetic(op: Exclude<BinaryOp, "and" | "or" | "==" | "!=">, a: number, b: number, col: number): Value {
  switch (op) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
    case "%":
      if (b === 0) throw new ExprError("division by zero", col);
      return op === "/" ? a / b : a % b;
  }
}

function typeName(v: Value | Scope): string {
  if (v === null) return "null";
  if (typeof v === "object") return "a record";
  return typeof v === "string" ? `the text "${v}"` : `${typeof v} ${String(v)}`;
}
