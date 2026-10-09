import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import policy from '../scripts/yard-ui-media-budget.json' with { type: 'json' };
import nativeSources from '../game-logic/yard-v2/mika-native-sources.json' with { type: 'json' };
import inventory from '../src/games/companion-yard-v2/ui-image-inventory.json' with { type: 'json' };
import { createUiImageReserve } from '../src/games/companion-yard-v2/ui-image-reserve.mjs';
import { ACTIVE_CLEAN_MEDIA_BYTES, REQUIRED_YARD_UI_BYTES, OTHER_NON_FAMILY_ASSET_CEILING, inspectYardAssetBudget, partitionYardAssetInventory, walkPublicAssets } from '../scripts/yard-ui-media-budget.mjs';
import { analyzeDist, DEFAULT_BUILD_BUDGETS } from '../scripts/perf-build-guard.mjs';

const root = path.resolve(import.meta.dirname, '..');
const metadata = { format: 'yard-pip-vendor-report/v3', activation: 'canonical-clean', included: true };
const graph = { entries: { 'companion-yard-v2': 'assets/yard.js' }, chunks: [
  { file: 'assets/yard.js', modules: [], imports: [], dynamicImports: ['assets/clean.js'] },
  { file: 'assets/clean.js', modules: ['src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs'], imports: [], dynamicImports: [] },
] };
const row = ({ path, bytes, sha256 }) => ({ path, bytes, sha256 });
const nativeBytes = 3_671_320;
const exactRows = () => [...policy.requiredUi, ...policy.activeMedia, ...policy.nativeMedia].map(row);
const partition = (changes = {}) => partitionYardAssetInventory({ rows: exactRows(), sharedRows: policy.sharedUi.map(row), graph, metadata, ...changes });
const write = async (dir, file, bytes) => { await mkdir(path.dirname(path.join(dir, file)), { recursive: true }); await writeFile(path.join(dir, file), bytes); };
async function temporary(t) { const dir = await mkdtemp(path.join(os.tmpdir(), 'yard-clean-media-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

// Identity/encoded-resource checks do not establish visual, decoded or GPU acceptance.
test('ordinary clean delivery admits only the pinned 18 UI assets, shared album, nine credited sources and required residual P2', () => {
  const result = partition();
  assert.deepEqual(result.failures, []);
  assert.equal(result.mode, 'canonical-clean');
  assert.equal(result.requiredUi.count, 18); assert.equal(result.requiredUi.rawBytes, 1_365_147);
  assert.equal(result.sharedUi.count, 1); assert.equal(result.sharedUi.rawBytes, 17_754);
  assert.equal(result.activeMedia.count, 9); assert.equal(result.activeMedia.rawBytes, 5_817_931);
  assert.equal(result.nativeMedia.count, 1); assert.equal(result.nativeMedia.rawBytes, nativeBytes);
  assert.equal(result.otherNonFamilyAssets.rawBytes, nativeBytes);
  assert.equal(result.aggregate.ceilingBytes, 80_653_392);
  assert.equal(REQUIRED_YARD_UI_BYTES, 1_365_147); assert.equal(ACTIVE_CLEAN_MEDIA_BYTES, 5_817_931);
  const model = nativeSources.sources.find(source => source.role === 'model');
  assert.deepEqual(policy.nativeMedia.find(source => source.source === model.path), { path: model.path.slice(7), source: model.path, bytes: model.bytes, sha256: model.sha256 });
});

test('missing, altered, duplicated and relocated pinned bytes cannot earn delivery credit', () => {
  for (const expected of [...policy.requiredUi, ...policy.activeMedia, ...policy.nativeMedia]) {
    for (const replacement of [null, { ...expected, bytes: expected.bytes - 1 }, { ...expected, sha256: '0'.repeat(64) }]) {
      const rows = exactRows().filter(row => row.path !== expected.path);
      if (replacement) rows.push(row(replacement));
      const result = partition({ rows });
      assert.ok(result.failures.some(failure => /-exact$/.test(failure.id) && failure.actual === expected.path), expected.path);
      assert.equal(result.otherNonFamilyAssets.rawBytes, (expected.path === policy.nativeMedia[0].path ? 0 : nativeBytes) + (replacement?.bytes || 0));
    }
  }
  const known = policy.activeMedia[0];
  assert.ok(partition({ rows: [...exactRows(), { ...row(known), path: 'assets/renamed.json' }] }).failures.some(f => f.id === 'public-assets.yard-unexpected-path'));
  assert.ok(partition({ rows: [...exactRows(), row(known)] }).failures.some(f => f.id === 'public-assets.yard-duplicate-path'));
  assert.ok(partition({ sharedRows: [{ ...row(policy.sharedUi[0]), sha256: '0'.repeat(64) }] }).failures.some(f => f.id === 'public-assets.yard-ui-exact'));
});

test('old preview receipts and orphaned clean modules cannot qualify the ordinary route', () => {
  for (const mode of [null, { format: 'yard-pip-vendor-report/v2', previewBuild: true, included: true }, { ...metadata, included: false }]) {
    assert.ok(partition({ metadata: mode }).failures.some(f => f.id === 'public-assets.yard-mode'));
  }
  const orphan = structuredClone(graph); orphan.chunks[0].dynamicImports = [];
  assert.ok(partition({ graph: orphan }).failures.some(f => f.id === 'public-assets.yard-mode-graph'));
  assert.ok(partition({ graph: null }).failures.some(f => f.id === 'public-assets.yard-mode-graph'));
});

test('all retired scene namespaces and obsolete UI assets fail even below every byte ceiling', () => {
  for (const retired of ['yard-family/basil/idle.webp', 'yard-fox/willow.webp', 'yard-turtles/sage.webp', 'yard-mika/idle.webp', 'yard-mochi/idle.webp', 'yard-pebble/idle.webp', 'yard-pip/idle.webp', 'yard-ui/delivery/background-meadow.webp', 'yard-ui/previews/unused.webp']) {
    const result = partition({ rows: [...exactRows(), { path: `assets/${retired}`, bytes: 1, sha256: '0'.repeat(64) }] });
    assert.ok(result.failures.some(f => f.id === 'public-assets.yard-retired-path'), retired);
    assert.equal(result.otherNonFamilyAssets.rawBytes, nativeBytes + 1);
  }
});

test('the unrelated allowance is unchanged, inclusive at the boundary and cannot consume old family credit', () => {
  assert.equal(OTHER_NON_FAMILY_ASSET_CEILING, 73_470_314);
  const extra = bytes => ({ path: 'assets/unrelated.bin', bytes, sha256: '0'.repeat(64) });
  assert.deepEqual(partition({ rows: [...exactRows(), extra(73_470_314 - nativeBytes)] }).failures, []);
  const over = partition({ rows: [...exactRows(), extra(73_470_315 - nativeBytes)] });
  assert.ok(over.failures.some(f => f.id === 'public-assets.other-non-family.raw'));
  assert.ok(over.failures.some(f => f.id === 'public-assets.total.raw'));
  assert.deepEqual(DEFAULT_BUILD_BUDGETS, {
    initialScriptRawBytes: 575_000, initialScriptGzipBytes: 190_000, initialCssRawBytes: 95_000, initialCssGzipBytes: 20_000,
    asyncPixiRawBytes: 660_000, maxGameChunkRawBytes: 75_000, runtimeManifestRawBytes: 40_000, runtimeManifestGzipBytes: 5_000,
    runtimeAssetsTotalRawBytes: 12_000_000, runtimeAssetMaxRawBytes: 2_500_000,
    publicGamesTotalRawBytes: 181_000_000, publicAssetsTotalRawBytes: 75_000_000, publicMediaTotalRawBytes: 263_000_000,
    nonFamilyPublicAssetsTotalRawBytes: 75_000_000, nonFamilyPublicMediaTotalRawBytes: 263_000_000,
  });
});

test('fresh filesystem inspection rejects malformed media with the right path and length', async t => {
  const dir = await temporary(t);
  await write(dir, 'yard-pip-vendor-report.json', JSON.stringify(metadata));
  const corrupted = [...policy.activeMedia, ...policy.nativeMedia].filter(row => /\.(?:png|glb)$/.test(row.path));
  for (const row of corrupted) await write(dir, row.path, Buffer.alloc(row.bytes));
  const result = await inspectYardAssetBudget({ distDir: dir, graph });
  assert.equal(result.activeMedia.rawBytes, 0);
  assert.equal(result.otherNonFamilyAssets.rawBytes, corrupted.reduce((total, row) => total + row.bytes, 0));
  for (const row of corrupted) assert.ok(result.failures.some(f => f.id === 'public-assets.clean-media-exact' && f.actual === row.path));
  const source = policy.activeMedia.find(row => row.source.endsWith('/data/calibration.json'));
  const bytes = await readFile(path.join(root, source.source));
  await write(dir, source.path, bytes);
  const fresh = await walkPublicAssets(dir);
  assert.deepEqual(fresh.find(row => row.path === source.path), { path: source.path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  const native = policy.nativeMedia[0];
  await write(dir, native.path, await readFile(path.join(root, native.source)));
  const exact = await inspectYardAssetBudget({ distDir: dir, graph });
  assert.equal(exact.activeMedia.count, 1);
  assert.equal(exact.activeMedia.rawBytes, source.bytes);
  assert.equal(exact.nativeMedia.rawBytes, nativeBytes);
  assert.equal(exact.otherNonFamilyAssets.rawBytes, corrupted.reduce((total, row) => total + row.bytes, 0), 'Exact native bytes retain their full residual charge');
  await write(dir, 'yard-pip-vendor-report.json', '{invalid');
  assert.ok((await inspectYardAssetBudget({ distDir: dir, graph })).failures.some(f => f.id === 'public-assets.yard-mode'));
});

test('asset inventory rejects symlinked files and directories', async t => {
  const dir = await temporary(t);
  await write(dir, 'outside.bin', 'unreviewed');
  await mkdir(path.join(dir, 'assets'));
  await symlink(path.join(dir, 'outside.bin'), path.join(dir, 'assets', 'alias.bin'));
  await assert.rejects(walkPublicAssets(dir), /Symlink/);
  await rm(path.join(dir, 'assets', 'alias.bin'));
  await symlink(dir, path.join(dir, 'assets', 'nested'));
  await assert.rejects(walkPublicAssets(dir), /Symlink/);
});

test('build guard retains generic corruption and growth checks and rejects retired JS references', async t => {
  const dir = await temporary(t);
  await write(dir, 'index.html', '<script type="module" src="/assets/app.js"></script>');
  await write(dir, 'assets/app.js', 'const old="/assets/yard-mika/idle.webp";');
  await write(dir, 'assets/unrelated.bin', Buffer.alloc(101));
  await write(dir, 'assets/yard-family/basil/runtime-media.json', '{}');
  await write(dir, 'assets-runtime/manifest.json', '{invalid');
  const result = await analyzeDist({ distDir: dir, budgets: { nonFamilyPublicAssetsTotalRawBytes: 100, nonFamilyPublicMediaTotalRawBytes: 100 } });
  for (const id of ['public-assets.retired-paths', 'public-assets.retired-references', 'public-assets.non-family.raw', 'public-media.non-family.raw', 'runtime-assets.manifest.valid-json']) assert.ok(result.failures.some(f => f.id === id), id);
  assert.equal(result.metrics.nonFamilyPublicAssets.rawBytes, 103);
});

test('the decoded UI inventory matches the 19 current URLs and retains separate dynamic admission', async () => {
  const urls = new Set();
  for (const file of ['courtyard.css', 'catalog-ui.mjs']) {
    const source = await readFile(path.join(root, 'src/games/companion-yard-v2', file), 'utf8');
    for (const [url] of source.matchAll(/\/(?:assets|games)\/[^\s'"()]+/g)) urls.add(url);
  }
  assert.equal(urls.size, 19);
  assert.deepEqual(inventory.rows.map(row => row.url).sort(), [...urls].sort());
  assert.deepEqual([...policy.requiredUi, ...policy.sharedUi].map(row => '/' + row.path).sort(), [...urls].sort());
  for (const row of inventory.rows) {
    const pin = [...policy.requiredUi, ...policy.sharedUi].find(pin => '/' + pin.path === row.url);
    assert.equal(row.sha256, pin.sha256); assert.equal(row.width, pin.width); assert.equal(row.height, pin.height);
    assert.equal(row.alwaysReserved, row.owner.startsWith('css-url:'));
  }
  const reserve = createUiImageReserve(inventory);
  const before = reserve.snapshot();
  assert.equal(before.owners, 8);
  reserve.registerCatalog({ baseURL: 'https://yard.invalid/assets/clean/', foods: { meal: { src: 'meal.webp', canvas: [16, 16] } }, goodies: {} });
  assert.equal(reserve.admit(['https://yard.invalid/assets/clean/meal.webp']), true);
  assert.equal(reserve.snapshot().bytes, before.bytes + 16 * 16 * 4);
  assert.throws(() => reserve.admit(['/assets/yard-ui/previews/retired.webp']), /Unregistered/);
  assert.throws(() => reserve.registerCatalog({ baseURL: 'https://yard.invalid/', foods: { invalid: { src: 'bad.webp', canvas: [NaN, 8] } } }), /dimensions/);
  reserve.dispose();
});
