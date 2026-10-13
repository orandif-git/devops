# Pilot test checklist

Run once on a **test project** on Azure DevOps Server 2020 (and once on Azure DevOps Services) after every install or upgrade. Tick each line; note the first thing that fails and copy the **Diagnostics** result (Grid & Rules → Diagnostics → Run checks → Copy results).

## 0. Install
- [ ] Upload the new `.vsix`, hard-refresh the browser (Ctrl+Shift+R), check the version under Extensions.
- [ ] Grid & Rules → **Diagnostics → Run checks**: every line is ✔ (a ⚠ for "not a project administrator" is fine for a non-admin account).
- [ ] If "Stored data with long ids" shows ⚠, press **Move to short ids** and run the checks again.

## 1. Settings, audit and access
- [ ] As a **project administrator**: Grid & Rules opens. As a **non-administrator**: it shows "Only project administrators…".
- [ ] Change one setting, **Save**: the reason/comments pop-up appears and cannot be confirmed with fewer than 10 characters each.
- [ ] Make **three** separate changes (save each). Audit log shows **three** entries, newest first, each in plain language; "Show technical detail" shows the stored values.
- [ ] Open the page in two browser windows, change and save in window 1, then save in window 2: window 2 offers **Load their version / Overwrite**.
- [ ] Audit log → **Export CSV** works and contains the "What changed" column.

## 2. Backup and restore
- [ ] **Download backup** (all parts ticked except the audit log). The file opens as JSON.
- [ ] Change a dropdown value, then **Restore** only *Grids* with **Replace**: the preview shows the change, a "before-restore" file downloads, the value is back, and the audit log has a "Restore from backup" entry.
- [ ] Restore with **Add missing only**: nothing existing is overwritten.

## 3. Grid, calculations and fields
- [ ] Open an Epic with the grid: add rows, totals update, the data field saves, the work item saves and reopens with the same rows.
- [ ] A total mapped to an Epic field fills and shows with a lock (Read-only Value control); typing is not possible.
- [ ] Change that field by hand through a query/Excel, reopen the Epic: it is corrected (the item shows as modified; Save).
- [ ] **No** "Make read-only" process rule on a mapped field (if one exists the grid shows "Totals not saved to…").
- [ ] A month/date column with a **Show months / dates as** format displays and exports in that format.

## 4. Capacity and scheduling
- [ ] Capacity source = team capacity: **Check what is read** lists the people; or register: add two people with similar names, both stay after reload.
- [ ] Enter start date, effort and allocation %: the end date and monthly hours calculate; the derived capacity grid shows the person and team.
- [ ] Default allocation % set to 0: a new row shows "Allocation % must be above 0" until filled.
- [ ] Utilization overview: the same Epic is not counted twice.

## 5. Approvals
- [ ] Approve and reject rows as an approver; Reviewed by/at show the right user and time zone.
- [ ] A non-approver does not see the buttons; editing an approved row resets it to pending (if configured).
- [ ] Overall review status field shows the expected wording.

## 6. Controls (comment-only)
- [ ] With a restricted test user: open an Epic, change a field: it jumps back and the message appears; add a comment: it works; the grid is read-only.
- [ ] As an unrestricted user: nothing changes.

## 7. Team from group
- [ ] Pick a resource who is a direct member of a chosen team: the team column fills. A member of two chosen teams shows both names.
- [ ] With **Allow users to type a different team**: a typed value stays; changing the resource refills it.

## Record the result
Version tested: ______  Environment: Server 2020 / Services  Date: ______  Tester: ______
First failure (step number and message): ______
