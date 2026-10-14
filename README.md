# Work Item Grid & Rules (Azure DevOps extension)

Publisher `amanullah-ado` · id `workitem-grid-rules`. See [overview.md](overview.md) for features and user setup.

## Layout
- `src/core` – pure logic (formula engine, CSV, grid model, derived grids, calculations, capacity, effort scheduling and calendars (`schedule.ts`), presets (`presets.ts`), status bands, rules engine). Unit tested.
- `src/grid` – **Smart Grid** work item form control (React).
- `src/dropdown` – **Smart Dropdown** form control (filters options by parent field).
- `src/observer` – invisible **rules observer** (set value / require / restrict / block save, dependent validation, Area Path hints).
- `src/hub` – project settings hub: visual rule builder, dependent dropdown, grid, mapping, calculation and capacity editors, read-only fields page, JSON editor, live validation (`validate.ts`).
- `src/capacity` – the capacity register editor and utilization overview, shown inside the hub's **Capacity** tab (only when the capacity register is the capacity source).
- `src/readonly` – **Read-only Value** form control for calculated fields.
- `src/shared` – id helpers (`ids.ts`), settings storage with version check (`configStore.ts`), audit/backup/diagnostics stores,  SDK/REST helpers (team and permission calls use an explicit older api-version so Azure DevOps Server 2020 accepts them), config storage (extension data service, one document per project), Excel/CSV.

## Commands
```
npm install
npm test            # unit + DOM tests
npm run typecheck
npm run package     # production build + tfx -> out/*.vsix
npm run package:dev # private dev copy (vss-extension.dev.json overrides id/name)
```
Publish: upload the `.vsix` at https://marketplace.visualstudio.com/manage/publishers/amanullah-ado (create the publisher first if needed), or `npx tfx extension publish --token <PAT> --share-with <org>`. For Azure DevOps Server, upload the `.vsix` under Collection settings → Extensions → Manage extensions.

## Resource Planner & Heatmap (second extension, in `planner/`)
A separate extension (id `resource-planner`) with its own manifest (`planner/vss-extension.json`), build (`planner/webpack.config.js`) and `.vsix`. It reuses logic from `src/core` by import, so each package bundles its own copy.
```
npm run build:planner        # -> planner/dist
npm run package:planner      # builds with the next version number, -> out/amanullah-ado.resource-planner-<version>.vsix
npm run package:planner:dev  # private dev copy (planner/vss-extension.dev.json)
npm run package:all          # both extensions
```
Plan: `docs/resource-planner-build-plan.md`.

## NFR Risk Assessment grid (weighted questionnaire)
`scripts/merge-nfr-assessment.js` adds a weighted yes/no questionnaire to a project configuration: 25 questions in six categories with weights, a rating (Low / Moderate / Moderate High / High, with colour) on every row of each category, and an overall score, rating and IFRM action written to Epic fields.
1. Hub › JSON tab: copy the whole box into `current.json`. (Also download a backup first.)
2. `node scripts/merge-nfr-assessment.js current.json merged.json --rating-field Custom.YourRating --score-field Custom.YourScore --action-field Custom.YourAction`
3. Open `merged.json`, copy it into the JSON tab, press **Apply**, check the Grids and Calculations tabs, then **Save**.
Only the grid named `NFR Risk Assessment` (its columns; its data field and other settings are kept), the `NFR question weights` mapping and the calculations `nfr-score-pct`, `nfr-rating` and `nfr-action` are added or replaced. Questions, weights, scoring answers, limits and field names are at the top of `scripts/nfr-template.js`.
The group functions `GROUPTOTAL`, `GROUPAVG`, `GROUPMAX`, `GROUPMIN` and `GROUPCOUNT` (`GROUPTOTAL([score], [category])`) are available in every calculated column.

## Examples
- `examples/sdlc-timesheet.json` – timesheet with a month per row.
- `examples/sdlc-timesheet-scheduled.json` – the same project scheduled by start date + effort + allocation %, with a preset and a contractor override.

## Release
1. `npm test` and `npm run typecheck`.
2. `npm run package`, upload the `.vsix`. Every package gets a higher patch number than the last one built on this machine; the number is kept in `.build/versions.json` (ignored by git), so building never changes a tracked file. To start a new minor or major version, edit `version` in the manifest and commit it: the next package continues one patch above it. On a new machine the counter starts at the manifest version, so commit the manifest version after a release if you build somewhere else.
3. Run `docs/pilot-test-checklist.md` on a test project (Server 2020 and Services).
4. Update `CHANGELOG.md` and the Marketplace page (`overview.md`).
