# Work Item Grid & Rules (Azure DevOps extension)

Publisher `amanullah-ado` · id `workitem-grid-rules`. See [overview.md](overview.md) for features and user setup.

## Layout
- `src/core` – pure logic (formula engine, CSV, grid model, rules engine). Unit tested.
- `src/grid` – **Smart Grid** work item form control (React).
- `src/dropdown` – **Smart Dropdown** form control (filters options by parent field).
- `src/observer` – invisible **rules observer** (set value / require / restrict / block save, dependent validation, Area Path hints).
- `src/hub` – project settings hub: visual rule builder, dependent dropdown + grid designers, JSON editor, live validation (`validate.ts`).
- `src/shared` – SDK/REST helpers, config storage (extension data service, one document per project), Excel/CSV.

## Commands
```
npm install
npm test            # unit + DOM tests
npm run typecheck
npm run package     # production build + tfx -> out/*.vsix
npm run package:dev # private dev copy (vss-extension.dev.json overrides id/name)
```
Publish: upload the `.vsix` at https://marketplace.visualstudio.com/manage/publishers/amanullah-ado (create the publisher first if needed), or `npx tfx extension publish --token <PAT> --share-with <org>`. For Azure DevOps Server, upload the `.vsix` under Collection settings → Extensions → Manage extensions.
