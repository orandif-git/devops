# Hardening guide

The extension adds **guards** inside its own pages and the work item form. A guard stops honest mistakes and casual edits; it does not stop someone who calls the Azure DevOps REST API, edits in Excel, or changes a board card. Use Azure DevOps itself where you need enforcement. The same table is shown in the hub under **Security**.

| Feature | Level | What it does not stop | To make it enforced |
|---|---|---|---|
| Grid & Rules settings | pages | Anyone who can call the Azure DevOps extension-data API could read or change the stored settings. | Treat the settings as configuration, not as secrets. Keep the project administrators group small. |
| Capacity register | pages | The same API route as above. | Prefer Azure DevOps team capacity as the source: it is protected by Azure DevOps permissions (team administrators). |
| Comment-only access | guard | Board cards, backlogs, query results, Excel and the REST API do not go through the form. | For real enforcement add process rules: a rule with the condition “current user is a member of group …” and the action “Make read-only” on each field. |
| Approvals (normal mode) | pages | Anyone who can edit the work item can change the stored status or the grid data by other means. | Switch on secure approvals (below). |
| Approvals (secure mode) | enforced | Rules such as “one team per kind of row” and “nobody approves their own row” are checked by the extension only. The name and time come from the approver's own session. | Create the approvals field, add a process rule that makes it read-only unless the user is in the approver group, and enter it in the grid's approval settings. |
| Calculated fields | guard | Excel, queries and the API can still change the field until the item is opened again. | Do not use a “Make read-only” rule on these fields: it blocks the extension's own write too. |
| Audit log | record | It is stored with the other extension data, so someone with access to that data could change or remove entries. | Export it to CSV regularly and keep the file with your records. |
| Backup files | record | The file is not encrypted and contains names, emails and business rules. | Store backup files like any confidential document. |
| Team-based rules | pages | Only direct members of a team are recognised; a person who is only in a group inside the team may not match. | Add people to the team directly, or list them by name. |

## Recipes
1. **Make a field editable only by a group.** Organization (or collection) settings → Process → your process → the work item type → Rules → New rule. Condition: *Current user is not a member of group …*. Action: *Make read-only* on the field. Repeat per field (a rule can hold several actions).
2. **Secure approvals.** Create a long-text field for the decisions. Add the rule from recipe 1 on that field for the approver group. Enter the field in the grid's approval settings (Approval → Secure approvals). Do not make the totals written by the extension read-only.
3. **Comment-only users.** Use recipe 1 for the fields they must not change; the extension's comment-only guard is a convenience on top of it.
4. **Limit who edits work items.** Project settings → Project configuration → Areas → Security: deny *Edit work items in this node* where needed.
5. **Keep administrators few.** Project and collection administrators can always change everything, including the extension's stored settings.
6. **Records.** Export the audit log to CSV regularly, download a backup before large changes, and store backup files like confidential documents (they contain names, emails and business rules).
