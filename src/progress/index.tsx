import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { buildProgress, defaultProgress, ProgressModel, progressFields, ProgressSettings } from "../core/progress";
import { getFormService, getProject, init } from "../shared/ado";
import { loadWorkCalendar } from "../shared/capacityStore";
import { WorkCalendar } from "../../planner/src/core/workdays";
import { loadConfig } from "../shared/configStore";
import { ProgressControl } from "./ProgressControl";

/**
 * Delivery progress: a compact, read-only stepper of the delivery stages, as the first group of the work item form.
 * It only reads the form (the stage field and the stage dates), so it never makes the work item dirty.
 */
function App(p: { settings: ProgressSettings; calendar?: WorkCalendar }) {
  const [model, setModel] = React.useState<ProgressModel>({ kind: "hidden" });
  const ref = React.useRef<HTMLDivElement>(null);
  const refresh = React.useCallback(async () => {
    const fields = progressFields(p.settings), vals = (await (await getFormService()).getFieldValues(fields)) as Record<string, unknown>;
    setModel(buildProgress({ settings: p.settings, fields: Object.fromEntries(fields.map(f => [f, vals[f] == null ? "" : vals[f] instanceof Date ? (vals[f] as Date).toISOString() : String(vals[f])])), today: Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()), calendar: p.calendar }));
  }, [p.settings, p.calendar]);
  React.useEffect(() => {
    SDK.register(SDK.getContributionId(), () => ({ onLoaded: () => { void refresh(); }, onFieldChanged: () => { void refresh(); }, onSaved: () => { void refresh(); }, onReset: () => { void refresh(); }, onRefreshed: () => { void refresh(); } }));
    refresh().catch(() => setModel({ kind: "hidden" }));
  }, [refresh]);
  // the frame is always as tall as its content (one pixel when the control is off), also when the width changes and the content wraps: no scrollbar
  React.useEffect(() => {
    let last = -1;
    const fit = () => { const h = model.kind === "hidden" ? 1 : Math.max(30, Math.ceil(ref.current?.getBoundingClientRect().height ?? 40) + 4); if (h !== last) { last = h; SDK.resize(undefined, h); } };
    fit(); const ro = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(fit) : undefined; ro?.observe(ref.current!); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, [model]);
  return <div ref={ref}><ProgressControl model={model} look={{ design: p.settings.design, names: p.settings.names, status: p.settings.status, detail: p.settings.detail }} /></div>;
}

async function main() {
  await init(false);
  const root = document.getElementById("root")!;
  try {
    const id = (await getProject()).id, cfg = await loadConfig(id), settings = cfg.progress ?? defaultProgress();
    const calendar = settings.dayCount === "working" ? await loadWorkCalendar(id).catch(() => undefined) : undefined;   // not readable: calendar days
    ReactDOM.render(<App settings={settings} calendar={calendar} />, root);
  }
  catch { /* the control draws nothing when the settings cannot be read */ }
  await SDK.notifyLoadSucceeded();
}
main();
