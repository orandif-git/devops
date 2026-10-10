import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import { getFormService, init } from "../shared/ado";
import { ReadOnlyValue } from "./ReadOnlyValue";

/**
 * Replaces the input of a field on the form with a read-only display, so users cannot type into values the
 * extension calculates (calculation results, grid totals). Add it to the field in the process layout editor.
 */
function App(props: { field: string }) {
  const [value, setValue] = React.useState<unknown>(undefined);
  const refresh = React.useCallback(async () => { setValue(await (await getFormService()).getFieldValue(props.field)); }, [props.field]);
  React.useEffect(() => {
    SDK.register(SDK.getContributionId(), () => ({
      onLoaded: () => { refresh(); }, onFieldChanged: () => { refresh(); }, onSaved: () => { refresh(); },
      onReset: () => { refresh(); }, onRefreshed: () => { refresh(); },
    }));
    refresh().catch(() => undefined);
  }, [refresh]);
  return <ReadOnlyValue value={value} />;
}

async function main() {
  await init(false);
  const root = document.getElementById("root")!;
  const field = (SDK.getConfiguration().witInputs ?? {}).FieldName as string | undefined;
  if (!field) root.innerHTML = '<div class="err">Pick the field in the control\'s “Field” input.</div>';
  else ReactDOM.render(<App field={field} />, root);
  SDK.resize(undefined, 34);
  await SDK.notifyLoadSucceeded();
}
main();
