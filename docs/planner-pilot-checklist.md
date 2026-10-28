# Resource Planner – pilot checklist

Run once on a **test project** on Azure DevOps Server 2020 and once on Azure DevOps Services after every install or upgrade. Note the first line that fails and copy **Diagnostics → Copy results**.

## 0. Install
- [ ] Install the `.vsix` (dev copy first), hard refresh (Ctrl+Shift+R). Boards shows **Resource Planner**.
- [ ] **Data & diagnostics → Connection**: every line ✔ (Server 2020: teams, WIQL and batch read all work).

## 1. Settings
- [ ] Epic start/target date fields chosen from the lists. Grid field chosen; **Detect** fills the column mapping. Capacity teams added. Save works; reload keeps it.
- [ ] A second administrator saves in between: you are told to reload instead of overwriting.

## 2. Data
- [ ] **Heatmap** loads; first load under 10 s (note the time), a reload under 2 s.
- [ ] **Data & diagnostics → Setup and data**: counts match a hand-checked Epic; people without capacity and rows without monthly hours are explained.

## 2b. Planner tab (one screen)
- [ ] Planner opens by default. Period, Team, Epics, search and the Filters drawer change the figures; active filters show as chips that can be removed; Clear all works.
- [ ] Band buttons highlight and clear; team headers collapse and expand; clicking a month header changes the month of the tiles.
- [ ] Clicking a cell or a person opens the detail panel (capacity vs booked, year trend, Epics); Esc closes it; an Epic opens its dialog.
- [ ] Heatmap / Timeline / Epic Gantt switch keeps the filters. Refresh and CSV work.

## 2c. Executive Dashboard
- [ ] Settings › Executive dashboard: the box **Enable the Executive Dashboard** is off by default; with it off there is no “Executive” tab. Tick it, Save: the tab appears (there is no separate Boards menu item) and the settings below the box become visible.
- [ ] Settings › Executive dashboard: choose category fields, the go-live date field, one or more progress sources (percent field, completed ÷ total, or ticked rows of a grid with its done column), states and limits. No red "to fix" lines remain.
- [ ] Boards › **Executive Dashboard** (its own board; with the box unticked it shows "not enabled") opens and lists every Epic (Epics in the left-out states are not shown). Tiles add up to the portfolio count.
- [ ] Three Epics hand-checked: status, forecast finish, go-live date and progress match the Epic's fields (and the ticked rows of its grid when that source is used).
- [ ] Ask: “How many <category value> projects are at risk?”, “<value> RAG”, “What is late?” update the chips, tiles and list; every number matches the list.
- [ ] Clicking an Epic opens the detail panel with the reasons; “Open the Epic details” opens the Epic dialog.
- [ ] Epics without a go-live date or progress value show as Not assessed with the reason, not as green.
- [ ] Settings › Executive dashboard › Questions: add a query (for example Category = a value AND Status = At risk). Its name appears as a chip under Ask; clicking it filters the list and the sentence matches the rows. Typing its name does the same.
- [ ] A Teams query (Utilization % >= 85, month current) and a People query (Utilization % > 100) list the same people/teams and percentages as the heatmap for that month.
- [ ] Settings › Calculated fields: add a formula (for example Free hours per person = [Free hours] / [People] for Teams). A wrong field name or syntax error is reported next to the formula; a valid one says so. The field appears in the query field list and under “Add a column”.
- [ ] A query with chosen columns shows exactly those columns (calculated ones included); clicking a column heading sorts it, blanks stay last. An Epics query with columns shows the table and also filters the list.
- [ ] A formula that divides by zero or uses an empty field shows a dash, not 0.
- [ ] A query using grid fields (Hours booked in the month, Tasks ticked done %) returns the Epics you expect; Or/And rows behave as written (And binds tighter than Or).

## 3. Heatmap
- [ ] Three people hand-checked: booked hours and available hours equal the grid and team capacity. Band colours, symbols (✓ ▲ !) and thresholds follow Settings.
- [ ] Click a cell: side panel lists Epics and hours; click an Epic: dialog with related items; **Open the Epic form** opens the form.
- [ ] Filters (team, state, extra fields, saved query, search) change the numbers; CSV export matches the table view.

## 4. Timeline and Gantt
- [ ] Timeline: tasks sit on the right dates; over-capacity flag matches the heatmap.
- [ ] Gantt: bars match the Epics' start/target fields; late Epics flagged; grouping by area, state and team works; scrolling 175 people / 800 Epics is smooth.

## 5. Dashboard widgets
- [ ] Add all three widgets to a dashboard; configure month, team, saved query (preview updates, Save keeps it).
- [ ] Widget numbers equal the heatmap for the same month and team. Three widgets together appear in a few seconds.

## 6. Accessibility and theme
- [ ] Tabs work with arrow keys; heatmap cells reachable with Tab and open with Enter; no meaning by colour alone.
- [ ] Dark theme: text and cells readable.

## 7. Read-only and access
- [ ] As a **non-administrator**: Resource Planner has no Settings tab; the Planner, Executive Dashboard and widgets still open (when Access teams is empty).
- [ ] Choose an Access team in Settings, Save: a project member who is not in that team and not an administrator sees “You do not have access…” on the Planner, the Executive Dashboard and the widgets; a team member and an administrator still get in.
- [ ] The extension lists only read scopes. No Epic is modified by any action.
- [ ] A user without area-path access to some Epics sees only the Epics they can read.

## Resource plan layout (Planner tab, Heatmap view)
- [ ] ▸ on a person shows their Epics with hours per month; the Epic link opens the Epic dialog.
- [ ] Total column and team header totals are right; switching Hours / % of capacity / FTE re-computes them (FTE = hours ÷ available hours).
- [ ] Expand all / Collapse all work; name and Total columns stay in view when scrolling sideways.
- [ ] Group by Epic › Team › Person lists all Epics first (closed); opening an Epic shows its teams, then the people and their hours on that Epic.
- [ ] Settings › Planner opens in / Group the plan by / Show figures as change what the Planner starts with.
- [ ] Epic Gantt: an Epic in a state grouped under In Progress (e.g. Delivery Committed) is blue, Completed is green, Cancelled grey, and one past its target date (not completed) is red. The Gantt field set in Settings shows at the end of each bar.
- [ ] A non-administrator sees only the Planner tab; Settings and Data & diagnostics are hidden.
- [ ] The Filters button opens its drawer fully, also at the right edge of the page.

## Views, full screen and sharing
- [ ] Views › Save: name a view (e.g. Late Epics by area), change something, open it again from Views: everything comes back (view, grouping, filters, key selections, collapse level, statistics).
- [ ] Mark a view with the star: reload the page, it opens by default. Another user does **not** see your views.
- [ ] Full screen on the Heatmap and on the Epic Gantt hides the Azure DevOps menus and the page header; Esc or the button returns.
- [ ] Views › Copy link: open the link in a new tab (and as another user with access): the same view opens full screen. If the copy is refused by the browser, the link is shown in a box to copy by hand.
- [ ] Epic Gantt: Settings › Epic Gantt statistics picks the default tiles; Statistics (in the toolbar) changes them for your own view.
- [ ] Settings › Epic Gantt grouping: add Delivery Status; the Epic Gantt Group by list now has it; groups sort in order (1., 2., … 10.) with “(none)” last. Remove the field in Settings: a view that used it falls back to Area.
- [ ] Settings › Date format / Month format: choose DD/MM/YYYY and MM/YYYY, save, reload: Gantt bars, tooltips, the Epic dialog and the cell tooltips use them; the Executive dates too. The custom period offers a month picker.

## Executive Dashboard (three layouts)
- [ ] Boards › Executive Dashboard opens styled in the Report layout (or the layout chosen in Settings › Executive dashboard); the switch at the top changes to Portfolio map and Roadmap and keeps the filters.
- [ ] Click a slice, a bar, a column, a status card, a map block, a scorecard: the other charts and the table follow, with a chip; Clear all resets.
- [ ] The search box finds an Epic by id, title, state, a category value, a reason word, a person booked on it and a go-live date (in your date format).
- [ ] Click an Epic (row, block or bar): the detail panel opens (Esc closes); “Open the Epic details” shows the Epic dialog.
- [ ] A named filter of the settings appears in “Saved filter”; a calculated field appears as a table column.
- [ ] Views: save, set as default, copy link; Full screen button. With about 485 Epics the three layouts stay quick (note the load time).
