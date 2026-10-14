// Add the NFR Risk Assessment grid, its question-weight Mapping and its three calculations to a project configuration.
//   node scripts/merge-nfr-assessment.js current.json [merged.json] [--rating-field Custom.X] [--score-field Custom.Y] [--action-field Custom.Z]
// current.json = the configuration copied from the hub's JSON tab (or the "config" of a backup). The input is never changed; the result goes to merged.json (default: current.merged.json).
// Only these are added or replaced: grids["NFR Risk Assessment"], the "NFR question weights" mapping and the calculations with ids nfr-score-pct, nfr-rating, nfr-action. All other grids, rules, calculations and mappings stay exactly as they are.
const fs = require('fs');
const { build, merge } = require('./nfr-template');

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const fields = { rating: flag('--rating-field'), scorePercent: flag('--score-field'), action: flag('--action-field') };
for (const k of Object.keys(fields)) if (!fields[k]) delete fields[k];
const [input, output] = args;
if (!input) { console.error('Usage: node scripts/merge-nfr-assessment.js current.json [merged.json] [--rating-field Custom.X] [--score-field Custom.Y] [--action-field Custom.Z]'); process.exit(1); }

const config = JSON.parse(fs.readFileSync(input, 'utf8'));
const built = build({ fields });
const merged = merge(config, built);
const out = output || input.replace(/\.json$/i, '') + '.merged.json';
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
const had = !!(config.grids && config.grids[built.gridName]);
console.log(`${had ? 'Replaced the columns of' : 'Added'} grid "${built.gridName}" (${built.questions.length} questions, existing data field and settings kept).`);
console.log(`Mapping "${Object.keys(built.lookups)[0]}" added. Calculations: ${built.calculations.map(c => c.name + ' -> ' + c.resultField).join('; ')}.`);
console.log(`Written to ${out}. Other grids, rules, calculations and mappings are unchanged.`);
