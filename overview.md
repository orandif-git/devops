# Work Item Grid & Rules

Smart editable grids, conditional rules and dependent dropdowns for Azure DevOps work items — configured visually, validated against your real process fields. Works on **Azure DevOps Services** and **Azure DevOps Server 2019+**.

## What you get

### Smart Grid (work item form control)
- Column types: **text, number, checkbox, date, dropdown, identity (people picker)**
- Required, default value, min/max, per-column width
- **Dependent dropdowns inside cells** (a column's options depend on another column)
- **Auto-fill columns:** pick one value (e.g. SDLC Activity) and other columns (Phase, Default treatment) fill themselves from a lookup table
- **Grouped totals:** sum Hours per Treatment (Capitalizable / Expense / Conditional) and write **each group to its own work item field**; a live breakdown is shown under the grid
- **Row formulas** such as `ROUND([qty] * [price], 2)` and footer **totals** (sum / avg / min / max / count)
- **Map totals to work item fields** (e.g. Original Estimate)
- **Import / export** CSV and Excel (.xlsx)
- **Create child work items** from rows (single or all), with field mapping and parent link
- Sort, filter, reorder, duplicate rows; dark/light theme aware

### Calculated columns and derived grids
- **Calculated** column type: formulas over the row (`hours / capacity * 100`) and whole column (`TOTAL(hours)`), with decimals, blank-or-0 for empty inputs and division by zero.
- **Derived grids:** a second grid built automatically from the first, shown below it – e.g. **Resource Capacity**: one row per resource and month, hours summed, team carried, Available Capacity entered per row, utilization and over-capacity calculated. Manual entries are remembered by resource and month.

### Capacity register (Boards → Capacity)
Resource managers enter available hours **once**: a default per person and month, plus exceptions for specific months (leave, part time). Import/export CSV or Excel, filter, per-change audit trail. Who may edit is set by **Azure DevOps team** (Project settings → Grid & Rules → Capacity); everyone else sees it read-only. Every Epic's *Resource Capacity* grid reads its Available Capacity from here. Each Epic also publishes its per-person, per-month hours when saved, so every Epic can show **Hours (other Epics)**, **Total hours** and **Utilization % across all Epics** next to **This Epic %**, and managers get a **Utilization overview** (capacity vs. hours of all Epics, over-capacity highlighted). (Access control applies to the extension's pages; it is not an Azure DevOps security boundary.)

### Shared mappings (Mappings tab)
Maintain value → category tables once, e.g. **Resource type**: External ← Vendor, IT Contract · Business ← Business · all other values → Internal. Any grid column can use a mapping, so adding a team is a one-place change. Everything is configurable: categories, their values and the fallback.

### Calculations (standalone, in the same hub)
Define a calculation once: named inputs (any work item field, or a figure from a grid with several filter conditions), a formula such as `CapexHours / TotalHours * 100`, and the field that receives the result. Choose per calculation whether empty inputs give a blank result or count as 0, how division by zero behaves, and whether the result is always recalculated or only filled while empty. Inputs can also be a **top group** – e.g. the team, period (by month/quarter/year) or SDLC phase with the highest total hours – written to a text field. A Test panel and live validation (unknown variables, wrong field types, circular dependencies, conflicting writers) are built in.

### Conditional rules (observer)
*When* conditions on any fields → *then / otherwise*: set a field value, require a field, restrict allowed values, or block save with a message. Scope per work item type.

### Dependent dropdowns for fields
Parent → child picklist mapping with Area Path hints, validation on save, and the **Smart Dropdown** control that hides invalid options. Can import the JSON of the "Dependent Lists" extension.

### Visual rule builder (Project settings → Grid & Rules)
Form editors first, JSON editor second. Everything is checked live against your organization's real fields and picklist values (unknown fields, values that are not in the picklist, non-numeric total targets, bad formulas, …).

## Setup
1. Install the extension. Open **Project settings → Grid & Rules** and define a grid, rules or dependent dropdowns, then **Save**.
2. **Grid:** create a *Text (multiple lines)* field (e.g. `Custom.GridData`) and enter it as the grid's **Data field** in Project settings → Grid & Rules. In the process layout editor add the custom control → **Smart Grid** on that field and set **Grid name**; leave the control's own *Data field* input empty so the grid and its calculations always read the same field.
3. **Dependent dropdown:** (optional) on the dependent field add the **Smart Dropdown** control to filter options. Validation works without it.
4. Rules and dependent-value validation run automatically on every form for the configured work item types.

## Good to know
- Hiding fields or making them read-only is not possible for extensions; rules can set values, require fields, restrict values and block save.
- Configuration is stored per project in the extension data service. Only project administrators can open the settings hub.
- Rows are stored as JSON in the chosen text field (also readable by the older "Data Table" extension's array format).
