/** Finite encoded delivery partition. This grants no startup, decoded or GPU allowance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import policy from './yard-ui-media-budget.json' with { type: 'json' };
import { isRetiredAssetPath } from './asset-retirement-policy.mjs';

export const REQUIRED_YARD_UI_BYTES = 1_365_147;
export const ACTIVE_CLEAN_MEDIA_BYTES = 5_817_931;
export const OTHER_NON_FAMILY_ASSET_CEILING = 73_470_314;
const cleanPrefix = 'src/games/companion-yard-v2/pip-prototype/';
const cleanScene = `${cleanPrefix}yard-pip-scene.mjs`;
const nativeMikaSource = 'public/assets/yard-mika-p2-qa/p2.glb';
const sum = rows => rows.reduce((n, row) => n + row.bytes, 0);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const issue = (id, actual, expected, message) => ({ id, actual, budget: expected, message });

// A reviewed row never becomes a wildcard or a data-controlled allowance.
assert.equal(policy.format, 'yard-clean-media/v1');
assert.equal(policy.requiredUi.length, 18);
assert.equal(policy.sharedUi.length, 1);
assert.equal(policy.activeMedia.length, 9);
assert.equal(policy.nativeMedia.length, 1);
assert.equal(sum(policy.nativeMedia), 3_671_320);
assert.equal(sum(policy.requiredUi), REQUIRED_YARD_UI_BYTES);
assert.equal(sum(policy.sharedUi), 17_754);
assert.equal(sum(policy.activeMedia), ACTIVE_CLEAN_MEDIA_BYTES);
const expectedRows = [...policy.requiredUi, ...policy.sharedUi, ...policy.activeMedia, ...policy.nativeMedia];
const allPaths = new Set(), allHashes = new Set();
for (const row of expectedRows) {
  assert.ok(/^(?:assets|games)\//.test(row.path) && !row.path.split('/').some(part => !part || part === '.' || part === '..'));
  assert.ok(Number.isSafeInteger(row.bytes) && row.bytes > 0 && /^[a-f0-9]{64}$/.test(row.sha256));
  assert.ok(!allPaths.has(row.path), 'Delivery categories overlap: ' + row.path); allPaths.add(row.path);
  assert.ok(!allHashes.has(row.sha256), 'Delivery identities overlap: ' + row.path); allHashes.add(row.sha256);
}
assert.ok(policy.requiredUi.every(row => row.path.startsWith('assets/yard-ui/') && row.source === `public/${row.path}`));
assert.equal(policy.sharedUi[0].path, 'games/hud-redesign/room/semantic-icons/dock-album.png');
assert.ok(policy.activeMedia.every(row => row.path.startsWith('assets/') && row.source.startsWith(cleanPrefix)));
assert.equal(policy.nativeMedia[0].source, nativeMikaSource);
assert.equal(policy.nativeMedia[0].path, nativeMikaSource.slice('public/'.length));
const expectedByHash = new Map(expectedRows.map(row => [row.sha256, row]));
const matches = (actual, expected) => actual?.bytes === expected.bytes && actual?.sha256 === expected.sha256;

async function metric(distDir, relative) {
  const absolute = path.join(distDir, relative);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) throw Error('Symlink in generated asset tree: ' + relative);
  if (!info.isFile()) throw Error('Unsupported generated asset type: ' + relative);
  const bytes = await readFile(absolute);
  return { path: relative, bytes: bytes.length, sha256: sha(bytes) };
}

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
      rows.push(await metric(distDir, relative));
    } else if (!info.isFile()) throw Error('Unsupported generated asset type: ' + relative);
  }
  await walk('assets');
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function hasReachableCleanScene(graph) {
  const chunks = new Map((graph?.chunks || []).map(chunk => [chunk.file, chunk]));
  const seen = new Set();
  function visit(file) {
    if (seen.has(file) || !chunks.has(file)) return false;
    seen.add(file);
    const chunk = chunks.get(file);
    if ((chunk.modules || []).includes(cleanScene)) return true;
    return [...(chunk.imports || []), ...(chunk.dynamicImports || []), ...(chunk.workerImports || [])].some(visit);
  }
  return visit(graph?.entries?.['companion-yard-v2']);
}

/** Separate pure admission from filesystem collection so malformed identities and
 * threshold boundaries can be tested without manufacturing multi-MB media. */
export function partitionYardAssetInventory({ rows, sharedRows = [], metadata, graph }) {
  const failures = [], byPath = new Map([...rows, ...sharedRows].map(row => [row.path, row]));
  if (byPath.size !== rows.length + sharedRows.length) failures.push(issue('public-assets.yard-duplicate-path', byPath.size, rows.length + sharedRows.length, 'Generated asset inventory has duplicate paths'));
  const validMode = metadata?.format === 'yard-pip-vendor-report/v3' && metadata.activation === 'canonical-clean' && metadata.included === true;
  if (!validMode) failures.push(issue('public-assets.yard-mode', metadata ?? null, 'canonical-clean vendor receipt', 'Clean Yard requires the current ordinary-route vendor receipt'));
  if (!hasReachableCleanScene(graph)) failures.push(issue('public-assets.yard-mode-graph', false, 'reachable clean scene', 'The actual Yard loading graph must reach the clean scene'));

  const approved = new Set();
  for (const row of expectedRows) {
    if (matches(byPath.get(row.path), row)) approved.add(row.path);
    else failures.push(issue(row.path.startsWith('assets/yard-ui/') || policy.sharedUi.includes(row) ? 'public-assets.yard-ui-exact' : 'public-assets.clean-media-exact', row.path, row.sha256, 'Required clean Yard file is missing or changed: ' + row.path));
  }
  for (const row of [...rows, ...sharedRows]) {
    const expected = expectedByHash.get(row.sha256);
    if (expected && row.path !== expected.path) failures.push(issue('public-assets.yard-unexpected-path', row.path, expected.path, 'Pinned Yard bytes appeared outside their permitted path'));
    if (isRetiredAssetPath(row.path) || row.path.startsWith('assets/yard-ui/') && !allPaths.has(row.path)) failures.push(issue('public-assets.yard-retired-path', row.path, 'absent', 'Retired or unreviewed Yard media must not ship'));
  }
  // Only exact retained UI and the nine clean scene sources earn delivery credit.
  // Native P2 remains inside its original residual bucket even when hash-exact.
  // A changed file also stays in that unchanged remainder.
  const ui = rows.filter(row => approved.has(row.path) && policy.requiredUi.some(expected => expected.path === row.path));
  const active = rows.filter(row => approved.has(row.path) && policy.activeMedia.some(expected => expected.path === row.path));
  const sharedUi = sharedRows.filter(row => approved.has(row.path));
  const nativeMedia = rows.filter(row => approved.has(row.path) && policy.nativeMedia.some(expected => expected.path === row.path));
  const creditedPaths = new Set([...ui, ...active].map(row => row.path));
  const other = rows.filter(row => !creditedPaths.has(row.path));
  const actualBytes = sum(rows), ceilingBytes = REQUIRED_YARD_UI_BYTES + ACTIVE_CLEAN_MEDIA_BYTES + OTHER_NON_FAMILY_ASSET_CEILING;
  if (sum(other) > OTHER_NON_FAMILY_ASSET_CEILING) failures.push(issue('public-assets.other-non-family.raw', sum(other), OTHER_NON_FAMILY_ASSET_CEILING, 'Unrelated encoded media exceeds its unchanged aggregate ceiling'));
  if (actualBytes > ceilingBytes) failures.push(issue('public-assets.total.raw', actualBytes, ceilingBytes, 'Clean Yard encoded delivery exceeds its finite aggregate ceiling'));
  return {
    format: 'yard-encoded-asset-partition/v2', mode: validMode ? 'canonical-clean' : 'invalid',
    source: 'fresh recursive dist/assets walk; no cached report or inventory',
    requiredUi: { count: ui.length, rawBytes: sum(ui), files: ui },
    sharedUi: { count: sharedUi.length, rawBytes: sum(sharedUi), files: sharedUi, qualification: 'Already counted in public games; no additional asset allowance' },
    activeMedia: { count: active.length, rawBytes: sum(active), files: active },
    nativeMedia: { count: nativeMedia.length, rawBytes: sum(nativeMedia), files: nativeMedia, qualification: 'Exact required identity; fully charged to otherNonFamilyAssets' },
    otherNonFamilyAssets: { count: other.length, rawBytes: sum(other), files: other, ceilingBytes: OTHER_NON_FAMILY_ASSET_CEILING,
      qualification: 'Aggregate byte ceiling, not a hash freeze of every remaining file' },
    aggregate: { actualBytes, ceilingBytes },
    failures,
  };
}

export async function inspectYardAssetBudget({ distDir, graph }) {
  const rows = await walkPublicAssets(distDir), sharedRows = [];
  let metadata = null;
  try { metadata = JSON.parse(await readFile(path.join(distDir, 'yard-pip-vendor-report.json'), 'utf8')); }
  catch (error) { if (error.code && error.code !== 'ENOENT') throw error; }
  for (const row of policy.sharedUi) {
    try { sharedRows.push(await metric(distDir, row.path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return partitionYardAssetInventory({ rows, sharedRows, metadata, graph });
}
