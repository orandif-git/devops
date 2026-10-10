/**
 * Tiny, safe formula evaluator (no eval / Function).
 * Supports: numbers, "strings", [column] refs, + - * / % , comparisons, parentheses,
 * unary minus, and functions IF, ROUND, MIN, MAX, ABS, FLOOR, CEIL, AND, OR, NOT, CONCAT, SUM.
 */
type Val = number | string | boolean;
type Tok = { t: "num" | "str" | "ref" | "id" | "op" | "end"; v: string; raw?: string };

/** Thrown to abort evaluation with a "blank" outcome (missing input, strict division by zero). */
export class EvalAbort extends Error {}

/** Functions that aggregate a whole grid column, e.g. `[hours] / TOTAL([hours]) * 100`. */
export const COLUMN_FUNCS = ["TOTAL", "COLAVG", "COLMAX", "COLMIN", "COLCOUNT"];

export interface EvalOptions {
  /** throw EvalAbort on division by zero instead of returning 0 */
  strictDiv?: boolean;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: src.slice(i, j) }); i = j; continue;
    }
    if (c === '"') {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== '"') s += src[j++];
      if (j >= src.length) throw new Error("Unterminated string");
      out.push({ t: "str", v: s }); i = j + 1; continue;
    }
    if (c === "[") {
      const j = src.indexOf("]", i);
      if (j < 0) throw new Error("Unterminated [column]");
      out.push({ t: "ref", v: src.slice(i + 1, j).trim() }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j).toUpperCase(), raw: src.slice(i, j) }); i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "<>", "==", "!="].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/%()<>=,".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character '${c}'`);
  }
  out.push({ t: "end", v: "" });
  return out;
}

const num = (v: Val): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const truthy = (v: Val) => (typeof v === "string" ? v !== "" && v.toLowerCase() !== "false" : !!v);

export type RefResolver = (name: string) => Val;

export function evaluate(src: string, resolve: RefResolver, opts: EvalOptions = {}): Val {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const t = toks[p];
    if (v !== undefined && t.v !== v) throw new Error(`Expected '${v}'`);
    p++; return t;
  };

  function parseComparison(): Val {
    let l = parseAdd();
    while (peek().t === "op" && ["<", ">", "<=", ">=", "=", "==", "<>", "!="].includes(peek().v)) {
      const op = eat().v; const r = parseAdd();
      const bothNum = typeof l !== "string" && typeof r !== "string";
      const a = bothNum ? num(l) : String(l), b = bothNum ? num(r) : String(r);
      l = op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : op === ">=" ? a >= b
        : op === "=" || op === "==" ? a === b : a !== b;
    }
    return l;
  }
  function parseAdd(): Val {
    let l = parseMul();
    while (peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = eat().v; const r = parseMul();
      if (op === "+" && (typeof l === "string" || typeof r === "string") && (isNaN(Number(l)) || isNaN(Number(r)))) l = String(l) + String(r);
      else l = op === "+" ? num(l) + num(r) : num(l) - num(r);
    }
    return l;
  }
  function parseMul(): Val {
    let l = parseUnary();
    while (peek().t === "op" && ["*", "/", "%"].includes(peek().v)) {
      const op = eat().v; const r = num(parseUnary());
      const a = num(l);
      if (r === 0 && (op === "/" || op === "%") && opts.strictDiv) throw new EvalAbort("division by zero");
      l = op === "*" ? a * r : op === "/" ? (r === 0 ? 0 : a / r) : (r === 0 ? 0 : a % r);
    }
    return l;
  }
  function parseUnary(): Val {
    if (peek().t === "op" && peek().v === "-") { eat(); return -num(parseUnary()); }
    if (peek().t === "op" && peek().v === "+") { eat(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary(): Val {
    const t = eat();
    if (t.t === "num") return parseFloat(t.v);
    if (t.t === "str") return t.v;
    if (t.t === "ref") return resolve(t.v);
    if (t.t === "op" && t.v === "(") { const v = parseComparison(); eat(")"); return v; }
    if (t.t === "id") {
      if (t.v === "TRUE") return true;
      if (t.v === "FALSE") return false;
      if (peek().v !== "(") return resolve(t.raw ?? t.v);        // bare identifier = named variable
      if (COLUMN_FUNCS.includes(t.v)) {                           // TOTAL([col]) etc.: aggregate over the whole grid column
        eat("(");
        const col = eat();
        if (col.t !== "ref" && col.t !== "id") throw new Error(`${t.v} expects a column name`);
        eat(")");
        return resolve(`@${t.v}:${col.t === "id" ? col.raw ?? col.v : col.v}`);
      }
      eat("(");
      const args: Val[] = [];
      if (peek().v !== ")") { args.push(parseComparison()); while (peek().v === ",") { eat(","); args.push(parseComparison()); } }
      eat(")");
      return call(t.v, args);
    }
    throw new Error("Unexpected end of formula");
  }
  function call(fn: string, a: Val[]): Val {
    switch (fn) {
      case "IF": return truthy(a[0]) ? a[1] ?? "" : a[2] ?? "";
      case "ROUND": { const f = Math.pow(10, a[1] === undefined ? 0 : num(a[1])); return Math.round(num(a[0]) * f) / f; }
      case "MIN": return Math.min(...a.map(num));
      case "MAX": return Math.max(...a.map(num));
      case "SUM": return a.map(num).reduce((x, y) => x + y, 0);
      case "ABS": return Math.abs(num(a[0]));
      case "FLOOR": return Math.floor(num(a[0]));
      case "CEIL": return Math.ceil(num(a[0]));
      case "AND": return a.every(truthy);
      case "OR": return a.some(truthy);
      case "NOT": return !truthy(a[0]);
      case "CONCAT": return a.map(String).join("");
      default: throw new Error(`Unknown function ${fn}`);
    }
  }

  const result = parseComparison();
  if (peek().t !== "end") throw new Error(`Unexpected '${peek().v}'`);
  return result;
}

/** Returns an error message, or null when the formula parses. */
export function checkFormula(src: string): string | null {
  try { evaluate(src, () => 0); return null; } catch (e) { return (e as Error).message; }
}

/** Names a formula refers to: [bracketed] refs and bare identifiers that are not function calls. */
export function extractRefs(src: string): string[] {
  const toks = tokenize(src);
  const out = new Set<string>();
  toks.forEach((t, i) => {
    if (t.t === "ref") out.add(t.v);
    else if (t.t === "id" && t.v !== "TRUE" && t.v !== "FALSE" && toks[i + 1]?.v !== "(") out.add(t.raw ?? t.v);
  });
  return Array.from(out);
}

export const FUNCTION_NAMES = [...COLUMN_FUNCS, "IF", "ROUND", "MIN", "MAX", "SUM", "ABS", "FLOOR", "CEIL", "AND", "OR", "NOT", "CONCAT", "TRUE", "FALSE"];
