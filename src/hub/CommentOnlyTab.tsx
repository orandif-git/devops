import * as React from "react";
import { ControlRule } from "../core/types";
import { DEFAULT_ALLOWED, DEFAULT_LOCK_MESSAGE, DEFAULT_MESSAGE, newRuleId } from "../core/commentOnly";
import { getProject } from "../shared/ado";
import { listTeams, TeamRef } from "../shared/capacityStore";
import { PeopleList, TeamChips } from "./GridsTab";
import { Ctx, FieldInput, activate, delAt, setAt } from "./ui";

const blank = (n: number): ControlRule => ({ id: newRuleId(), name: `Rule ${n}`, enabled: true, mode: "lock", workItemTypes: [], teams: [], people: [], fields: [] });

function FieldChips(p: { value: string[]; onChange(v: string[]): void; addLabel: string }) {
  const { fields } = React.useContext(Ctx);
  const [draft, setDraft] = React.useState("");
  const add = () => { const v = draft.trim(); if (v && !p.value.some(x => x.toLowerCase() === v.toLowerCase())) p.onChange([...p.value, v]); setDraft(""); };
  return (
    <div>
      <div className="chips" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
        {p.value.map(f => { const known = fields.find(x => x.referenceName === f);
          return <span key={f} className="chip on" title={f}>{known ? `${known.name} (${f})` : f}
            <span role="button" tabIndex={0} onKeyDown={activate} aria-label={`Remove ${f}`} style={{ marginLeft: 6, cursor: "pointer" }} onClick={() => p.onChange(p.value.filter(x => x !== f))}>×</span></span>; })}
        {!p.value.length && <span className="muted">None yet.</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <FieldInput value={draft} onChange={setDraft} placeholder="Field name or reference, e.g. Custom.Budget" />
        <button className="btn" disabled={!draft.trim()} onClick={add}>{p.addLabel}</button>
      </div>
    </div>
  );
}

/** Who may not edit what on the work item form: any number of rules, each for its own people/teams, work item types and fields. */
export function CommentOnlyTab(p: { value?: ControlRule[]; onChange(v: ControlRule[] | undefined): void }) {
  const rules = p.value ?? [];
  const set = (i: number, patch: Partial<ControlRule>) => p.onChange(setAt(rules, i, { ...rules[i], ...patch }));
  const { types } = React.useContext(Ctx);
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [open, setOpen] = React.useState<string>();
  React.useEffect(() => { getProject().then(pr => { setProjectId(pr.id); return listTeams(pr.id); }).then(setTeams).catch(() => undefined); }, []);
  return (
    <div>
      <div className="card">
        <b>Controls: who may not edit what</b>
        <div className="help">Add as many rules as you need. Each rule has its own people or teams, work item types and fields, and works in one of two ways:
          <ul style={{ margin: "4px 0 4px 18px" }}>
            <li><b>Comments only</b>: the people can only add comments; a change to any other field is undone, except the fields you list as allowed.</li>
            <li><b>Lock specific fields</b>: the people cannot change the fields you list; everything else stays editable.</li>
          </ul>
          If a person is covered by several rules, the stricter result applies: a change is undone if any rule that applies to them protects that field. This works on the work item form only. Edits made from a board card, a backlog, a query, Excel or the REST API are not covered. It is a guard against editing, not access control. Team membership counts direct members only: add the person to the team, or list them in the rule. If a team cannot be read, the user is treated as not restricted. Do not list the people who administer these settings.</div>
      </div>

      {rules.map((r, i) => {
        const isOpen = open === r.id || (open === undefined && rules.length === 1);
        const who = [r.teams.length ? `${r.teams.length} team(s)` : "", r.people.length ? `${r.people.length} person(s)` : ""].filter(Boolean).join(" + ") || "nobody chosen";
        return (
          <div className="card" key={r.id} style={{ opacity: r.enabled ? 1 : .7 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn icon" aria-expanded={isOpen} aria-label={isOpen ? "Collapse rule" : "Expand rule"} onClick={() => setOpen(isOpen ? "" : r.id)}>{isOpen ? "▾" : "▸"}</button>
              <b>{r.name}</b>
              <span className="badge">{r.mode === "lock" ? `Locks ${r.fields.length} field(s)` : "Comments only"}</span>
              <span className="muted">{who} · {r.workItemTypes.length ? r.workItemTypes.join(", ") : "all types"}</span>
              <span className="spacer" style={{ flex: 1 }} />
              <label><input type="checkbox" checked={r.enabled} onChange={e => set(i, { enabled: e.target.checked })} /> On</label>
              <button className="btn danger" onClick={() => { if (window.confirm(`Delete “${r.name}”?`)) p.onChange(delAt(rules, i)); }}>Delete</button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8 }}>
                <label className="field"><span>Rule name</span><input value={r.name} onChange={e => set(i, { name: e.target.value })} /></label>
                <h3>What it does</h3>
                <label style={{ display: "block" }}><input type="radio" name={`m-${r.id}`} checked={r.mode === "lock"} onChange={() => set(i, { mode: "lock", fields: r.mode === "lock" ? r.fields : [] })} /> <b>Lock specific fields</b>: these people cannot change the fields listed below</label>
                <label style={{ display: "block" }}><input type="radio" name={`m-${r.id}`} checked={r.mode === "comments"} onChange={() => set(i, { mode: "comments", fields: r.mode === "comments" ? r.fields : [...DEFAULT_ALLOWED] })} /> <b>Comments only</b>: these people can only add comments, plus the fields listed below</label>
                <h3>{r.mode === "lock" ? "Fields they cannot edit" : "Fields that stay editable"}</h3>
                {r.mode === "comments" && <div className="help">The discussion (System.History) is always allowed.</div>}
                <FieldChips value={r.fields} onChange={fields => set(i, { fields })} addLabel="Add field" />
                {r.mode === "lock" && <div className="help">Fields filled by a calculation or a grid total are written by the extension and are never undone; make those read-only on the Read-only fields tab instead.</div>}
                <h3>Who it applies to</h3>
                <div className="help">Members of these Azure DevOps teams:</div>
                <TeamChips all={teams} value={r.teams} onChange={t => set(i, { teams: t })} />
                <div className="help">…and/or these people:</div>
                <PeopleList value={r.people} projectId={projectId} onChange={people => set(i, { people })} />
                <h3>Which work item types</h3>
                <div className="help">Leave all unselected to apply to every type.</div>
                <div className="chips" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
                  {types.map(t => <span role="button" tabIndex={0} onKeyDown={activate} key={t} className={"chip" + (r.workItemTypes.includes(t) ? " on" : "")}
                    onClick={() => set(i, { workItemTypes: r.workItemTypes.includes(t) ? r.workItemTypes.filter(x => x !== t) : [...r.workItemTypes, t] })}>{t}</span>)}
                </div>
                <label className="field"><span>Message shown when a change is undone</span>
                  <input value={r.message ?? ""} placeholder={r.mode === "lock" ? DEFAULT_LOCK_MESSAGE : DEFAULT_MESSAGE} onChange={e => set(i, { message: e.target.value || undefined })} /></label>
                {r.mode === "comments" && <div className="help">The Smart Grid on those work items becomes read-only for these people, and rules and calculations do not write to the work item for them.</div>}
                {r.mode === "lock" && <div className="help">If you lock a Smart Grid's data field, the grid becomes read-only for these people.</div>}
              </div>)}
          </div>);
      })}
      {!rules.length && <div className="card muted">No rules yet.</div>}
      <button className="btn primary" onClick={() => { const n = blank(rules.length + 1); p.onChange([...rules, n]); setOpen(n.id); }}>+ Add a rule</button>
    </div>
  );
}
