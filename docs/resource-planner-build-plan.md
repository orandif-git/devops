# Resource Planner – build plan

Status: **plan for approval, nothing built yet.** Prototype: `prototypes/resource-planner.html` (screenshots next to it).

## 1. What we are building
A separate Azure DevOps extension (working name **Resource Planner**) that gives managers:
1. **Utilization heatmap** – people × months, banded traffic light (spare / healthy / nearly full / over), band counts, click a band to highlight, click a cell for the Epics and hours behind it.
2. **Resource timeline** – one row per person, bars per Epic task, over-capacity flag.
3. **Epic Gantt** – bars from the Epic's start-date field to its target-date field, grouped by team/area, coloured by state, late flag, today line.
4. **Dashboard widgets** – utilization tile, over-capacity list, team mini-heatmap.
5. Click-through: every Epic and related work item opens its form (dialog, new-tab fallback). Read-only: nothing is edited from the planner.

Scope facts from the discussion: one project, Epics only (600–800 a year), 150–175 people, 10–15 teams, Server 2020 **and** Services, hours from the Resource Allocation grid, available capacity from Azure DevOps team capacity, Epic dates in custom fields, filters by saved query **and** on-page filters.

## 2. Architecture
- **Separate extension** (`resource-planner`, same publisher) in the same repository under `planner/`, with its own manifest (`vss-extension.planner.json`) and webpack entries. It imports pure logic from `src/core` (identity keys, native capacity, scheduling, time, JSON extraction) through a webpack alias, so there is one copy of that logic and no publishing step between them.
- **Scopes:** `vso.work` (read) and `vso.project` – no write scope. Epics are read as the signed-in user, so Azure DevOps already trims what each person can see by area path.
- **Hosting:** a hub in **Boards** (like the Capacity page) plus dashboard widgets.
- **No dependency on the current extension's stored data** (extension data belongs to one extension). The planner reads only work items and Azure DevOps team capacity.
- **Compatibility:** explicit REST api-versions with a fallback (the technique already proven in the current extension for Server 2020).

### 2.1 Data contract with the Smart Grid
Each Epic stores `{"version":1,"rows":[{ "_id", "<columnId>": value, …, "_months": {"2026-10": 40.5}, "_schedErr"?, "_schedFor"? }]}` in its data field.
- Hours per person and month: **`_months`** of each row (already calculated by the grid when the row is scheduled by dates).
- The planner needs, once, in its settings: the **data field** reference name, and the **column ids** for resource, start, end, allocation and review status (and which status values count as rejected). A **"Detect from a sample Epic"** helper lists the keys found in one Epic's rows with sample values, so the administrator picks instead of typing.
- Rows without `_months` (not scheduled / calendar missing) are counted and reported in Diagnostics; optional fallback: spread effort over working days with the shared scheduling engine.
- The planner **refuses unknown `version`s** and a **contract test** builds rows with the current extension's serializer and parses them with the planner's parser, so a future format change cannot break it silently.

### 2.2 Reading 600–800 Epics quickly
1. Run the chosen saved query or the filter (translated to WIQL) → Epic ids (limit 20,000).
2. Fetch fields in batches of 200 (`workitemsbatch`): title, state, area, iteration, ChangedDate, the start/target custom fields, the grid data field.
3. **Incremental cache** in IndexedDB keyed by project: on later visits ask only for Epics with `ChangedDate` after the last sync (plus deleted/closed handling), merge, recompute.
4. First load with progress bar (a few seconds expected); later loads near instant. Manual **Refresh** and "last refreshed" always visible.
5. Parsing and aggregation in a Web Worker if profiling shows the main thread blocks.

### 2.3 Available capacity
Per person and month from Azure DevOps team capacity of the teams chosen in settings (hours per day × working days − team days off − the person's days off), reusing the proven reader in the current extension (`nativeCapacity.ts`, calendar book). People are matched with the domain-insensitive key used elsewhere.

## 3. Phases
Estimates are focused build effort, excluding your testing time; each phase ends with something you can run on Server 2020 before the next starts.

| Phase | Deliverable | Effort | Done when |
|---|---|---|---|
| **0 Skeleton** | Manifest, hub in Boards, build scripts, dev manifest, empty page that loads on Server 2020 and Services | 0.5 d | Page opens on both; read-only scopes only |
| **1 Data layer** | Settings (fields, column mapping + detect helper, capacity teams, thresholds, saved views), query runner (saved queries + filter → WIQL), batch reader, incremental cache, grid parser, person-month aggregation, capacity reader | 4 d | 800 synthetic Epics load under the agreed time; contract and aggregation tests pass; Diagnostics lines for reading |
| **2 Heatmap** | The prototype's screen with live data: filters, KPI tiles, bands + thresholds + highlight, Shades mode, table view, side panel, Epic dialog with related items (children/parent/related loaded on open), CSV export | 4 d | Numbers match the Epics' grids for a hand-checked sample; clicking opens the Epic |
| **3 Timeline + Gantt** | Per-person timeline and Epic Gantt with grouping, state colours, today line, late flag, click-through, virtualised rows | 4 d | 175 people / 800 Epics scroll smoothly; dates match the fields |
| **4 Widgets** | 2–3 dashboard widgets with a small configuration (query, team, month) | 3 d | Widgets render on a dashboard on Server 2020 and Services |
| **5 Hardening & release** | Diagnostics tab (reads, api-versions, permissions, rows without `_months`, unmatched people), settings validation, accessibility and dark-mode pass, Marketplace page, hardening note (read-only, privacy), pilot checklist | 3 d | Pilot checklist passes on both platforms |

Total about **18–19 build days**, realistically 4–5 weeks including your testing between phases.

## 4. Testing
- **Unit:** parser, `_months` aggregation, identity matching, bands/thresholds, WIQL builder, incremental-cache merge, capacity calculation (with fixtures from real, anonymised Epics).
- **Contract:** serializer of the current extension → parser of the planner.
- **Performance:** synthetic 800 Epics × 30 rows; budgets for first load, refresh, heatmap render, Gantt scroll.
- **Component/DOM:** filters, highlight, panel, dialog, keyboard access.
- **Visual:** headless-browser screenshots per view in light and dark.
- **Pilot:** a checklist run on a Server 2020 test project and on Services after every phase.

## 5. Risks and how they are handled
| Risk | Handling |
|---|---|
| Server 2020 returns a different shape or refuses an api-version | Explicit versions with fallback; Diagnostics shows the exact call that failed; test on Server 2020 in Phase 0 |
| Large grid JSON makes the first load slow | Batching, progress, incremental cache, worker if needed; budget agreed in Phase 1 |
| Long-text fields cut in batch responses | Check in Phase 0 with a large Epic; fall back to per-item read for oversized rows |
| Grid format changes later | Version check + contract test (above) |
| People not matching between the grid and team capacity | Same key function as the current extension; "unmatched people" list in Diagnostics |
| Anyone with access sees everyone's workload | Documented; optional guard to limit the page to chosen teams (a display rule, not access control) |
| Rows not scheduled by dates | Counted and reported; optional fallback calculation |

## 6. Decisions needed from you before Phase 0
1. Extension name and the Boards menu label (default: **Resource Planner**).
2. **Reference names** of the Epic start-date and target-date custom fields, and of the grid data field.
3. The grid's **column ids** (resource, start, end, allocation, review status) – or point me to one sample Epic and I will use the detect helper.
4. Which approval status values should be **excluded** from hours (default: Rejected).
5. Default period (current year), and which teams' capacity to read.
6. Who may open the planner: all project members (default), or limited by a team guard.
7. Acceptable first-load time for ~800 Epics (suggested: under 10 seconds the first time, under 2 seconds afterwards).

## 7. What is not included (first release)
Editing from the planner, cross-project views, dependency lines on the Gantt, forecasting/what-if planning, email alerts. They can follow once the base is stable.
