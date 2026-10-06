import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import policy from '../scripts/yard-ui-media-budget.json' with { type: 'json' };
import { inspectYardAssetBudget, walkPublicAssets, OTHER_NON_FAMILY_ASSET_CEILING } from '../scripts/yard-ui-media-budget.mjs';
import { analyzeDist, runBuildPerfGuard, DEFAULT_BUILD_BUDGETS } from '../scripts/perf-build-guard.mjs';

const root = path.resolve(import.meta.dirname, '..');
const write = async (dir, name, data) => { await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true }); await fs.writeFile(path.join(dir, name), data); };
const graph = preview => ({ schemaVersion: 1, entries: {}, chunks: preview ? [{ modules: ['src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs'] }] : [] });
async function mode(dir, preview) { await write(dir, 'yard-pip-vendor-report.json', JSON.stringify({ format: 'yard-pip-vendor-report/v2', previewBuild: preview, included: preview })); }
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yard-media-budget-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const row of policy.requiredUi) await write(dir, row.path, await fs.readFile(path.join(root, row.source)));
  await mode(dir, false); return dir;
}

test('all required UI pins are exact; missing or equal-length changed bytes earn no allowance', async t => {
  const dir = await fixture(t), row = policy.requiredUi[0], original = await fs.readFile(path.join(dir, row.path));
  let result = await inspectYardAssetBudget({ distDir: dir, graph: graph(false) });
  assert.deepEqual(result.failures, []); assert.equal(result.requiredUi.count, 78); assert.equal(result.requiredUi.rawBytes, 5_345_589);
  const changed = Buffer.from(original); changed[0] ^= 1; await write(dir, row.path, changed);
  result = await inspectYardAssetBudget({ distDir: dir, graph: graph(false) });
  assert.ok(result.failures.some(row => row.id === 'public-assets.yard-ui-exact'));
  assert.equal(result.requiredUi.count, 77); assert.equal(result.otherNonFamilyAssets.rawBytes, original.length);
  await fs.unlink(path.join(dir, row.path));
  assert.ok((await inspectYardAssetBudget({ distDir: dir, graph: graph(false) })).failures.some(row => row.id === 'public-assets.yard-ui-exact'));
});

test('optional presence cannot enable its allowance; explicit mode, graph, paths and all seven hashes agree', async t => {
  const dir = await fixture(t);
  for (const row of policy.optionalMedia) await write(dir, row.path, await fs.readFile(path.join(root, row.source)));
  let result = await inspectYardAssetBudget({ distDir: dir, graph: graph(false) });
  assert.equal(result.mode, 'off'); assert.equal(result.optionalMedia.rawBytes, 0);
  assert.ok(result.failures.some(row => row.id === 'public-assets.pip-absent-in-default'));
  await mode(dir, true);
  assert.ok((await inspectYardAssetBudget({ distDir: dir, graph: graph(false) })).failures.some(row => row.id === 'public-assets.yard-mode-graph'));
  result = await inspectYardAssetBudget({ distDir: dir, graph: graph(true) });
  assert.deepEqual(result.failures, []); assert.equal(result.optionalMedia.count, 7); assert.equal(result.optionalMedia.rawBytes, 5_555_295);
  const row = policy.optionalMedia[0], bytes = await fs.readFile(path.join(dir, row.path)); bytes[0] ^= 1; await write(dir, row.path, bytes);
  assert.ok((await inspectYardAssetBudget({ distDir: dir, graph: graph(true) })).failures.some(row => row.id === 'public-assets.pip-media-exact'));
  await fs.unlink(path.join(dir, row.path));
  assert.ok((await inspectYardAssetBudget({ distDir: dir, graph: graph(true) })).failures.some(row => row.id === 'public-assets.pip-media-exact'));
  await write(dir, 'assets/renamed-unapproved.json', await fs.readFile(path.join(root, row.source)));
  assert.ok((await inspectYardAssetBudget({ distDir: dir, graph: graph(true) })).failures.some(row => row.id === 'public-assets.pip-unexpected-path'));
});

test('fresh walk charges unknown added paths and never reads a cached perf inventory', async t => {
  const dir = await fixture(t);
  await write(dir, 'perf-build-report.json', JSON.stringify({ passed: true, metrics: { publicAssets: { rawBytes: 0, files: [] } } }));
  await write(dir, 'assets/new/unlisted.payload', 'x');
  const result = await inspectYardAssetBudget({ distDir: dir, graph: graph(false) });
  assert.equal(result.otherNonFamilyAssets.rawBytes, 1); assert.equal(result.otherNonFamilyAssets.ceilingBytes, OTHER_NON_FAMILY_ASSET_CEILING);
  assert.equal(result.otherNonFamilyAssets.files[0].path, 'assets/new/unlisted.payload');
  await write(dir, 'index.html', '<script type="module" src="/assets/app.js"></script>');
  await write(dir, 'assets/app.js', 'export {};');
  const report = await analyzeDist({ distDir: dir, budgets: { nonFamilyPublicAssetsTotalRawBytes: 0 } });
  assert.ok(report.failures.some(row => row.id === 'public-assets.other-non-family.raw' && row.actual === 1));
});

test('asset symlinks are rejected instead of being omitted from inventory', async t => {
  const dir = await fixture(t); await write(dir, 'owned-target', 'x');
  await fs.symlink(path.join(dir, 'owned-target'), path.join(dir, 'assets/unlisted.bin'));
  await assert.rejects(walkPublicAssets(dir), /Symlink in generated asset tree/);
});

test('an explicitly supplied historical aggregate cap is honored even when it equals DEFAULT', async t => {
  const dir = await fixture(t);
  await write(dir, 'index.html', '<script type="module" src="/assets/app.js"></script>');
  await write(dir, 'assets/app.js', 'export {};');
  const historical = DEFAULT_BUILD_BUDGETS.publicAssetsTotalRawBytes;
  const omitted = await analyzeDist({ distDir: dir });
  assert.equal(omitted.appliedPublicAssetsCeiling, 271_469_336);
  const explicit = await analyzeDist({ distDir: dir, budgets: { publicAssetsTotalRawBytes: historical } });
  assert.equal(explicit.appliedPublicAssetsCeiling, historical);
  const allDefaults = await runBuildPerfGuard({ distDir: dir, budgets: DEFAULT_BUILD_BUDGETS, writeReport: false, quiet: true });
  assert.equal(allDefaults.appliedPublicAssetsCeiling, historical);
  const wrapperDefault = await runBuildPerfGuard({ distDir: dir, writeReport: false, quiet: true });
  assert.equal(wrapperDefault.appliedPublicAssetsCeiling, 271_469_336);
});
