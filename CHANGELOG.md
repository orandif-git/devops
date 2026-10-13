# Changelog

## Resource Planner & Heatmap (separate extension, `planner/`)
- New one-screen **Planner** tab (default): compact filter bar with removable chips and a filters drawer, KPI strip with clickable bands, Heatmap / Timeline / Epic Gantt switch, collapsible teams, linked month highlight, detail panel (Esc closes). The separate Heatmap, Resource timeline and Epic Gantt tabs remain.
- Heatmap, resource timeline, Epic Gantt, three dashboard widgets (utilization, over capacity, team map), Diagnostics tab, keyboard-accessible tabs, Marketplace page. Read-only (`vso.work`, `vso.project`). Pilot checklist: `docs/planner-pilot-checklist.md`.

## 2.2.0 (next)
**Reliability**
- Capacity records and live allocations now use short, fixed-length ids. Long ids were seen to be mistaken for each other on Azure DevOps (each new audit entry replaced the previous one). Older records are still read, de-duplicated, and can be moved with **Diagnostics → Move to short ids**.
- Saving the settings is version-checked: if another administrator saved in the meantime you can load their version or overwrite. Preset saves from work items retry on a clash.
- New **Diagnostics** tab: storage, id length limit, version check, permissions, teams/members/fields/capacity reads, settings consistency; results can be copied.

**Features**
- Audit log of settings changes with a mandatory reason and comments, shown as a clean plain-language table; export to CSV; retention with export before clearing.
- Backup and restore of all settings in selectable parts (replace or add missing only), with a safety backup and audit entry.
- Settings and capacity editing for project administrators only; new **Controls** tab with comment-only access on the work item form.
- Per-column display format for months and dates; configurable default allocation %; team from Azure DevOps team/group membership with optional override.
- Calculated Epic fields: Read-only Value control supports dates and yes/no; outputs corrected when the work item is opened.
- Hub tabs redesigned (single line, count badges).

## 2.1.0
Release 2.1.0 (see the Marketplace page).
