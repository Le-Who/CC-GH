import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { YARD_CONTRACT_DATA_MODULES, yardContractChunk, yardChunkFileNames, yardContractData } from '../scripts/yard-contract-data.mjs';
import { gameLoadingGraph } from '../scripts/game-loading-graph.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = [...YARD_CONTRACT_DATA_MODULES][0];
function fixture({ eager = false, mixed = false, wrongPath = false } = {}) {
  const data = wrongPath ? 'assets/family-actor-media.js' : 'assets/yard-data/yard-data-clip-contracts-hash.js';
  return {
    'assets/app.js': { type: 'chunk', fileName: 'assets/app.js', isEntry: true, imports: eager ? [data] : [], dynamicImports: ['assets/CourtyardGame.js'], modules: {} },
    'assets/CourtyardGame.js': { type: 'chunk', fileName: 'assets/CourtyardGame.js', imports: [data], dynamicImports: [], modules: { [path.join(root, 'src/games/companion-yard-v2/CourtyardGame.jsx')]: { renderedLength: 100 } } },
    [data]: { type: 'chunk', fileName: data, imports: [], dynamicImports: [], modules: { [path.join(root, source)]: { renderedLength: 100 }, ...(mixed ? { [path.join(root, 'game-logic/yard-v2/family-media-source.mjs')]: { renderedLength: 100 } } : {}) } },
  };
}
function plugin() { const plugin = yardContractData(); plugin.configResolved({ root }); return plugin; }

test('only the exact 29 frozen JSON contracts are data-only; original bytes remain pinned', async () => {
  assert.equal(YARD_CONTRACT_DATA_MODULES.size, 29);
  for (const id of YARD_CONTRACT_DATA_MODULES) assert.ok(id.endsWith('.json'));
  await plugin().buildStart();
  assert.equal(yardContractChunk(path.join(root, 'game-logic/yard-v2/family-media-source.mjs'), root), undefined);
  assert.equal(yardContractChunk(path.join(root, 'src/games/companion-yard-v2/scene.mjs'), root), undefined);
  assert.equal(yardContractChunk(path.join(root, 'game-logic/yard-v2/media/unreviewed.json'), root), undefined);
  assert.match(yardContractChunk(path.join(root, source), root), /^yard-data-/);
});

test('nested data chunks are excluded by the real Workbox glob BEFORE its unchanged size limit', async () => {
  const config = await readFile(path.join(root, 'vite.config.js'), 'utf8');
  const block = config.match(/globPatterns:\s*\[([\s\S]*?)\]/)[1];
  const patterns = [...block.matchAll(/"([^"]+)"/g)].map(row => row[1]);
  assert.equal(patterns.length, 1);
  for (const id of YARD_CONTRACT_DATA_MODULES) {
    const name = yardContractChunk(path.join(root, id), root);
    const out = yardChunkFileNames({ name }).replace('[name]', name).replace('[hash]', 'fixture');
    assert.equal(patterns.some(pattern => path.matchesGlob(out, pattern)), false);
  }
  assert.doesNotMatch(config, /maximumFileSizeToCacheInBytes/);
  assert.equal(yardChunkFileNames({ name: 'CourtyardGame' }), 'assets/[name]-[hash].js');
});

test('real Rollup module metadata rejects mixed executable data chunks and static shell reachability', () => {
  assert.doesNotThrow(() => plugin().generateBundle({}, fixture()));
  assert.throws(() => plugin().generateBundle({}, fixture({ eager: true })), /startup shell/);
  assert.throws(() => plugin().generateBundle({}, fixture({ mixed: true })), /mixed into executable|Executable code/);
  assert.throws(() => plugin().generateBundle({}, fixture({ wrongPath: true })), /mixed into executable/);
  const mixed = fixture(); mixed['assets/yard-data/yard-data-clip-contracts-hash.js'].imports.push('assets/CourtyardGame.js');
  assert.throws(() => plugin().generateBundle({}, mixed), /Executable code/);
  const withCss = fixture(); withCss['assets/yard-data/yard-data-clip-contracts-hash.js'].viteMetadata = { importedCss: new Set(['assets/game.css']) };
  assert.throws(() => plugin().generateBundle({}, withCss), /Executable code/);
});

test('loading graph reports JSON separately but never exempts a mixed server implementation', () => {
  const graphPlugin = gameLoadingGraph(); graphPlugin.configResolved({ root });
  let graph; const emit = { emitFile(asset) { graph = JSON.parse(asset.source); } };
  graphPlugin.generateBundle.call(emit, {}, fixture());
  assert.equal(graph.chunks.find(c => c.file.includes('yard-data')).dataOnly, true);
  assert.equal(graph.chunks.find(c => c.file.includes('CourtyardGame')).dataOnly, false);
  graphPlugin.generateBundle.call(emit, {}, fixture({ mixed: true }));
  assert.equal(graph.chunks.find(c => c.file.includes('yard-data')).dataOnly, false);
});


test('vendor or virtual runtime code never receives the immutable JSON exemption', () => {
  for (const extra of [path.join(root, 'node_modules/helper/index.js'), '\0virtual:executable']) {
    const bundle = fixture();
    bundle['assets/yard-data/yard-data-clip-contracts-hash.js'].modules[extra] = { renderedLength: 10 };
    assert.throws(() => plugin().generateBundle({}, bundle), /mixed into executable|Executable code/);
    const graphPlugin = gameLoadingGraph(); graphPlugin.configResolved({ root });
    let graph; graphPlugin.generateBundle.call({ emitFile(asset) { graph = JSON.parse(asset.source); } }, {}, bundle);
    assert.equal(graph.chunks.find(c => c.file.includes('yard-data')).dataOnly, false);
  }
});
