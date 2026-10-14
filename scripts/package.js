// Build and package an extension with a fresh version number, without touching any tracked file.
//   node scripts/package.js main|planner [--dev]
// The version is one patch above the higher of the manifest's version and the last one built on this machine (.build/versions.json).
// A development package (--dev) uses the -dev id and name and keeps its own counter.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { nextVersion } = require('./versions');

const TARGETS = {
  main: { manifest: 'vss-extension.json', dev: 'vss-extension.dev.json', build: 'build', buildDev: 'build:dev' },
  planner: { manifest: 'planner/vss-extension.json', dev: 'planner/vss-extension.dev.json', build: 'build:planner', buildDev: 'build:planner:dev' },
};
const name = process.argv[2];
const dev = process.argv.includes('--dev');
const t = TARGETS[name];
if (!t) { console.error('Usage: node scripts/package.js main|planner [--dev]'); process.exit(1); }

const dir = '.build';
const stateFile = path.join(dir, 'versions.json');
fs.mkdirSync(dir, { recursive: true });
let state = {};
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* first build on this machine */ }
const key = dev ? `${name}-dev` : name;
const manifest = JSON.parse(fs.readFileSync(t.manifest, 'utf8'));
const version = nextVersion(manifest.version, state[key]);

const overrides = { ...(dev ? JSON.parse(fs.readFileSync(t.dev, 'utf8')) : {}), version };
const overridesFile = path.join(dir, `overrides-${key}.json`);
fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2));

console.log(`Packaging ${key}: ${manifest.version} (manifest) -> ${version}`);
const run = cmd => execSync(cmd, { stdio: 'inherit' });
run(`npm run ${dev ? t.buildDev : t.build}`);
run(`npx --no-install tfx extension create --manifest-globs ${t.manifest} --overrides-file ${overridesFile} --output-path out`);
state[key] = version;                               // remembered only after the package was made
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log(`Done: ${overrides.id || manifest.id} ${version} -> out/`);
