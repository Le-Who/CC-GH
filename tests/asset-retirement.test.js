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
