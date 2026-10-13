# Work Item Grid & Rules

Turn Azure DevOps work items into small, smart applications: **editable grids with calculations**, **rules and dependent dropdowns**, **capacity and utilization tracking**, and a **visual admin page** to configure all of it – without writing code.

Everything is configured once per project and works on any work item type you choose. Your data stays inside your Azure DevOps organization.

---

## What's included

| Component | What it does |
|---|---|
| **Smart Grid** (form control) | An editable table inside a work item, stored in a long-text field |
| **Derived grids** | A second grid that builds itself from the rows of the first (grouping, summing, looking things up) |
| **Scheduling by dates** | Enter a start date, effort and allocation %; the end date and hours per month are calculated from each person's calendar |
| **Review** | Approve / reject / pending review per row, by chosen teams or people, with locking and totals by status |
| **Presets** | Ready-made rows a user adds with one click, offered per work item type of project or customer |
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
- **Auto-fill columns:** a column fills itself from another column through a lookup table, so users pick one value and the related values appear. Add **overrides** so a ticked checkbox column forces a fixed value instead of the lookup result.
- **Formulas:** row formulas (`quantity * price`) and whole-column functions (`TOTAL(amount)`), with decimals, and a choice of blank or zero when an input is empty or a division by zero occurs.
- **Totals and grouped totals** under the grid, with each figure optionally **written to its own work item field**.
- **Status columns and colour coding:** turn a number into a labelled status by ranges (for example up to a limit → one label, above → another), with a colour per range. Cells can follow the colour and **whole rows can be tinted** by status.
- **Child work items:** create child work items from rows (one or all) with field mapping and an automatic parent link.
- **Presets (ready-made rows):** a **Load preset** list adds a set of rows in one click – **Add** (skips rows already there) or **Replace**. Each preset keeps only the columns you choose (for example activity and effort), so people and dates stay blank for the user. A preset can carry a **rule** (for example *Project type = …* on any work item field) so only matching presets are offered. **Save as preset** on the work item is optional and limited to project administrators and/or chosen teams.
- **Everyday tools:** sort, filter, move, duplicate (clear copy icon) and delete rows, export to **CSV or Excel**; an **Import** button is available as an option per grid.
- **Neat layout:** numbers, headings and totals are right-aligned; light and dark themes are supported.

### Derived grids
A grid can be **built automatically from another grid** and shown right below it:
- Mark **key** columns (one row per distinct combination, e.g. person + month), **carry** a value from the source, or **aggregate** a source column (sum, average, minimum, maximum, count). Dates can be grouped by day, month, quarter or year.
- Add columns that users fill in, **calculated** columns, **status** columns and lookups.
- What users type in the manual columns is remembered per key as the source rows change.

### Scheduling effort by dates
Instead of one row per month, a grid can use **Start date + Effort (hours) + Allocation %**:
- The **end date is calculated** and read-only. Allocation is optional and defaults to 100 %.
- The effort fills the person's **working days one after the other**, up to *hours per day × allocation %* a day. Days off, holidays and leave are skipped. Example: 80 h at 100 % with 8 hours a day is 10 working days; 16 h at 50 % is 4 working days.
- The hours are split **per month** (a task that runs across two months puts its share in each), and the monthly figures always add up to the entered effort. These monthly figures feed the derived capacity grid and the cross-Epic hours.
- **Calendar source:** Azure DevOps team capacity (team working days, team days off, each person's days off and capacity per day) or the extension's own calendar table (working week, holidays, hours per day, leave). If a date is not covered by the calendar, the row shows a clear message and adds no hours – nothing is guessed.
- A row without a start date, effort or resource is flagged as incomplete and adds nothing to the capacity grid until it is complete.
- In the derived grid the **hours of a month can be adjusted by hand** (the cell is highlighted; clear it to return to the calculated value), the **team comes from the capacity source**, and **hovering a figure shows which rows add up to it**.

### Calculations
Define a calculation once and it keeps a field up to date:
1. **Inputs** – give each value a short name. An input is either **any work item field** or a **figure from a grid** (sum, average, minimum, maximum, count – with several filter conditions), or the **top group** of a grid (the group with the highest or lowest total, as a name or a number).
2. **Formula** – for example `PartA / Total * 100`. Functions: `IF`, `ROUND`, `MIN`, `MAX`, `SUM`, `ABS`, `FLOOR`, `CEIL`, `AND`, `OR`, `NOT`, `CONCAT`, comparisons.
3. **Result** – the field that receives the answer, decimal places, what to do with empty inputs and division by zero, and whether to **always recalculate** or **only fill while empty**.

Built-in help: a **Test** panel with sample values and **Try on a real work item**, which reads a saved work item and shows exactly what each input contains and why a result is blank.

### Review (approve / reject)
Every row can carry a review status – **Pending review**, **Approved** or **Rejected** – that chosen people change with **Approve** / **Reject** buttons on the row or **Approve all / Reject all** for the rows shown:
- **Who may decide** is set by approver rules: members of Azure DevOps **teams** and/or **named people** (when a team cannot be read). A rule can be limited to rows where a column has certain values (for example one team approves one kind of row and another team the rest). A row that matches no rule can only be decided by administrators. Optionally nobody can decide **their own** row.
- **Administrators** are project administrators plus an optional list of **grid administrators** (teams or people). They may decide every row and edit or remove approved rows.
- **Lock approved rows** (optional): an approved row cannot be edited, moved or deleted except by administrators. **Reset on edit** (optional): changing an approved or rejected row sends it back to pending review.
- Each decision records **who** and **when** (in a time zone you choose, with its offset, for example `2026-10-12 17:03 UTC+03:00`), and the approver can type a **comment / reject reason** in the comment column.
- **Overall status of the grid (optional):** write one text value to a work item field, for example *Approved* when every row is approved, *Partially approved* when some are, *Pending review* when none has been reviewed and *Has rejected rows* when a row is rejected. The wording and whether a rejected row decides the status are configurable.
- **Totals by status:** add the approved, pending and rejected figure of a number column to separate work item fields.
- Rows that are duplicated, imported or loaded from a preset always start as pending review.
- **Normal mode** is enforced by the extension's pages only: someone with edit rights on the work item could still change the stored status by other means (for example Excel or the API).
- **Secure approvals (optional):** the decisions are kept in a separate long-text field that a process rule makes read-only for everyone except the approver group, so Azure DevOps itself blocks other people from approving. Each approval also stores a fingerprint of the row's typed values: a row counts as approved only while its values match what was approved, so a change from anywhere makes it pending, and approved totals and calculations use only decisions that still match. A stale approval is removed the next time an approver decides a row; until then, restoring the exact approved values brings the approval back. The name and time of a decision are recorded by the approver's own session, and copying a work item copies its approvals. A process rule works per group, so rules such as "one team per kind of row" and "nobody approves their own row" are checked by the extension only. The approved totals written to work item fields are recalculated by the extension for whoever edits the grid, so do not make those fields read-only with a rule.

### Rules and dependent dropdowns
- **Rules:** *when* all/any conditions are true, *then / otherwise* set a field value, require a field, allow only certain values, or block saving with a message. Scope each rule to chosen work item types.
- **Dependent dropdowns:** map parent values to allowed child values. Invalid combinations block saving; add the **Smart Dropdown** control to also hide invalid options. Optionally pre-fill the parent from the Area Path.

### Mappings
Maintain a "value → category" table once (categories, the values in each, and a fallback category for everything else) and use it in any grid column. Adding a value later is a one-place change.

### Capacity and utilization
- **Where capacity lives – your choice:**
  - the extension's own **register**: default hours per person and month plus exceptions (leave, part time), with import/export and a change history; edit access can be limited to chosen Azure DevOps **teams**. A **calendar table** holds the working week, default hours per day and holidays; each person can have their own hours per day, team and leave dates; or
  - **Azure DevOps team capacity** (Boards → Sprints → Capacity): hours per day and days off are read from one yearly iteration and converted to available hours per month (working days − holidays − days off).
- **Per work item:** a derived grid shows each person's hours for the item, hours on other work items, total hours, available capacity, **utilization %** and a **status**.
- **Across work items:** each work item publishes its hours when saved, so utilization counts a person's total load.
- **Utilization overview:** capacity against allocated hours per person and month, over-capacity highlighted.

### Read-only calculated fields
The **Read-only fields** page lists every field the extension writes (calculation results, grid totals, grouped totals) and explains how to lock them – with the **Read-only Value** control and, after testing that the field still fills, an Azure DevOps process rule.

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

To schedule by dates, open the grid and tick **Users enter a start date, effort and allocation %** under *Dates and effort*; **Add any missing standard columns** creates the columns and links them. For ready-made rows, add a preset under *Presets* (choose its columns, rows and an optional rule).

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

For scheduling by dates: with the register, set the **Calendar** (working week, hours per day, holidays) on the same page and, if needed, a person's hours per day and leave (select the person with ⓘ). With Azure DevOps team capacity the team's working days, days off and hours per day are used.

Then generate a derived capacity grid in the Grids page with the **Quick start** and save. For a grid scheduled by dates, use **Fill in for a scheduled source**.

### 6. Lock calculated fields (optional)
Open **Read-only fields**, copy the field names, and add the **Read-only Value** control for each (a **Make read-only** process rule is optional; test that the field still fills).

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

**Scheduling columns:** *Resource* (people picker), *Start date* (date), *Effort* (number), *Allocation %* (number, optional), *End date* (date, calculated). A derived grid reads the source columns **Scheduled month** and **Scheduled hours**.

**Auto-fill overrides:** on a column that fills itself from another, a ticked checkbox column can force a fixed value instead of the lookup result (first ticked rule wins).

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
| The end date stays empty, with a red cell | Hover the cell: usually the person has no capacity in the calendar source, or the date is outside the yearly iteration. Fix the capacity (or the iteration) and reopen the work item. |
| Teams do not load on an on-premises server | Make sure the extension is the latest version; team and member lists are requested with an older REST version that Azure DevOps Server 2020 accepts. |
| Approve is refused with “Azure DevOps did not allow changing the approvals field” | Secure approvals: only members of the group named in the field's process rule can write that field. Add the person to the group, or check the rule. |
| A row is pending again although it was approved | Secure approvals: the row was changed after approval (also from outside the grid), so the approval no longer matches. Approve it again. |
| Nobody sees Approve / Reject | The user must match an approver rule (team member or named person) or be an administrator; team membership counts direct members only – add people by name if a team cannot be read. |
| "Load preset" is empty | A preset with a rule is only offered when the work item field matches; a preset without a rule is offered everywhere. |

## Support
Questions and feedback are welcome through the Marketplace Q&A page of this extension.


## Team from Azure DevOps team / group membership

In **Grid & Rules → Grids**, open a text column and tick **Fill with the person's team or group**. Choose the person column and the Azure DevOps teams/groups to report (e.g. *Transformation Unit*, *NFR*). When a resource is picked, the column fills with the chosen teams the person belongs to (several are joined with ", "). The column is read-only. Only direct members are recognised, and members are cached for five minutes.

**Manual override:** tick *Allow users to type a different team*. A typed value is kept until the resource changes or the cell is cleared (then it is filled again).

**Default allocation %:** in the grid's *Dates and effort* section, *Default allocation %* sets the value of new rows and of empty cells (default 100). Use 0 to make users enter it; 0 % gives no end date until filled.

## Audit log, administrator-only settings and read-only outputs

- **Audit log** (Grid & Rules → *Audit log*): every saved change to the settings (grids, rules, calculations, mappings, capacity settings) is recorded with the user, the time, each setting's previous and new value, and a reason and comment. Saving always asks for both (free text, at least 10 characters each). Entries are kept 24 months (changeable); entries older than that can be exported to CSV and cleared. Row data on work items is not logged. The log is stored with the other extension data, so it is an accountability record, not tamper-proof evidence.
- **Project administrators only:** the Grid & Rules settings and the capacity register can be changed by project administrators only. Others see a message (settings) or a read-only page (capacity). If Azure DevOps cannot report the user's permissions, the page stays usable with a notice, so a real administrator is never locked out. This is a check inside the extension's pages, not an Azure DevOps security boundary.
- **Calculated fields:** keep fields the extension fills (totals, calculation results, overall status) writable in the process rules and show them with the **Read-only Value** control. When a work item with rows is opened, any such field that was changed by hand or by another tool is corrected.
- **Month format:** a column's *Show months / dates as* setting changes how a month or date appears in read-only cells and in CSV/Excel (for example `MM-YYYY`, `MMM-YY`). Stored values do not change.
