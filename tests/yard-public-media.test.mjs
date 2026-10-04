import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, matchesGlob, resolve } from 'node:path';
import test from 'node:test';
import { materializeYardPublicMedia, readYardPublicMediaMap, yardPublicMedia } from '../scripts/yard-public-media.mjs';
import { loadAssetPipelineEntries } from '../scripts/assets-pipeline.config.mjs';
import { GAME_ASSET_BUNDLES } from '../src/game-runtime/assetBundles.js';
import { DEFAULT_BUILD_BUDGETS, FROZEN_YARD_DELIVERY_RAW_BYTES, analyzeDist } from '../scripts/perf-build-guard.mjs';
import { FAMILY_ATLAS_POLICY } from '../src/games/companion-yard-v2/atlas-policy.mjs';
import { createShellPrecache } from '../scripts/sw-shell-precache.mjs';

const root = resolve(import.meta.dirname, '..');
const sourcePrefix = 'recovery-tools/yard-family-frozen/';
const hash = data => createHash('sha256').update(data).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const write = async (root, path, data) => { const file = resolve(root, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, data); };
async function fixture(t, files = { 'assets/yard-family/basil/runtime-media.json': '{"fixture":true}\n' }) {
  const temp = await mkdtemp(resolve(os.tmpdir(), 'yard-delivery-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const rows = [];
  for (const [path, text] of Object.entries(files)) {
    const bytes = Buffer.from(text);
    rows.push({ path, bytes: bytes.length, sha256: hash(bytes), contentType: path.endsWith('.json') ? 'application/json' : 'image/webp' });
    await write(temp, sourcePrefix + path, bytes);
  }
  const map = { format: 'yard-public-media/v1', runtimeActivated: false, files: rows, totalFiles: rows.length, totalBytes: rows.reduce((n, r) => n + r.bytes, 0) };
  await write(temp, 'scripts/yard-public-media.json', JSON.stringify(map));
  return { temp, map };
}

test('delivery map is exactly the reviewed manifest/page/still URL graph, with no proof files', async () => {
  const map = await readYardPublicMediaMap(root), closureBytes = await readFile(resolve(root, 'recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json'));
  assert.equal(hash(closureBytes), map.reviewedMediaClosureSha256);
  const frozen = JSON.parse(closureBytes).files.filter(row => row.repositoryPath.startsWith(sourcePrefix));
  const urls = new Set();
  for (const actor of ['basil', 'sage', 'starlit', 'willow']) {
    const path = `assets/yard-family/${actor}/runtime-media.json`;
    urls.add(path);
    const manifest = await readJson(resolve(root, sourcePrefix, path));
    assert.equal(manifest.runtimeActivated, false); assert.equal(manifest.playbackReady, false);
    for (const clip of [...Object.values(manifest.walk.facings), ...Object.values(manifest.turns), ...Object.values(manifest.clips), ...Object.values(manifest.extraSourceClips)]) {
      for (const page of clip.pages) {
        const url = new URL(page.src, 'https://fixture.invalid' + manifest.roots[clip.assetRoot].path).pathname.slice(1);
        assert.equal(map.files.find(row => row.path === url)?.sha256, page.sha256);
        assert.ok(page.width * page.height * 4 <= 8 * 1024 * 1024); assert.ok(page.count <= 16);
        urls.add(url);
      }
    }
    for (const still of Object.values(manifest.stills)) {
      const url = new URL(still.src, 'https://fixture.invalid' + manifest.roots[still.assetRoot].path).pathname.slice(1);
      assert.equal(map.files.find(row => row.path === url)?.sha256, still.sha256); urls.add(url);
    }
  }
  assert.deepEqual([...urls].sort(), map.files.map(row => row.path).sort());
  assert.equal(map.totalFiles, 706); assert.equal(map.totalBytes, 192_653_433);
  for (const row of map.files) { const reviewed = frozen.find(item => item.path === row.path); assert.equal(row.bytes, reviewed.bytes); assert.equal(row.sha256, reviewed.sha256); }
  const excluded = frozen.filter(row => !urls.has(row.path));
  assert.equal(excluded.length, 13); assert.equal(excluded.reduce((n, row) => n + row.bytes, 0), 25_496_727);
  assert.equal((await materializeYardPublicMedia({ rootDir: root, check: true })).files, 706);
});

test('filtered Docker input patterns retain all and only the 706 frozen runtime files', async () => {
  const lines = (await readFile(resolve(root, '.dockerignore'), 'utf8')).split('\n').filter(line => line.replace(/^!/, '').startsWith(sourcePrefix));
  const map = await readYardPublicMediaMap(root), frozen = (await readJson(resolve(root, 'recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json'))).files.filter(row => row.repositoryPath.startsWith(sourcePrefix));
  // Docker's last matching rule wins. These rules use only root-anchored * / ** globs.
  const included = frozen.filter(row => { let include = true; for (const rule of lines) { if (matchesGlob(row.repositoryPath, rule.replace(/^!/, ''))) include = rule.startsWith('!'); } return include; });
  assert.deepEqual(included.map(row => row.path).sort(), map.files.map(row => row.path).sort());
  const docker = await readFile(resolve(root, 'Dockerfile'), 'utf8');
  assert.match(docker, /COPY --from=build \/app\/dist\/ \.\/dist\//);
  assert.equal((docker.match(/node scripts\/yard-public-media\.mjs --verify dist/g) || []).length, 2);
  assert.doesNotMatch(docker.split('FROM node:24-alpine\n')[1], /COPY.*(?:recovery-tools|public\/)/);
});

test('copies once, verifies final runtime without frozen inputs, and preserves exact bytes', async t => {
  const { temp, map } = await fixture(t);
  assert.equal((await materializeYardPublicMedia({ rootDir: temp, check: true })).newFiles, 1);
  assert.equal((await materializeYardPublicMedia({ rootDir: temp })).newFiles, 1);
  assert.equal((await materializeYardPublicMedia({ rootDir: temp })).newFiles, 0);
  await cp(resolve(temp, 'public'), resolve(temp, 'dist'), { recursive: true });
  await rm(resolve(temp, 'recovery-tools'), { recursive: true });
  assert.equal((await materializeYardPublicMedia({ rootDir: temp, outputDir: 'dist', verify: true })).totalBytes, map.totalBytes);
  await write(temp, 'dist/' + map.files[0].path, 'changed');
  await assert.rejects(materializeYardPublicMedia({ rootDir: temp, outputDir: 'dist', verify: true }), /mismatch/);
});

test('rejects missing/corrupt sources before the first write and never overwrites foreign outputs', async t => {
  const { temp, map } = await fixture(t, { 'assets/yard-family/basil/runtime-media.json': '{}', 'assets/yard-family/sage/runtime-media.json': '{}' });
  await write(temp, sourcePrefix + map.files[1].path, 'bad');
  await assert.rejects(materializeYardPublicMedia({ rootDir: temp }), /mismatch/);
  await assert.rejects(readFile(resolve(temp, 'public', map.files[0].path)), { code: 'ENOENT' });
  await write(temp, sourcePrefix + map.files[1].path, '{}');
  await rm(resolve(temp, sourcePrefix, map.files[1].path));
  await assert.rejects(materializeYardPublicMedia({ rootDir: temp }), { code: 'ENOENT' });
  await write(temp, sourcePrefix + map.files[1].path, '{}');
  await write(temp, 'public/' + map.files[0].path, 'foreign');
  await assert.rejects(materializeYardPublicMedia({ rootDir: temp }), /mismatch/);
  assert.equal(await readFile(resolve(temp, 'public', map.files[0].path), 'utf8'), 'foreign');
});

test('rejects unknown public assets, traversal, symlinks and fake image MIME', async t => {
  const { temp, map } = await fixture(t);
  await write(temp, 'public/assets/yard-fox/handoff.json', '{}');
  await assert.rejects(materializeYardPublicMedia({ rootDir: temp }), /Unexpected Yard output/);
  await rm(resolve(temp, 'public'), { recursive: true });
  await assert.rejects(materializeYardPublicMedia({ rootDir: temp, outputDir: '../escape' }), /Unsafe/);
  await mkdir(resolve(temp, 'public'), { recursive: true });
  await symlink(resolve(temp, sourcePrefix, 'assets'), resolve(temp, 'public/assets'));
  await assert.rejects(materializeYardPublicMedia({ rootDir: temp }), /Symlink/);
  map.files[0].path = 'assets/yard-family/../escape.json';
  await write(temp, 'scripts/yard-public-media.json', JSON.stringify(map));
  await assert.rejects(readYardPublicMediaMap(temp), /Invalid Yard delivery row/);
  const image = await fixture(t, { 'assets/yard-fox/test.webp': 'not an image' });
  await assert.rejects(materializeYardPublicMedia({ rootDir: image.temp }), /Invalid WebP/);
});

test('Vite hook runs before public copy without adding art to JS or shell precache', async t => {
  const { temp } = await fixture(t), plugin = yardPublicMedia(), messages = [];
  assert.deepEqual(Object.keys(plugin).sort(), ['configResolved', 'name']);
  await plugin.configResolved({ root: temp, publicDir: resolve(temp, 'public'), logger: { info: message => messages.push(message) } });
  assert.equal(messages.length, 1);
  assert.equal((await materializeYardPublicMedia({ rootDir: temp, verify: true })).files, 1);
  const shell = createShellPrecache(); shell.plugin.generateBundle({}, { 'assets/app.js': { type: 'chunk', fileName: 'assets/app.js', isEntry: true, imports: [] } });
  const art = (await readYardPublicMediaMap(root)).files.map(row => ({ url: row.path, revision: row.sha256 }));
  const kept = await shell.manifestTransform([{ url: 'assets/app.js', revision: 'shell' }, ...art]);
  assert.deepEqual(kept.manifest.map(row => row.url), ['assets/app.js']);
});


test('family delivery never joins asset-manifest warming and retains exact deployment-only budget delta', async () => {
  const family = /(?:assets\/yard-(family|fox|turtles)\/|yard-family-frozen)/;
  const entries = await loadAssetPipelineEntries(root);
  assert.ok(entries.length > 0);
  assert.equal(entries.some(entry => family.test(entry.source)), false);
  assert.doesNotMatch(JSON.stringify(GAME_ASSET_BUNDLES), family);
  assert.doesNotMatch(await readFile(resolve(root, 'public/assets-runtime/manifest.json'), 'utf8'), family);
  assert.equal(FROZEN_YARD_DELIVERY_RAW_BYTES, 192_653_433);
  assert.equal(DEFAULT_BUILD_BUDGETS.publicAssetsTotalRawBytes, 267_653_433);
  assert.equal(DEFAULT_BUILD_BUDGETS.publicMediaTotalRawBytes, 455_653_433);
  assert.equal(DEFAULT_BUILD_BUDGETS.nonFamilyPublicAssetsTotalRawBytes, 75_000_000);
  assert.equal(DEFAULT_BUILD_BUDGETS.nonFamilyPublicMediaTotalRawBytes, 263_000_000);
  assert.deepEqual({ ...FAMILY_ATLAS_POLICY }, { id: 'yard-family-atlas/candidate-r1', maxPages: 16, maxDecodedBytes: 64 * 1024 * 1024, maxConcurrentDecodes: 1 });
  assert.deepEqual(Object.fromEntries(Object.entries(DEFAULT_BUILD_BUDGETS).filter(([key]) => !key.startsWith('public') && !key.startsWith('nonFamily'))), {
    initialScriptRawBytes: 575_000, initialScriptGzipBytes: 190_000, initialCssRawBytes: 95_000, initialCssGzipBytes: 20_000,
    asyncPixiRawBytes: 660_000, maxGameChunkRawBytes: 75_000, runtimeManifestRawBytes: 40_000, runtimeManifestGzipBytes: 5_000,
    runtimeAssetsTotalRawBytes: 12_000_000, runtimeAssetMaxRawBytes: 2_500_000,
  });
});

test('build guard rejects unreviewed family bytes and keeps unrelated growth under the old ceilings', async t => {
  const temp = await mkdtemp(resolve(os.tmpdir(), 'yard-budget-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await write(temp, 'index.html', '<script type="module" src="/assets/app.js"></script>');
  await write(temp, 'assets/app.js', 'console.log("shell");');
  await write(temp, 'assets/unrelated.bin', 'x'.repeat(101));
  let report = await analyzeDist({ distDir: temp, budgets: { nonFamilyPublicAssetsTotalRawBytes: 100, nonFamilyPublicMediaTotalRawBytes: 100 } });
  assert.ok(report.failures.some(f => f.id === 'public-assets.non-family.raw'));
  assert.ok(report.failures.some(f => f.id === 'public-media.non-family.raw'));
  assert.equal(report.failures.some(f => f.id === 'public-assets.total.raw'), false, 'new family allowance cannot fund unrelated content');
  assert.equal(report.failures.some(f => f.id === 'public-media.total.raw'), false);
  await write(temp, 'assets/yard-fox/unknown.webp', 'x');
  report = await analyzeDist({ distDir: temp });
  assert.ok(report.failures.some(f => f.id === 'public-assets.frozen-yard-exact'));
  assert.equal(report.metrics.frozenYard.rawBytes, 0);
  const map = await readYardPublicMediaMap(root), row = map.files[0];
  await write(temp, row.path, Buffer.alloc(row.bytes));
  report = await analyzeDist({ distDir: temp });
  assert.ok(report.failures.find(f => f.id === 'public-assets.frozen-yard-exact').actual.invalid.includes(row.path));
  assert.equal(report.metrics.frozenYard.rawBytes, 0, 'right path and size with wrong hash earns no allowance');
});
