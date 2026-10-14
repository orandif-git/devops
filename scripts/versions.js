// Version numbers for packages. The Marketplace rejects a version it has already seen, so every package gets a higher patch number than the last one.
// The last number used lives in .build/versions.json (ignored by git), so building never changes a tracked file.
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const valid = v => /^\d+\.\d+\.\d+$/.test(String(v));

/** The next version: one patch above the higher of the manifest's version and the last one built here. */
function nextVersion(manifestVersion, lastBuilt) {
  if (!valid(manifestVersion)) throw new Error(`The manifest version '${manifestVersion}' is not major.minor.patch`);
  const base = lastBuilt && valid(lastBuilt) && cmp(lastBuilt, manifestVersion) > 0 ? lastBuilt : manifestVersion;
  const [maj, min, pat] = base.split('.').map(Number);
  return `${maj}.${min}.${pat + 1}`;
}

module.exports = { nextVersion, cmp };
