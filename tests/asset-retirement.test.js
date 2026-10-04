import { readSplitGameSource } from './helpers/splitGameSources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isRetiredAssetPath, MATCH3_SEMANTIC_FILES } from '../scripts/asset-retirement-policy.mjs';
import { loadAssetPipelineEntries } from '../scripts/assets-pipeline.config.mjs';
import { LEGACY_ASSET_PATHS, GAME_ASSET_BUNDLES, runtimeAssetSources } from '../src/game-runtime/assetBundles.js';
import { analyzeDist } from '../scripts/perf-build-guard.mjs';
import { createHash } from 'node:crypto';
import { SOURCE_ONLY_PUBLIC_ASSETS, RETIRED_UNUSED_PUBLIC_FILES, sourceOnlyAssetDestination, isObsoleteImportedAssetPath } from '../scripts/asset-source-only-policy.mjs';
import { assertNoRetiredPublicAssets, retiredPublicAssets } from '../scripts/retired-public-assets.mjs';

async function files(root, prefix = '') {
  const result = [];
  for (const item of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const file = path.posix.join(prefix, item.name);
    if (item.isDirectory()) result.push(...await files(root, file));
    else result.push(file);
  }
  return result;
}

test('retired public paths stay closed and production source has no retired URLs', async () => {
  assert.deepEqual((await files('public')).filter(isRetiredAssetPath), []);
  for (const file of await files('src')) {
    if (!/\.(?:js|jsx|ts|tsx|css)$/.test(file)) continue;
    const source = await fs.readFile(path.join('src', file), 'utf8');
    for (const [, url] of source.matchAll(/["'`](\/(?:games|assets-runtime)\/[^"'`\s]+)["'`]/g)) {
      assert.equal(isRetiredAssetPath(url), false, `${file}: ${url}`);
    }
  }
  const entries = await loadAssetPipelineEntries();
  assert.equal(entries.filter(entry => entry.key.startsWith('match3.')).length, 8);
  assert.ok(entries.some(entry => entry.key === 'gardenShelf.sheet.transparent'));
  assert.ok(entries.some(entry => entry.key.startsWith('gachaMerge.items.')));
  assert.ok(entries.some(entry => entry.key.startsWith('companionYard.')));
  assert.equal(entries.some(entry => /^(?:blox|bubbo|farm)\./.test(entry.key)), false);
  const manifest = JSON.parse(await fs.readFile('public/assets-runtime/manifest.json', 'utf8'));
  for (const key of Object.keys(manifest.assets)) {
    assert.equal(/^(?:blox|bubbo|farm)\./.test(key), false);
    for (const url of runtimeAssetSources(manifest, key)) {
      assert.equal(isRetiredAssetPath(url), false, key);
      await fs.access(path.join('public', url.slice(1)));
    }
  }
});

test('current renderers and real legacy fallbacks retain their asset closure', async () => {
  for (const file of MATCH3_SEMANTIC_FILES) await fs.access(`public/games/puzzling-potions/images/${file}`);
  assert.equal(GAME_ASSET_BUNDLES.match3.length, 8);
  for (const url of Object.values(LEGACY_ASSET_PATHS)) await fs.access(path.join('public', url.slice(1)));
  for (const file of ['public/games/bubbo-bubbo/LICENSE', 'public/games/puzzling-potions/LICENSE', 'src/games/merge/LegacyMergeGame.jsx', 'src/games/companion-yard/CompanionYardGame.jsx']) await fs.access(file);
  for (const dir of ['companion-yard', 'gacha-merge/items', 'settlement']) assert.ok((await files(`public/games/${dir}`)).length > 0);
  for (const pet of ['mika', 'mochi', 'pebble', 'pip']) assert.ok((await files(`public/assets/yard-${pet}`)).length > 0);
  const loaders = await fs.readFile('src/game-runtime/LazyPixiSceneHost.jsx', 'utf8');
  assert.doesNotMatch(loaders, /farmScene|bubboScene/);
  assert.match(loaders, /mergeScene/);
  const bubbo = await fs.readFile('src/games/bubbo/BubboField.jsx', 'utf8');
  assert.match(bubbo, /getContext\(["']2d["']/);
  const garden = readSplitGameSource('src/games/garden-shelf/GardenPresentation.tsx');
  assert.match(garden, /function LegacyPlantArt/);
  assert.match(garden, /GARDEN_SHEET_PATH/);
  const docker = await fs.readFile('Dockerfile', 'utf8');
  assert.match(docker, /COPY --from=build \/app\/dist\//);
  assert.doesNotMatch(docker, /COPY.*\/app\/public/);
  const server = await fs.readFile('server.js', 'utf8');
  assert.match(server, /express\.static\(path\.join\(__dirname, "dist"\)/);
  const backend = await fs.readFile('routes/player.js', 'utf8');
  assert.match(backend, /function getFarmStats/);
});

test('build guard counts direct-copy public media and rejects retired files even under budgets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccgh-retirement-'));
  const write = async (file, content) => { await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true }); await fs.writeFile(path.join(dir, file), content); };
  try {
    await write('index.html', '<html></html>');
    await write('assets-runtime/manifest.json', JSON.stringify({ assets: { 'match3.special.row': '/assets-runtime/puzzling-potions/row.1234abcd.webp' } }));
    await write('assets-runtime/puzzling-potions/row.1234abcd.webp', '1234');
    await write('games/blox-v2/frame.webp', '12345');
    await write('assets/yard-mika/actor.webp', '123456');
    let report = await analyzeDist({ distDir: dir, budgets: { publicGamesTotalRawBytes: 4, publicAssetsTotalRawBytes: 5, publicMediaTotalRawBytes: 14 } });
    assert.equal(report.metrics.publicGames.rawBytes, 5);
    assert.equal(report.metrics.publicAssets.rawBytes, 6);
    assert.equal(report.metrics.publicMedia.rawBytes, 15);
    for (const id of ['public-games.total.raw', 'public-assets.total.raw', 'public-media.total.raw']) assert.ok(report.failures.some(f => f.id === id), id);
    await write('games/blox/cell_empty.png', 'old');
    report = await analyzeDist({ distDir: dir });
    assert.ok(report.failures.some(f => f.id === 'public-assets.retired-paths'));
    await write('assets/current.js', 'const path = "/games/blox/cell_empty.png";');
    await write('assets/current.css', '.old { background: url(/games/trivia/panel-menu.png); }');
    report = await analyzeDist({ distDir: dir });
    assert.equal(report.failures.find(f => f.id === 'public-assets.retired-references').actual.length, 2);
    for (const file of ['games/bubbo-bubbo/LICENSE', 'games/garden-shelf/assets_transparent.png', 'games/garden-shelf/quest_panel.png', ...MATCH3_SEMANTIC_FILES.map(file => `games/puzzling-potions/images/${file}`)]) assert.equal(isRetiredAssetPath(file), false, file);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('unused upstream imports are removed and required source-only exports keep their exact image bytes', async () => {
  const inventory = JSON.parse(await fs.readFile('docs/unused-legacy-assets-inventory.json', 'utf8'));
  const deleted = inventory.files.filter(row => row.action === 'delete-unused');
  const moved = inventory.files.filter(row => row.action === 'move-source-only');
  assert.equal(deleted.length, inventory.deletedFiles);
  assert.equal(deleted.reduce((sum, row) => sum + row.bytes, 0), inventory.deletedBytes);
  assert.equal(moved.length, inventory.sourceOnlyMoves);
  for (const row of inventory.files) {
    await assert.rejects(fs.access(row.path), { code: 'ENOENT' }, row.path);
    if (row.action !== 'move-source-only') continue;
    assert.equal(SOURCE_ONLY_PUBLIC_ASSETS[row.path], row.to);
    const bytes = await fs.readFile(row.to);
    // Extraction manifests receive destination metadata; image bytes do not change.
    if (/\.(?:png|svg)$/.test(row.path)) {
      assert.equal(bytes.length, row.bytes, row.to);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, row.to);
    }
  }
  assert.deepEqual((await files('assets-source')).map(file => `assets-source/${file}`).filter(isObsoleteImportedAssetPath), []);
  for (const { source } of await loadAssetPipelineEntries()) await fs.access(source);
  // All frozen delivery inputs stay available; this is independent of rollout state.
  const frozen = JSON.parse(await fs.readFile('scripts/yard-public-media.json', 'utf8'));
  for (const row of frozen.files) await fs.access(`recovery-tools/yard-family-frozen/${row.path}`);
});

test('current source, manual manifest, and preload entry do not call source-only or deleted public art', async () => {
  const sourceFiles = ['index.html', 'server.js', 'vite.config.js', 'public/assets/manifest.json'];
  for (const root of ['src', 'game-logic', 'routes']) {
    for (const file of await files(root)) if (/\.(?:js|jsx|ts|tsx|mjs|css|json)$/.test(file)) sourceFiles.push(`${root}/${file}`);
  }
  const retiredUrls = [...Object.keys(SOURCE_ONLY_PUBLIC_ASSETS), ...RETIRED_UNUSED_PUBLIC_FILES].map(file => file.slice('public'.length));
  for (const file of sourceFiles) {
    const content = await fs.readFile(file, 'utf8');
    for (const url of retiredUrls) assert.equal(content.includes(url), false, `${file} still references ${url}`);
  }
});

test('normal Vite build and dist guard reject stale source-only exports before shipping', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccgh-source-only-'));
  const stale = 'games/hud-redesign/blox/tool-slot.png';
  try {
    await fs.mkdir(path.join(dir, path.dirname(stale)), { recursive: true });
    await fs.writeFile(path.join(dir, stale), 'old source-only output');
    await assert.rejects(assertNoRetiredPublicAssets(dir), /Retired\/source-only assets/);
    await assert.rejects(retiredPublicAssets().configResolved({ publicDir: dir }), /tool-slot\.png/);
    await fs.writeFile(path.join(dir, 'index.html'), '<html></html>');
    const report = await analyzeDist({ distDir: dir });
    assert.ok(report.failures.find(row => row.id === 'public-assets.retired-paths')?.actual.includes(stale));
    await fs.rm(path.join(dir, stale));
    assert.deepEqual(await assertNoRetiredPublicAssets(dir), { checked: true, retired: 0 });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
  assert.equal(sourceOnlyAssetDestination('/games/hud-redesign/blox/tool-slot.png?v=old'), SOURCE_ONLY_PUBLIC_ASSETS[`public/${stale}`]);
  const config = await fs.readFile('vite.config.js', 'utf8');
  assert.match(config, /retiredPublicAssets\(\)/);
  const ignore = await fs.readFile('.dockerignore', 'utf8');
  assert.match(ignore, /^assets-source\/\*$/m);
  await assertNoRetiredPublicAssets('public');
});

test('HUD generator routes source-only QA exports and metadata outside public', async () => {
  const generator = await fs.readFile('scripts/generate-hud-redesign-pack.mjs', 'utf8');
  assert.match(generator, /sourceOnlyAssetDestination\(path\.relative\(root, publicPath\)\)/);
  for (const name of ['screen-surface-extract-manifest.json', 'portrait-panel-extract-manifest.json']) {
    assert.ok(generator.includes(`path.join(sourceRoot, "${name}")`));
    const manifest = JSON.parse(await fs.readFile(`assets-source/imagegen/hud-redesign/${name}`, 'utf8'));
    for (const row of manifest.outputs) {
      assert.equal(row.path.startsWith('public/'), row.runtime);
      await fs.access(row.path);
    }
  }
  const manifest = JSON.parse(await fs.readFile('assets-source/imagegen/hud-redesign/hud-redesign-manifest.json', 'utf8'));
  for (const game of Object.values(manifest.games)) for (const asset of game.assets) {
    assert.equal(asset.runtimePath.startsWith('public/'), asset.runtime !== false);
    await fs.access(asset.sourcePath);
    await fs.access(asset.runtimePath);
  }
});

test('five unreachable entry HUD skins are archived byte-exactly and absent from current source and output metadata', async () => {
  const inventory = JSON.parse(await fs.readFile('docs/entry-hud-retirement-inventory.json', 'utf8'));
  const proof = JSON.parse(await fs.readFile('tests/fixtures/shared-hud-webp-proof.json', 'utf8'));
  assert.equal(inventory.files.length, 5);
  assert.equal(inventory.removedFromPublicBytes, 371894);
  assert.deepEqual(proof.files.filter(asset => sourceOnlyAssetDestination(asset.runtimePath)).map(asset => asset.runtimePath).sort(), inventory.files.map(row => row.path).sort());
  const hud = await fs.readFile('src/app/hud-redesign.css', 'utf8');
  const yard = await fs.readFile('src/games/companion-yard/companion-yard.css', 'utf8');
  const manifest = JSON.parse(await fs.readFile('assets-source/imagegen/hud-redesign/hud-redesign-manifest.json', 'utf8'));
  const surfaces = JSON.parse(await fs.readFile('assets-source/imagegen/hud-redesign/screen-surface-extract-manifest.json', 'utf8'));
  for (const row of inventory.files) {
    const original = proof.files.find(asset => asset.runtimePath === row.path);
    assert.ok(original, row.path); assert.equal(sourceOnlyAssetDestination(row.path), row.to);
    assert.equal(isRetiredAssetPath(row.path), true);
    await assert.rejects(fs.access(row.path), { code: 'ENOENT' });
    const bytes = await fs.readFile(row.to);
    assert.equal(bytes.length, original.runtimeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), original.runtimeSha256);
    assert.equal(hud.includes(row.path.slice('public'.length)), false);
    assert.equal(yard.includes(row.path.slice('public'.length)), false);
  }
  for (const id of ['blox','bubbo','match3','merge']) {
    const row = manifest.games[id].assets.find(asset => asset.id === 'metric-chip');
    assert.equal(row.runtime, false); assert.equal(row.runtimePath, sourceOnlyAssetDestination(`public/games/hud-redesign/${id}/metric-chip.webp`));
  }
  const panel = surfaces.outputs.find(row => row.name === 'yard-panel');
  assert.equal(panel.runtime, false); assert.equal(panel.path, sourceOnlyAssetDestination('public/games/ui-surfaces/yard-panel.webp'));
  // Every supported Yard dialog provides an owned screen skin; no generic
  // fallback is needed, including when the HUD editor changes geometry.
  for (const id of ['food','goodies','shop','petbook','album','gifts','settings','repair','remodel','expansion','daily','companion']) {
    assert.ok(yard.includes(`.yard-game-screen[data-yard-screen="${id}"] { --yard-screen-panel-art:`), id);
  }
  assert.doesNotMatch(yard, /--yard-generated-dialog-art/);
});
