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

### Conditional rules (observer)
*When* conditions on any fields → *then / otherwise*: set a field value, require a field, restrict allowed values, or block save with a message. Scope per work item type.

### Dependent dropdowns for fields
Parent → child picklist mapping with Area Path hints, validation on save, and the **Smart Dropdown** control that hides invalid options. Can import the JSON of the "Dependent Lists" extension.

### Visual rule builder (Project settings → Grid & Rules)
Form editors first, JSON editor second. Everything is checked live against your organization's real fields and picklist values (unknown fields, values that are not in the picklist, non-numeric total targets, bad formulas, …).

## Setup
1. Install the extension. Open **Project settings → Grid & Rules** and define a grid, rules or dependent dropdowns, then **Save**.
2. **Grid:** create a *Text (multiple lines)* field (e.g. `Custom.GridData`). In the process layout editor add a custom control → **Smart Grid**, set **Grid name** and **Data field**.
3. **Dependent dropdown:** (optional) on the dependent field add the **Smart Dropdown** control to filter options. Validation works without it.
4. Rules and dependent-value validation run automatically on every form for the configured work item types.

## Good to know
- Hiding fields or making them read-only is not possible for extensions; rules can set values, require fields, restrict values and block save.
- Configuration is stored per project in the extension data service. Only project administrators can open the settings hub.
- Rows are stored as JSON in the chosen text field (also readable by the older "Data Table" extension's array format).
