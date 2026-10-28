# Resource Planner & Heatmap

See **who works on which Epic** and **how much of each person's capacity is used** – in Azure Boards, without leaving the browser.

## What you get
- **Resource plan (Planner tab)** – group by team, Epic or person; expand to people and Epics; hours, % of capacity or FTE; heatmap, timeline and Epic Gantt views in one screen. The heatmap shows people × months with a traffic light (spare / healthy / nearly full / over capacity). Colours always come with a symbol and a word, so nothing depends on colour alone. Thresholds are configurable. Click a cell to see the Epics and hours behind it; click an Epic to open it.
- **Resource timeline** – one row per person with a bar for each task, grouped by team, with an over-capacity flag.
- **Epic Gantt** – bars from each Epic's start date to its target date, grouped by area, state or team, coloured by state, with a today line and a late flag.
- **Executive Dashboard** (its own board, switched on in Settings) – every Epic with its status, reasons and forecast, in three layouts: a report with charts and a table, a portfolio map, and a roadmap with forecast slip. Slicers, one search box for anything, a detail panel, saved filters and personal saved views.
- **Dashboard widgets** – utilization, people over capacity and a team utilization map, each configurable by month, team and saved query.
- Filters by saved query, team, state, extra Epic fields and name. CSV export. Works in light and dark themes and from the keyboard.

## Where the numbers come from
- **Booked hours** are read from the Smart Grid (Work Item Grid & Rules) stored on each Epic – for example a Resource Allocation or timesheet grid. Several grids can be combined.
- **Available hours** come from Azure DevOps **team capacity** (hours per day, days off, team days off) of the teams you choose.

## Set-up (about 5 minutes, once per project)
Boards › **Resource Planner** › **Settings**: choose the Epic start/target date fields, pick the grid field and let the planner detect and map its columns, choose the capacity teams and the default period. Use **Diagnostics** to see what was read and what needs attention.

## Read-only and private
- Needs only the **read** permissions `vso.work` and `vso.project`. It never edits work items.
- Nothing leaves your Azure DevOps organization or server: no external services, no tracking.
- Epics are read as the signed-in user, so area-path permissions apply. Anyone who can open the planner can see the workload of the people in the Epics they can read.
- Works with Azure DevOps Services and Azure DevOps Server 2020 and later.

## Support
Report problems with the **Data & diagnostics → Copy results** text at https://github.com/orandif-git/devops/issues.
