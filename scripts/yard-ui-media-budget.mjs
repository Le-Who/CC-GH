/** Finite encoded delivery partition. This grants no startup, decoded or GPU allowance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import policy from './yard-ui-media-budget.json' with { type: 'json' };
import family from './yard-public-media.json' with { type: 'json' };

export const REQUIRED_YARD_UI_BYTES = 5_335_835;
const REQUIRED_YARD_UI_ALLOWANCE = 5_345_589; // Existing aggregate cap, not increased by the sharper re-export.
export const OPTIONAL_PIP_MEDIA_BYTES = 5_817_931;
// Exactly 251,996 additional optional bytes are the pinned R2 food GLB.
// Default-off, unrelated ownership and all decoded/CPU/GPU caps are unchanged.
export const OTHER_NON_FAMILY_ASSET_CEILING = 73_470_314;
const FAMILY_BYTES = 192_653_433;
const optionalPrefix = 'src/games/companion-yard-v2/pip-prototype/';
const sum = rows => rows.reduce((n, row) => n + row.bytes, 0);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const issue = (id, actual, expected, message) => ({ id, actual, budget: expected, message });

// A reviewed row never becomes a wildcard or a data-controlled allowance.
assert.equal(policy.format, 'yard-ui-and-pip-media/v1');
assert.equal(policy.requiredUi.length, 78);
assert.equal(policy.optionalMedia.length, 9);
assert.equal(sum(policy.requiredUi), REQUIRED_YARD_UI_BYTES);
assert.equal(sum(policy.optionalMedia), OPTIONAL_PIP_MEDIA_BYTES);
const allPaths = new Set();
for (const row of [...family.files, ...policy.requiredUi, ...policy.optionalMedia]) {
  assert.ok(row.path.startsWith('assets/') && !row.path.split('/').some(part => !part || part === '.' || part === '..'));
  assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && /^[a-f0-9]{64}$/.test(row.sha256));
  assert.ok(!allPaths.has(row.path), 'Delivery categories overlap: ' + row.path); allPaths.add(row.path);
}
assert.ok(policy.requiredUi.every(row => row.path.startsWith('assets/yard-ui/')));
assert.ok(policy.optionalMedia.every(row => row.source.startsWith(optionalPrefix)));
const uiHashes = new Set(policy.requiredUi.map(row => row.sha256)), familyHashes = new Set(family.files.map(row => row.sha256));
assert.equal(uiHashes.size, 78);
assert.ok(policy.requiredUi.every(row => !familyHashes.has(row.sha256)));
assert.ok(policy.optionalMedia.every(row => !familyHashes.has(row.sha256) && !uiHashes.has(row.sha256)));
const optionalByHash = new Map(policy.optionalMedia.map(row => [row.sha256, row]));
assert.equal(optionalByHash.size, 9);
const familyByPath = new Map(family.files.map(row => [row.path, row]));
const matches = (actual, expected) => actual?.bytes === expected.bytes && actual?.sha256 === expected.sha256;

/** Fresh recursive inventory, including unknown paths. No saved perf report is an input. */
export async function walkPublicAssets(distDir) {
  const rows = [];
  try { await lstat(path.join(distDir, 'assets')); } catch (error) { if (error.code === 'ENOENT') return rows; throw error; }
  async function walk(relative) {
    const absolute = path.join(distDir, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw Error('Symlink in generated asset tree: ' + relative);
    if (info.isDirectory()) {
      for (const entry of await readdir(absolute)) await walk(path.posix.join(relative, entry));
    } else if (info.isFile() && !/\.(?:js|css|map)$/.test(relative)) {
      const bytes = await readFile(absolute); rows.push({ path: relative, bytes: bytes.length, sha256: sha(bytes) });
    } else if (!info.isFile()) throw Error('Unsupported generated asset type: ' + relative);
  }
  await walk('assets');
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

export async function inspectYardAssetBudget({ distDir, graph }) {
  const failures = [], rows = await walkPublicAssets(distDir), byPath = new Map(rows.map(row => [row.path, row]));
  let metadata = null;
  try { metadata = JSON.parse(await readFile(path.join(distDir, 'yard-pip-vendor-report.json'), 'utf8')); }
  catch (error) { failures.push(issue('public-assets.yard-mode', error.code || error.message, 'literal build-mode metadata', 'Yard media budget requires the current build-mode receipt')); }
  const validMode = metadata?.format === 'yard-pip-vendor-report/v2' && typeof metadata.previewBuild === 'boolean'
    && metadata.included === metadata.previewBuild;
  if (!validMode) failures.push(issue('public-assets.yard-mode', metadata, 'verified off/preview mode', 'Missing or inconsistent literal preview build mode'));
  const preview = validMode && metadata.previewBuild;
  const optionalModules = (graph?.chunks || []).flatMap(chunk => chunk.modules || []).filter(source => source.startsWith(optionalPrefix));
  if (!graph || (optionalModules.length > 0) !== preview) failures.push(issue('public-assets.yard-mode-graph', optionalModules.length, preview ? 'optional modules present' : 0, 'Build mode and actual optional module ownership disagree'));

  const approvedUi = new Set(), approvedOptional = new Set(), approvedFamily = new Set();
  for (const row of policy.requiredUi) {
    if (matches(byPath.get(row.path), row)) approvedUi.add(row.path);
    else failures.push(issue('public-assets.yard-ui-exact', row.path, row.sha256, 'Required Yard UI file is missing or changed: ' + row.path));
  }
  for (const row of policy.optionalMedia) {
    const actual = byPath.get(row.path);
    if (preview && matches(actual, row)) approvedOptional.add(row.path);
    else if (preview) failures.push(issue('public-assets.pip-media-exact', row.path, row.sha256, 'Optional Pip file is missing or changed: ' + row.path));
    else if (actual) failures.push(issue('public-assets.pip-absent-in-default', row.path, 'absent', 'Default build contains optional Pip media: ' + row.path));
  }
  for (const row of rows) {
    const knownOptional = optionalByHash.get(row.sha256);
    if (knownOptional && (row.path !== knownOptional.path || !preview)) failures.push(issue('public-assets.pip-unexpected-path', row.path, preview ? knownOptional.path : 'absent', 'Optional Pip bytes appeared outside their permitted mode/path'));
    const expected = familyByPath.get(row.path);
    if (expected && matches(row, expected)) approvedFamily.add(row.path);
  }
  // The existing family guard still checks its complete 706-file namespace.
  // Only exact family rows are subtracted here; changed bytes earn no credit.
  const ui = rows.filter(row => approvedUi.has(row.path)), optional = rows.filter(row => approvedOptional.has(row.path));
  const other = rows.filter(row => !approvedUi.has(row.path) && !approvedOptional.has(row.path) && !approvedFamily.has(row.path));
  return {
    format: 'yard-encoded-asset-partition/v1', mode: validMode ? (preview ? 'preview' : 'off') : 'invalid',
    source: 'fresh recursive dist/assets walk; no cached report or inventory',
    requiredUi: { count: ui.length, rawBytes: sum(ui), files: ui },
    optionalMedia: { count: optional.length, rawBytes: sum(optional), files: optional },
    otherNonFamilyAssets: { count: other.length, rawBytes: sum(other), files: other, ceilingBytes: OTHER_NON_FAMILY_ASSET_CEILING,
      qualification: 'Aggregate byte ceiling, not a hash freeze of every remaining file' },
    aggregate: { actualBytes: sum(rows), ceilingBytes: FAMILY_BYTES + REQUIRED_YARD_UI_ALLOWANCE + OTHER_NON_FAMILY_ASSET_CEILING + (preview ? OPTIONAL_PIP_MEDIA_BYTES : 0) },
    historicalCeilings: { publicAssets: 267_653_433, nonFamilyAssets: 75_000_000, preIntegrationNonFamilyBytes: 75_113_382,
      preIntegrationOverageBytes: 113_382 },
    failures,
  };
}
