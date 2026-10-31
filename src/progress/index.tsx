import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { buildProgress, defaultProgress, ProgressModel, progressFields, ProgressSettings } from "../core/progress";
import { getFormService, getProject, init } from "../shared/ado";
import { loadConfig } from "../shared/configStore";
import { ProgressControl } from "./ProgressControl";

/**
 * Delivery progress: a compact, read-only stepper of the delivery stages, as the first group of the work item form.
 * It only reads the form (the stage field and the stage dates), so it never makes the work item dirty.
 */
function App(p: { settings: ProgressSettings }) {
  const [model, setModel] = React.useState<ProgressModel>({ kind: "hidden" });
  const ref = React.useRef<HTMLDivElement>(null);
  const refresh = React.useCallback(async () => {
    const fields = progressFields(p.settings), vals = (await (await getFormService()).getFieldValues(fields)) as Record<string, unknown>;
    setModel(buildProgress({ settings: p.settings, fields: Object.fromEntries(fields.map(f => [f, vals[f] == null ? "" : vals[f] instanceof Date ? (vals[f] as Date).toISOString() : String(vals[f])])), today: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) }));
  }, [p.settings]);
  React.useEffect(() => {
    SDK.register(SDK.getContributionId(), () => ({ onLoaded: () => { void refresh(); }, onFieldChanged: () => { void refresh(); }, onSaved: () => { void refresh(); }, onReset: () => { void refresh(); }, onRefreshed: () => { void refresh(); } }));
    refresh().catch(() => setModel({ kind: "hidden" }));
  }, [refresh]);
  // the frame is as tall as its content (nothing when the control is off)
  React.useEffect(() => { SDK.resize(undefined, model.kind === "hidden" ? 1 : Math.max(30, (ref.current?.offsetHeight ?? 40) + 6)); });
  return <div ref={ref}><ProgressControl model={model} /></div>;
}

async function main() {
  await init(false);
  const root = document.getElementById("root")!;
  try { const cfg = await loadConfig((await getProject()).id); ReactDOM.render(<App settings={cfg.progress ?? defaultProgress()} />, root); }
  catch { /* the control draws nothing when the settings cannot be read */ }
  await SDK.notifyLoadSucceeded();
}
main();
