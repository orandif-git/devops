/** What each feature really protects, and how to make it enforced by Azure DevOps itself. Shown on the Security tab and used in the docs. */
export type Level = "enforced" | "pages" | "guard" | "record";
export interface SecurityRow { feature: string; level: Level; what: string; bypass: string; harden: string }

export const LEVEL_LABEL: Record<Level, string> = {
  enforced: "Enforced by Azure DevOps",
  pages: "Checked by the extension's pages",
  guard: "Guard on the work item form",
  record: "Record, not evidence",
};

export const SECURITY_ROWS: SecurityRow[] = [
  { feature: "Grid & Rules settings", level: "pages", what: "Only project administrators can open and save the settings page.",
    bypass: "Anyone who can call the Azure DevOps extension-data API could read or change the stored settings.",
    harden: "Treat the settings as configuration, not as secrets. Keep the project administrators group small." },
  { feature: "Capacity register", level: "pages", what: "Only project administrators can edit the register and the capacity settings.",
    bypass: "The same API route as above.",
    harden: "Prefer Azure DevOps team capacity as the source: it is protected by Azure DevOps permissions (team administrators)." },
  { feature: "Controls (comment-only and locked fields)", level: "guard", what: "Any number of rules: selected people or teams can only comment, or cannot change listed fields, on the work item form: such changes are undone at once.",
    bypass: "Board cards, backlogs, query results, Excel and the REST API do not go through the form.",
    harden: "For real enforcement add process rules: a rule with the condition “current user is a member of group …” and the action “Make read-only” on each field." },
  { feature: "Approvals (normal mode)", level: "pages", what: "Only chosen approvers see Approve / Reject, and approved rows lock.",
    bypass: "Anyone who can edit the work item can change the stored status or the grid data by other means.",
    harden: "Switch on secure approvals (below)." },
  { feature: "Approvals (secure mode)", level: "enforced", what: "Decisions are kept in a separate field that a process rule makes writable for the approver group only; a row counts as approved only while its values match.",
    bypass: "Rules such as “one team per kind of row” and “nobody approves their own row” are checked by the extension only. The name and time come from the approver's own session.",
    harden: "Create the approvals field, add a process rule that makes it read-only unless the user is in the approver group, and enter it in the grid's approval settings." },
  { feature: "Calculated fields", level: "guard", what: "The Read-only Value control shows totals and results with a lock, and a wrong value is corrected when the work item is opened.",
    bypass: "Excel, queries and the API can still change the field until the item is opened again.",
    harden: "Do not use a “Make read-only” rule on these fields: it blocks the extension's own write too." },
  { feature: "Audit log", level: "record", what: "Who changed the settings, when, what and why.",
    bypass: "It is stored with the other extension data, so someone with access to that data could change or remove entries.",
    harden: "Export it to CSV regularly and keep the file with your records." },
  { feature: "Backup files", level: "record", what: "A complete copy of the settings (and, if ticked, capacity and the audit log).",
    bypass: "The file is not encrypted and contains names, emails and business rules.",
    harden: "Store backup files like any confidential document." },
  { feature: "Team-based rules", level: "pages", what: "Approver, comment-only and team-column rules use Azure DevOps team membership.",
    bypass: "Only direct members of a team are recognised; a person who is only in a group inside the team may not match.",
    harden: "Add people to the team directly, or list them by name." },
];

export const HARDENING_STEPS = [
  "Make a field editable only by a group: Organization (or collection) settings → Process → your process → the work item type → Rules → New rule. Condition: “Current user is not a member of group …”; action: “Make read-only” on the field.",
  "Secure approvals: create a long-text field for the decisions, add that rule on it for the approver group, and enter the field in the grid's approval settings.",
  "Limit who can edit work items at all with Area Path permissions (Project settings → Project configuration → Areas → Security).",
  "Keep the project and collection administrator groups small: they can always change everything.",
  "Download a backup before big changes and export the audit log regularly.",
];
