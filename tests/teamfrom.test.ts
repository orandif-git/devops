import { describe, expect, it } from "vitest";
import { applyTeamFrom, buildTeamBook, setTeamBooks, teamBookKey } from "../src/core/teamBook";
import { newRow, recomputeAll, validateConfig, validateRows } from "../src/core/gridModel";
import { defaultPresetColumns } from "../src/core/presets";
import { GridConfig } from "../src/core/types";

const teams = [{ id: "t1", name: "Transformation Unit" }, { id: "t2", name: "NFR" }, { id: "t3", name: "InfoSec" }];
const cfg: GridConfig = { columns: [
  { id: "res", name: "Resource", type: "identity", required: true },
  { id: "team", name: "Team", type: "string", required: true, teamFrom: { resource: "res", teams: [teams[0], teams[1]] } },
] };
const book = buildTeamBook([
  { team: "Transformation Unit", members: ["Tennyson G <CBQNT2000\\utennys>", "Laith I <CBQNT2000\\uiskan>"] },
  { team: "NFR", members: ["Tennyson G <CBQNT2000\\utennys>"] },
  { team: "InfoSec", members: ["Hassan A <CBQNT2000\\uhabu>"] },
]);

describe("team from Azure DevOps team / group membership", () => {
  it("lists the chosen teams the person belongs to, with or without the domain", () => {
    expect(book("Tennyson G <utennys>")).toEqual(["Transformation Unit", "NFR"]);
    expect(book("Laith I <CBQNT2000\\uiskan>")).toEqual(["Transformation Unit"]);
    expect(book("Nobody <zzz>")).toEqual([]);
  });
  it("fills the column when a resource is picked, only with the teams chosen for that column", () => {
    setTeamBooks(new Map([[teamBookKey(cfg.columns[1].teamFrom!.teams), book]]));
    const rows = recomputeAll([{ ...newRow(cfg), res: "Tennyson G <utennys>" }, { ...newRow(cfg), res: "Hassan A <uhabu>" }, { ...newRow(cfg), res: "Laith I <uiskan>" }], cfg);
    expect(rows.map(r => r.team)).toEqual(["Transformation Unit, NFR", "", "Transformation Unit"]);   // InfoSec is not one of the chosen teams
    setTeamBooks(undefined);
  });
  it("keeps the stored value until the members have been read, and is never a required cell or a preset column", () => {
    setTeamBooks(undefined);
    const row = { ...newRow(cfg), res: "Tennyson G <utennys>", team: "Transformation Unit" };
    applyTeamFrom(row, "team", cfg.columns[1].teamFrom!);
    expect(row.team).toBe("Transformation Unit");
    expect(validateRows([{ ...newRow(cfg), res: "Tennyson G <utennys>" }], cfg).map(e => e.column)).toEqual([]);     // an empty team is not "required"
    expect(defaultPresetColumns(cfg)).toEqual([]);
  });
  it("is checked in the settings", () => {
    expect(validateConfig(cfg)).toEqual([]);
    expect(validateConfig({ columns: [{ id: "t", name: "T", type: "string", teamFrom: { resource: "nope", teams: [teams[0]] } }] }).join("|")).toMatch(/unknown column/);
    expect(validateConfig({ columns: [{ id: "r", name: "R", type: "identity" }, { id: "t", name: "T", type: "string", teamFrom: { resource: "r", teams: [] } }] }).join("|")).toMatch(/at least one team/);
  });
});
