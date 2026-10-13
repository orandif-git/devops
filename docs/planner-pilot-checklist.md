# Resource Planner – pilot checklist

Run once on a **test project** on Azure DevOps Server 2020 and once on Azure DevOps Services after every install or upgrade. Note the first line that fails and copy **Diagnostics → Copy results**.

## 0. Install
- [ ] Install the `.vsix` (dev copy first), hard refresh (Ctrl+Shift+R). Boards shows **Resource Planner**.
- [ ] **Diagnostics → Connection**: every line ✔ (Server 2020: teams, WIQL and batch read all work).

## 1. Settings
- [ ] Epic start/target date fields chosen from the lists. Grid field chosen; **Detect** fills the column mapping. Capacity teams added. Save works; reload keeps it.
- [ ] A second administrator saves in between: you are told to reload instead of overwriting.

## 2. Data
- [ ] **Heatmap** loads; first load under 10 s (note the time), a reload under 2 s.
- [ ] **Data check** and **Diagnostics → Setup and data**: counts match a hand-checked Epic; people without capacity and rows without monthly hours are explained.

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
- [ ] The extension lists only read scopes. No Epic is modified by any action.
- [ ] A user without area-path access to some Epics sees only the Epics they can read.
