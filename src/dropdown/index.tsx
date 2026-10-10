import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import { Cascade } from "../core/types";
import { allowedChildValues } from "../core/rules";
import { getFormService, getProject, init, loadConfig } from "../shared/ado";

/**
 * Smart Dropdown: replaces a picklist field's control. Shows only the values that are valid
 * for the parent field's current value (per the Dependent Dropdowns configured in project settings).
 */
function App(props: { field: string; cascades: Cascade[] }) {
  const { field, cascades } = props;
  const [value, setValue] = React.useState("");
  const [all, setAll] = React.useState<string[]>([]);
  const [parents, setParents] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState("");
  const parentRefs = React.useMemo(() => Array.from(new Set(cascades.map(c => c.parent))), [cascades]);

  const refresh = React.useCallback(async () => {
    const svc = await getFormService();
    setValue(String((await svc.getFieldValue(field)) ?? ""));
    const pv = (await svc.getFieldValues(parentRefs)) as Record<string, unknown>;
    setParents(Object.fromEntries(Object.entries(pv).map(([k, v]) => [k, v == null ? "" : String(v)])));
  }, [field, parentRefs]);

  React.useEffect(() => {
    getFormService().then(s => s.getAllowedFieldValues(field)).then(v => setAll(v.map(String))).catch(() => setAll([]));
    SDK.register(SDK.getContributionId(), () => ({
      onLoaded: () => { refresh(); },
      onFieldChanged: () => { refresh(); },
      onSaved: () => { refresh(); },
      onReset: () => { refresh(); },
      onRefreshed: () => { refresh(); },
    }));
    refresh();
  }, [field, refresh]);

  // intersect the restrictions of every cascade targeting this field
  let options = all;
  const reasons: string[] = [];
  for (const c of cascades) {
    const allowed = allowedChildValues(c, parents[c.parent]);
    if (allowed) {
      const lower = allowed.map(a => a.toLowerCase());
      options = options.filter(o => lower.includes(o.toLowerCase()));
      reasons.push(`${c.parent} = ${parents[c.parent]}`);
    }
  }
  const stale = !!value && !options.some(o => o === value);

  React.useEffect(() => {
    SDK.resize(undefined, 40 + (stale ? 18 : 0));
  }, [stale]);

  const change = async (v: string) => {
    setValue(v); setMsg("");
    try { await (await getFormService()).setFieldValue(field, v); } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div style={{ padding: "2px 0" }}>
      <select style={{ width: "100%", height: 28 }} value={value} onChange={e => change(e.target.value)} title={reasons.length ? `Filtered by ${reasons.join(", ")}` : undefined}>
        <option value=""></option>
        {stale && <option value={value}>{value} (not valid)</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {stale && <div className="err" style={{ fontSize: 11 }}>This value isn't valid for {reasons.join(", ") || "the parent"}.</div>}
      {msg && <div className="err">{msg}</div>}
    </div>
  );
}

async function main() {
  await init(false);
  const root = document.getElementById("root")!;
  try {
    const inputs = (SDK.getConfiguration().witInputs ?? {}) as { FieldName?: string };
    const field = inputs.FieldName;
    if (!field) throw new Error("Select the field in the control's 'Field' input.");
    const cfg = await loadConfig((await getProject()).id);
    const type = String(await (await getFormService()).getFieldValue("System.WorkItemType"));
    const cascades = cfg.cascades.filter(c => c.child === field && (!c.workItemTypes.length || c.workItemTypes.includes(type)));
    ReactDOM.render(<App field={field} cascades={cascades} />, root);
  } catch (e) {
    root.innerHTML = `<div class="err">${String((e as Error).message).replace(/</g, "&lt;")}</div>`;
  }
  await SDK.notifyLoadSucceeded();
}
main();
