import * as React from "react";
import { CommentOnlyConfig } from "../core/types";
import { DEFAULT_ALLOWED, DEFAULT_MESSAGE } from "../core/commentOnly";
import { getProject } from "../shared/ado";
import { listTeams, TeamRef } from "../shared/capacityStore";
import { PeopleList, TeamChips } from "./GridsTab";
import { Ctx, Section, activate } from "./ui";

const EMPTY: CommentOnlyConfig = { enabled: false, workItemTypes: [], teams: [], people: [], allowedFields: [...DEFAULT_ALLOWED] };

/** Users or teams who may only add comments on the work item form: every other field change is undone. */
export function CommentOnlyTab(p: { value?: CommentOnlyConfig; onChange(v: CommentOnlyConfig | undefined): void }) {
  const v = p.value ?? EMPTY;
  const set = (patch: Partial<CommentOnlyConfig>) => p.onChange({ ...v, ...patch });
  const { types } = React.useContext(Ctx);
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [projectId, setProjectId] = React.useState("");
  React.useEffect(() => { getProject().then(pr => { setProjectId(pr.id); return listTeams(pr.id); }).then(setTeams).catch(() => undefined); }, []);
  return (
    <div>
      <Section id="commentonly" no={1} title="Comment-only access" help="Selected people or teams can only add comments on the work item form." status={v.enabled ? "ok" : "off"} open={v.enabled}>
      <div className="card">
        <label><input type="checkbox" checked={v.enabled} onChange={e => set({ enabled: e.target.checked })} /> <b>Restrict selected people and teams to comments only</b> on the work item form</label>
        <div className="help">For them, a change to any field except the discussion is undone at once and a message is shown. This works on the work item form only. Edits made from a board card, a backlog, a query, Excel or the REST API are not covered. It is a guard against editing, not access control. Team membership counts direct members only (a person who is only in a group inside the team may not be recognised): add the person to the team, or list them below. If the team cannot be read, the user is treated as not restricted.</div>
      </div>
      {v.enabled && (
        <>
          <h3>Who is restricted</h3>
          <div className="help">Members of these Azure DevOps teams:</div>
          <TeamChips all={teams} value={v.teams} onChange={t => set({ teams: t })} />
          <div className="help">…and/or these people:</div>
          <PeopleList value={v.people} projectId={projectId} onChange={people => set({ people })} />
          <div className="help">Project administrators are restricted too if they are listed here. Do not list the people who administer these settings.</div>
          <h3>Which work item types</h3>
          <div className="help">Leave all unselected to apply to every type.</div>
          <div className="chips" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
            {types.map(t => <span role="button" tabIndex={0} onKeyDown={activate} key={t} className={"chip" + (v.workItemTypes.includes(t) ? " on" : "")}
              onClick={() => set({ workItemTypes: v.workItemTypes.includes(t) ? v.workItemTypes.filter(x => x !== t) : [...v.workItemTypes, t] })}>{t}</span>)}
          </div>
          <h3>Fields that stay editable</h3>
          <label className="field"><span>Reference names, comma separated (the discussion, System.History, is always allowed)</span>
            <input defaultValue={v.allowedFields.join(", ")} key={v.allowedFields.join("|")} placeholder="System.History"
              onBlur={e => set({ allowedFields: Array.from(new Set(e.target.value.split(",").map(s => s.trim()).filter(Boolean))) })} /></label>
          <label className="field"><span>Message shown when a change is undone</span>
            <input value={v.message ?? ""} placeholder={DEFAULT_MESSAGE} onChange={e => set({ message: e.target.value || undefined })} /></label>
          <div className="help">The Smart Grid on those work items becomes read-only for restricted users, and rules and calculations do not write to the work item for them.</div>
        </>
      )}
      </Section>
    </div>
  );
}
