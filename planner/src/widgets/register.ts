import * as SDK from "azure-devops-extension-sdk";

/** Register the widget object under the contribution's short id ("widget-over"), which is what the dashboard host asks for, and under the full id (publisher.extension.widget-over) for hosts that use that. */
export function registerContribution<T extends Object>(factory: () => T) {
  const full = SDK.getContributionId();
  const short = full.slice(full.lastIndexOf(".") + 1);
  SDK.register(short, factory);
  if (full !== short) SDK.register(full, factory);
}
