# Changelog

## Resource Planner & Heatmap (separate extension, `planner/`)
- Resource Planner **Settings are for project administrators only**, and **Access teams** now works: when teams are chosen, only their members and project administrators can open the Planner, the Executive Dashboard and the dashboard widgets (a display guard; Azure DevOps still trims the Epics each person can read).
- The Resource Planner now has four tabs: **Planner** (heatmap, timeline and Epic Gantt are views inside it), **Executive** (when enabled), **Data & diagnostics** (the former Data check and Diagnostics together) and **Settings** (administrators). The separate Heatmap, Resource timeline and Epic Gantt tabs are removed.
- Resource plan: **Group by** Team › Person › Epic, **Epic › Team › Person** (all Epics first, then teams, then people) or Person › Epic; toolbar tidied into two rows (view, grouping, units, expand/collapse · period, team, Epics, search, filters). Settings › Display: default view, grouping and units for the Planner.
- Planner heatmap is now a **resource plan**: each person has a ▸ expander showing their Epics (with hours per month), a frozen name and **Total** column, team header totals, a **Hours / % of capacity / FTE** switch and Expand all / Collapse all. All booked hours count as committed (no committed/requested split).
- New one-screen **Planner** tab (default): compact filter bar with removable chips and a filters drawer, KPI strip with clickable bands, Heatmap / Timeline / Epic Gantt switch, collapsible teams, linked month highlight, detail panel (Esc closes). The separate Heatmap, Resource timeline and Epic Gantt tabs remain.
- New **Executive** tab in the Resource Planner (off until “Enable the Executive Dashboard” is ticked in Settings; no separate menu item): every Epic with status (on track / needs attention / at risk / not started / not assessed / done), reasons, forecast finish, delivery confidence, a brief, category breakdown and an “Ask the dashboard” box that turns a question into filters (no AI; numbers come from the data). Category fields, go-live date, progress sources (percent field, completed ÷ total, ticked grid rows), states and limits are set in Settings › Executive dashboard.
- Heatmap, resource timeline, Epic Gantt, three dashboard widgets (utilization, over capacity, team map), Diagnostics tab, keyboard-accessible tabs, Marketplace page. Read-only (`vso.work`, `vso.project`). Pilot checklist: `docs/planner-pilot-checklist.md`.

## 2.2.0 (next)
**Resource Capacity**
- Automatic grids such as Resource Capacity show read-only cells as plain text (nothing cut off, numbers right-aligned under their headings, people shown by name with the full address on hover).
- Rows with hours on other Epics get a ▸ expander: it opens the list of those Epics (id, title, hours that month) right under the row, with Expand all / Collapse all; the filter also finds Epics by title and a click opens the Epic. Read-only; exports stay flat rows.

**Reliability**
- Capacity records and live allocations now use short, fixed-length ids. Long ids were seen to be mistaken for each other on Azure DevOps (each new audit entry replaced the previous one). Older records are still read, de-duplicated, and can be moved with **Diagnostics → Move to short ids**.
- Saving the settings is version-checked: if another administrator saved in the meantime you can load their version or overwrite. Preset saves from work items retry on a clash.
- New **Diagnostics** tab: storage, id length limit, version check, permissions, teams/members/fields/capacity reads, settings consistency; results can be copied.

**Features**
- Grid columns can be **hidden** (Grids tab › column › “Hide this column in the grid”): they are still calculated and saved and can feed other columns, totals and status columns, but are not drawn, so a rating can be shown without the weights and scores behind it.
- The Boards **Capacity** page is gone: the capacity register editor and the utilization overview are shown in the hub's **Capacity** tab, and only when the capacity register is the capacity source (nothing to maintain when capacity comes from Azure DevOps team capacity).
- **Fix (Server 2020):** the audit log failed with “localeCompare is not a function” because stored date-like text came back as Date objects; documents are now turned back into text.
- Grid formulas can total a column per group: `GROUPTOTAL`, `GROUPAVG`, `GROUPMAX`, `GROUPMIN`, `GROUPCOUNT` (for example `GROUPTOTAL(score, category)` = the score of the rows with this row's category). Used by the new weighted NFR Risk Assessment template (`scripts/merge-nfr-assessment.js`).
- Audit log of settings changes with a mandatory reason and comments, shown as a clean plain-language table; export to CSV; retention with export before clearing.
- Backup and restore of all settings in selectable parts (replace or add missing only), with a safety backup and audit entry.
- **Controls now take any number of rules.** Each rule has its own people/teams, work item types, message and an on/off switch, and works as *Comments only* or *Lock specific fields* (for example Group 2 cannot edit two Epic fields, Group 3 three other fields). When a person is in several groups the stricter result applies. Your existing comment-only setting becomes “Rule 1” automatically; backups made before this still restore.
- Settings and capacity editing for project administrators only; new **Controls** tab with comment-only access on the work item form.
- Per-column display format for months and dates; configurable default allocation %; team from Azure DevOps team/group membership with optional override.
- Calculated Epic fields: Read-only Value control supports dates and yes/no; outputs corrected when the work item is opened.
- Hub tabs redesigned (single line, count badges).

## 2.1.0
Release 2.1.0 (see the Marketplace page).
