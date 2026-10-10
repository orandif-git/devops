import { describe, expect, it } from "vitest";
import { evaluate, checkFormula } from "../src/core/expr";
import { parseCsv, toCsv } from "../src/core/csv";
import { columnTotals, mappedTotals, newRow, normalizeRow, optionsFor, parseStored, recompute, serialize, validateConfig, validateRows } from "../src/core/gridModel";
import { allowedChildValues, cascadeErrors, evaluateRules, hintedParent, importLegacyCascades } from "../src/core/rules";
import { GridConfig, Rule } from "../src/core/types";

const cfg: GridConfig = {
  columns: [
    { id: "qty", name: "Qty", type: "number", defaultValue: 1, required: true, total: "sum" },
    { id: "price", name: "Price", type: "number", min: 0 },
    { id: "amount", name: "Amount", type: "number", formula: "ROUND([qty]*[price], 2)", total: "sum" },
    { id: "cat", name: "Category", type: "dropdown", options: ["HW", "SW"] },
    { id: "item", name: "Item", type: "dropdown", dependsOn: { column: "cat", map: { HW: ["Laptop", "Mouse"], SW: ["IDE"] } } },
    { id: "who", name: "Owner", type: "identity" },
  ],
  totals: [{ column: "amount", aggregate: "sum", field: "Custom.Total" }],
};

describe("expr", () => {
  const r = (n: string) => ({ a: 4, b: 3, s: "x" } as Record<string, number | string>)[n];
  it("does arithmetic with precedence", () => expect(evaluate("[a]+[b]*2", r)).toBe(10));
  it("handles IF and comparison", () => expect(evaluate('IF([a]>[b],"big","small")', r)).toBe("big"));
  it("divide by zero is 0", () => expect(evaluate("1/0", r)).toBe(0));
  it("reports syntax errors", () => expect(checkFormula("1 +")).not.toBeNull());
  it("rejects unknown functions / code injection", () => {
    expect(checkFormula("alert(1)")).toMatch(/Unknown function/);
    expect(checkFormula("constructor.constructor('x')()")).not.toBeNull();
  });
});

describe("csv", () => {
  it("round trips quotes, commas and newlines", () => {
    const rows = [["a", 'b,"c"', "d\ne"], ["1", "", "3"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("grid model", () => {
  it("computes formulas and totals", () => {
    const rows = [normalizeRow({ qty: 2, price: 1.25 }, cfg), normalizeRow({ qty: 3, price: 10 }, cfg)];
    expect(rows.map(x => x.amount)).toEqual([2.5, 30]);
    expect(columnTotals(rows, cfg).amount).toBe(32.5);
    expect(mappedTotals(rows, cfg)).toEqual({ "Custom.Total": 32.5 });
  });
  it("clears dependent dropdown values that become invalid", () => {
    const row = normalizeRow({ cat: "HW", item: "Laptop" }, cfg);
    expect(row.item).toBe("Laptop");
    row.cat = "SW"; recompute(row, cfg);
    expect(row.item).toBe("");
    expect(optionsFor(cfg.columns[4], row)).toEqual(["IDE"]);
  });
  it("reads legacy array and html wrapped JSON", () => {
    expect(parseStored('[{"qty":5,"price":2}]', cfg)[0].amount).toBe(10);
    expect(parseStored('<div>{&quot;rows&quot;:[{&quot;qty&quot;:1,&quot;price&quot;:1}]}</div>', cfg)).toHaveLength(1);
    expect(parseStored("garbage", cfg)).toEqual([]);
  });
  it("serialize/parse round trip keeps child id", () => {
    const row = newRow(cfg); row._childId = 42;
    expect(parseStored(serialize([row]), cfg)[0]._childId).toBe(42);
  });
  it("validates required, min and config", () => {
    const row = normalizeRow({ qty: null, price: -1 }, cfg); row.qty = null;
    expect(validateRows([row], cfg).map(e => e.column).sort()).toEqual(["price", "qty"]);
    expect(validateConfig({ columns: [{ id: "a b", name: "x", type: "string" }] }).length).toBe(1);
  });
});

describe("rules", () => {
  const fields: Record<string, unknown> = { "System.State": "Closed", "Custom.Reason": "", "System.AreaPath": "P\\Cats\\Indoor", "Custom.Species": "Cat", "Custom.Breed": "Husky" };
  const get = (f: string) => fields[f];
  const rule: Rule = {
    id: "1", name: "Closed needs reason", enabled: true, workItemTypes: ["Bug"],
    when: { match: "all", conditions: [{ field: "System.State", op: "equals", value: "Closed" }] },
    then: [{ type: "requireField", field: "Custom.Reason" }, { type: "setValue", field: "Custom.Flag", value: "Y" }],
  };
  it("fires for matching type only", () => {
    const o = evaluateRules([rule], "Bug", get);
    expect(o.errors).toHaveLength(1);
    expect(o.setValues).toEqual({ "Custom.Flag": "Y" });
    expect(evaluateRules([rule], "Task", get).errors).toHaveLength(0);
  });
  it("supports otherwise + any", () => {
    const r2: Rule = { ...rule, when: { match: "any", conditions: [{ field: "System.State", op: "in", value: "New, Active" }] }, then: [], otherwise: [{ type: "error", message: "nope" }] };
    expect(evaluateRules([r2], "Bug", get).errors).toEqual(["nope"]);
  });
  it("dependent values + hints + legacy import", () => {
    const legacy = importLegacyCascades({ version: "1", cascades: { "Custom.Species": { Cat: { hint: { when: "Area Path", is: "P\\Cats" }, "Custom.Breed": ["Siamese"] }, Dog: { "Custom.Breed": ["Husky"] } } } });
    expect(legacy).toHaveLength(1);
    expect(allowedChildValues(legacy[0], "cat")).toEqual(["Siamese"]);
    expect(allowedChildValues(legacy[0], "")).toBeNull();
    expect(cascadeErrors(legacy, "Bug", get)).toHaveLength(1);
    expect(hintedParent(legacy[0], "P\\Cats\\Indoor")).toBe("Cat");
    expect(hintedParent(legacy[0], "P\\Dogs")).toBeNull();
  });
});

import { makeCatalog, validateProject } from "../src/hub/validate";
import { emptyConfig } from "../src/core/types";

describe("hub validation against real fields", () => {
  const cat = makeCatalog([
    { referenceName: "System.State", name: "State", type: "string", readOnly: false, allowedValues: ["New", "Active", "Closed"] },
    { referenceName: "Custom.Species", name: "Species", type: "string", readOnly: false, allowedValues: ["Cat", "Dog"] },
    { referenceName: "Custom.Breed", name: "Breed", type: "string", readOnly: false, allowedValues: ["Siamese", "Husky", "Lab"] },
    { referenceName: "Custom.Total", name: "Total", type: "double", readOnly: false },
    { referenceName: "Custom.Note", name: "Note", type: "plainText", readOnly: false },
  ], ["Bug"]);
  it("flags unknown fields and bad picklist values", () => {
    const c = emptyConfig();
    c.rules.push({ id: "1", name: "r", enabled: true, workItemTypes: [], when: { match: "all", conditions: [{ field: "Custom.Nope", op: "equals", value: "x" }] }, then: [{ type: "setValue", field: "System.State", value: "Bogus" }] });
    const msgs = validateProject(c, cat).map(i => i.message);
    expect(msgs.some(m => /does not exist/.test(m))).toBe(true);
    expect(msgs.some(m => /'Bogus' is not an allowed value/.test(m))).toBe(true);
  });
  it("checks cascade maps and grid total mappings", () => {
    const c = emptyConfig();
    c.cascades.push({ id: "c", parent: "Custom.Species", child: "Custom.Breed", workItemTypes: [], map: { Cat: ["Siamese"], Bird: ["Lab"] } });
    c.grids.g = { dataField: "Custom.Note", columns: [{ id: "a", name: "A", type: "number", total: "sum", formula: "[a" }], totals: [{ column: "a", aggregate: "sum", field: "System.State" }] };
    const issues = validateProject(c, cat);
    const msgs = issues.map(i => i.message).join("|");
    expect(msgs).toMatch(/'Bird' is not an allowed value/);
    expect(msgs).toMatch(/not mapped to any parent/);
    expect(msgs).toMatch(/Formula of 'a'/);
    expect(msgs).toMatch(/not numeric/);
  });
  it("accepts a clean config", () => {
    const c = emptyConfig();
    c.cascades.push({ id: "c", parent: "Custom.Species", child: "Custom.Breed", workItemTypes: [], map: { Cat: ["Siamese"], Dog: ["Husky", "Lab"] } });
    expect(validateProject(c, cat).filter(i => i.level === "error")).toEqual([]);
  });
});
