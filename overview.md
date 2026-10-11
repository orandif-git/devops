# Work Item Grid & Rules

Turn Azure DevOps work items into small, smart applications: **editable grids with calculations**, **rules and dependent dropdowns**, **capacity and utilization tracking**, and a **visual admin page** to configure all of it – without writing code.

Everything is configured once per project and works on any work item type you choose. Your data stays inside your Azure DevOps organization.

---

## What's included

| Component | What it does |
|---|---|
| **Smart Grid** (form control) | An editable table inside a work item, stored in a long-text field |
| **Derived grids** | A second grid that builds itself from the rows of the first (grouping, summing, looking things up) |
| **Calculations** | Formulas that write results into work item fields automatically |
| **Rules** | Set values, require fields, restrict values or block save when conditions are met |
| **Dependent dropdowns** | Pick lists whose options depend on another field (Smart Dropdown control) |
| **Mappings** | Shared lookup tables ("value → category") reused by any grid column |
| **Capacity** | A central place for people's available hours, plus a utilization overview across work items |
| **Read-only Value** (form control) | Shows a calculated field with a lock so users cannot edit it |
| **Grid & Rules admin page** | Visual builder with live validation against your real process fields |

---

## Features

### Smart Grid
- **Column types:** text, number, checkbox, date, dropdown, **people picker** (searches users and groups in your directory), **calculated**, and **status** columns.
- **Validation:** required cells, default values, minimum / maximum for numbers. Untouched new rows stay calm; optionally block saving while required values are missing.
- **Dropdowns inside cells**, including **dependent dropdowns** (a cell's options depend on another cell in the same row; a single valid option is picked automatically).
- **Auto-fill columns:** a column fills itself from another column through a lookup table, so users pick one value and the related values appear.
- **Formulas:** row formulas (`quantity * price`) and whole-column functions (`TOTAL(amount)`), with decimals, and a choice of blank or zero when an input is empty or a division by zero occurs.
- **Totals and grouped totals** under the grid, with each figure optionally **written to its own work item field**.
- **Status columns and colour coding:** turn a number into a labelled status by ranges (for example up to a limit → one label, above → another), with a colour per range. Cells can follow the colour and **whole rows can be tinted** by status.
- **Child work items:** create child work items from rows (one or all) with field mapping and an automatic parent link.
- **Everyday tools:** sort, filter, move, duplicate and delete rows, export to **CSV or Excel**; an **Import** button is available as an option per grid.
- **Neat layout:** numbers, headings and totals are right-aligned; light and dark themes are supported.

### Derived grids
A grid can be **built automatically from another grid** and shown right below it:
- Mark **key** columns (one row per distinct combination, e.g. person + month), **carry** a value from the source, or **aggregate** a source column (sum, average, minimum, maximum, count). Dates can be grouped by day, month, quarter or year.
- Add columns that users fill in, **calculated** columns, **status** columns and lookups.
- What users type in the manual columns is remembered per key as the source rows change.

### Calculations
Define a calculation once and it keeps a field up to date:
1. **Inputs** – give each value a short name. An input is either **any work item field** or a **figure from a grid** (sum, average, minimum, maximum, count – with several filter conditions), or the **top group** of a grid (the group with the highest or lowest total, as a name or a number).
2. **Formula** – for example `PartA / Total * 100`. Functions: `IF`, `ROUND`, `MIN`, `MAX`, `SUM`, `ABS`, `FLOOR`, `CEIL`, `AND`, `OR`, `NOT`, `CONCAT`, comparisons.
3. **Result** – the field that receives the answer, decimal places, what to do with empty inputs and division by zero, and whether to **always recalculate** or **only fill while empty**.

Built-in help: a **Test** panel with sample values and **Try on a real work item**, which reads a saved work item and shows exactly what each input contains and why a result is blank.

### Rules and dependent dropdowns
- **Rules:** *when* all/any conditions are true, *then / otherwise* set a field value, require a field, allow only certain values, or block saving with a message. Scope each rule to chosen work item types.
- **Dependent dropdowns:** map parent values to allowed child values. Invalid combinations block saving; add the **Smart Dropdown** control to also hide invalid options. Optionally pre-fill the parent from the Area Path.

### Mappings
Maintain a "value → category" table once (categories, the values in each, and a fallback category for everything else) and use it in any grid column. Adding a value later is a one-place change.

### Capacity and utilization
- **Where capacity lives – your choice:**
  - the extension's own **register**: default hours per person and month plus exceptions (leave, part time), with import/export and a change history; edit access can be limited to chosen Azure DevOps **teams**; or
  - **Azure DevOps team capacity** (Boards → Sprints → Capacity): hours per day and days off are read from one yearly iteration and converted to available hours per month (working days − holidays − days off).
- **Per work item:** a derived grid shows each person's hours for the item, hours on other work items, total hours, available capacity, **utilization %** and a **status**.
- **Across work items:** each work item publishes its hours when saved, so utilization counts a person's total load.
- **Utilization overview:** capacity against allocated hours per person and month, over-capacity highlighted.

### Read-only calculated fields
The **Read-only fields** page lists every field the extension writes (calculation results, grid totals, grouped totals) and explains how to lock them – with the **Read-only Value** control and/or an Azure DevOps process rule.

### Visual admin page with live validation
Project settings → **Grid & Rules**. Form editors first, JSON editor second. Everything is checked live against your process: unknown fields, values that are not in a pick list, non-numeric targets, formulas with unknown names, circular calculations, two things writing to the same field, and more.

---

## Requirements and permissions
- Azure DevOps Services (designed also for Azure DevOps Server 2019 and later).
- Permissions requested: **work items (read and write)** and **project and team (read)**.
- Project administrators configure the extension. Configuration, the capacity register and published hours are stored in your organization's extension data storage. Nothing is sent outside Azure DevOps.

---

## Setup

### 1. Install
Install the extension into your organization from the Marketplace and open any project.

### 2. Create the fields you need
In **Organization settings → Process → your process → work item type → New field**:
- A **Text (multiple lines)** field for each grid's data (plain text, not rich text). You can hide it from the layout.
- **Decimal / Integer** fields for anything the extension should write (calculation results, grid totals).
- A **Text** field for text results.

### 3. Define your grid, rules and calculations
Open **Project settings → Grid & Rules**:
1. **Grids → + New grid:** name it, enter its **Data field**, add columns (type, required, default, options, formulas, status ranges), and optionally totals, grouped totals and child work items.
2. **Mappings** (optional): create lookup tables and select them in a column's *Auto-fill* setting.
3. **Calculations → + New calculation:** add inputs, write the formula, choose the result field and settings, test it, then use **Try on a real work item**.
4. **Rules** and **Dependent dropdowns** (optional): build them with the form editors.
5. Check the **validation list** at the bottom of the page, then press **Save**.

### 4. Add the controls to the work item layout
In the process **Layout** editor of the work item type:
- **Smart Grid:** add the custom control on the grid's data field and enter the **Grid name**. Leave the control's own *Data field* input empty so the grid and its calculations always read the same field.
- **Derived grids:** nothing to add – they appear below their source grid. Create and hide only their data field.
- **Smart Dropdown:** add it on a dependent field to hide invalid options.
- **Read-only Value:** add it on calculated fields to show them locked.

### 5. Set up capacity (optional)
Open **Grid & Rules → Capacity** and choose where capacity is maintained:
- **Register:** add people on the **Boards → Capacity** page (default hours plus month exceptions), and choose which teams may edit.
- **Azure DevOps team capacity:** create one iteration for the year, add it to the team, enter hours per day and days off per person under Boards → Sprints → Capacity, select the team(s), and press **Check what is read**.

Then generate a derived capacity grid in the Grids page with the **Quick start** and save.

### 6. Lock calculated fields (optional)
Open **Read-only fields**, copy the field names, and add the **Read-only Value** control and/or a **Make read-only** process rule for each.

---

## Configuration reference

**Column types**

| Type | Notes |
|---|---|
| Text, Number, Checkbox, Date | Required, default, min/max (numbers), width |
| Dropdown | Fixed options or options that depend on another column |
| People picker | Searches users, optionally groups |
| Calculated | Formula over the row or the whole column; decimals; blank or zero behaviour |
| Status | Label and colour chosen from ranges of a number column |
| Any column | Can **auto-fill** from another column through a lookup, or follow a status colour |

**Formula functions:** `IF(cond, a, b)`, `ROUND(x, n)`, `MIN`, `MAX`, `SUM`, `ABS`, `FLOOR`, `CEIL`, `AND`, `OR`, `NOT`, `CONCAT`, and for whole columns `TOTAL`, `COLAVG`, `COLMAX`, `COLMIN`, `COLCOUNT`.

**Status ranges:** ranges are checked from the top; the first whose "up to" value is not exceeded wins. Leave "up to" **empty on the last range** so every larger value still gets a status.

---

## Good to know
- **When things run:** calculations and rules run in the browser when a work item is open and whenever an input changes. A closed work item is not recalculated until it is opened again.
- **Access control:** limits on who may edit capacity apply to the extension's pages. For enforcement inside Azure DevOps itself, use process rules and permissions.
- **Storage format:** use plain "Text (multiple lines)" fields for grid data. Rich-text fields can alter stored text.
- **Hidden data fields:** hiding a data field from the layout is fine; it still stores the data.
- **Hours across work items** are published when a work item is saved, so very recent edits may not be counted yet.

## Troubleshooting
| Symptom | What to check |
|---|---|
| A calculation result stays empty | Use **Try on a real work item**: it shows the rows read, each input and the reason. Typical causes: the grid has no data field saved, the result field is not on that work item type, or an input is empty. |
| "Field does not exist" in the validation list | Create the field in the process, then reload the admin page. |
| Lists in the admin page say they could not load | Use the **Retry** button; check that the extension has been authorised for work items and projects. |
| Grid rows disappear after saving | Make sure the data field is a plain **Text (multiple lines)** field on that work item type. |
| A status or colour is missing for large values | The last status range must have an empty "up to". |

## Support
Questions and feedback are welcome through the Marketplace Q&A page of this extension.
