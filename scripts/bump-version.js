// Bumps the patch version in vss-extension.json and package.json (Marketplace rejects re-uploads of the same version).
const fs = require('fs');
const files = ['vss-extension.json', 'package.json'];
const manifest = JSON.parse(fs.readFileSync(files[0], 'utf8'));
const [maj, min, pat] = manifest.version.split('.').map(Number);
const next = `${maj}.${min}.${pat + 1}`;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, text.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`));
}
console.log(`Version bumped: ${manifest.version} -> ${next}`);
