import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { IConfigurableWidget, WidgetSettings } from "azure-devops-extension-api/Dashboard";
import { WidgetStatusHelper } from "azure-devops-extension-api/Dashboard/WidgetHelpers";
import "../../../src/shared/styles.css";
import "../hub/planner.css";
import "./widgets.css";
import { getProject } from "../../../src/shared/ado";
import { parseWidgetConfig } from "../core/widgets";
import { fetchWidget } from "./data";
import { Kind, OverList, Tile, TeamMap } from "./views";

async function draw(kind: Kind, s: WidgetSettings) {
  const root = document.getElementById("root")!;
  const cfg = parseWidgetConfig(s.customSettings?.data);
  try {
    const project = await getProject();
    const d = await fetchWidget(project, cfg);
    ReactDOM.render(kind === "tile" ? <Tile d={d} /> : kind === "over" ? <OverList d={d} /> : <TeamMap d={d} />, root);
    return WidgetStatusHelper.Success();
  } catch (e) {
    // Failure() makes the dashboard show a generic "Widget failed to load" card; show the reason in the widget instead
    const m = (e as Error)?.message || String(e);
    ReactDOM.render(<div className="wg err" role="alert"><b>Resource Planner</b><div>{m}</div></div>, root);
    return WidgetStatusHelper.Success();
  }
}

/** Register the widget the dashboard asked for (one page per widget; the contribution id picks the registration). */
export async function startWidget(kind: Kind) {
  await SDK.init({ loaded: false, applyTheme: true });
  const widget: IConfigurableWidget = {
    preload: () => WidgetStatusHelper.Success(),
    load: s => draw(kind, s),
    reload: s => draw(kind, s),
  };
  SDK.register(SDK.getContributionId(), () => widget);
  await SDK.notifyLoadSucceeded();
}
