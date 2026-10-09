import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { YARD_RENDERER_MODULES, YARD_RUNTIME_CORE_MODULES, yardRendererChunk } from '../scripts/yard-renderer-chunk.mjs';
import { YARD_CONTRACT_DATA_MODULES } from '../scripts/yard-contract-data.mjs';
import { gameLoadingGraph } from '../scripts/game-loading-graph.mjs';
import { summarizeEmittedChunks } from '../scripts/summarize-emitted-chunks.mjs';
import { DEFAULT_BUILD_BUDGETS, analyzeDist } from '../scripts/perf-build-guard.mjs';
const root = path.resolve(import.meta.dirname, '..');

test('clean owner and canonical projection remain separate executable modules with the unchanged cap', async () => {
  assert.deepEqual([...YARD_RENDERER_MODULES].sort(), ['canonical-presentation.mjs','presentation-clock.mjs','scene-owner.mjs'].map(name=>'src/games/companion-yard-v2/'+name).sort());
  for (const source of YARD_RENDERER_MODULES) {
    assert.equal(yardRendererChunk(path.join(root, source), root), 'yard-clean-core');
    assert.equal(YARD_CONTRACT_DATA_MODULES.has(source), false);
    const text=await readFile(path.join(root,source),'utf8');
    assert.doesNotMatch(text, /from ['"][^'"]*(?:CourtyardGame|CompanionYardGame|legacy-m2-background|actor-media|render-pack|\/scene\.mjs)['"]/);
  }
  for (const name of ['decoded-capacity.mjs','runtime-cells.mjs','ui-image-reserve.mjs']) assert.equal(yardRendererChunk(path.join(root,'src/games/companion-yard-v2',name),root),'yard-scene-resources');
  assert.equal(yardRendererChunk(path.join(root,'src/games/companion-yard-v2/CourtyardGame.jsx'),root),undefined);
  assert.equal(DEFAULT_BUILD_BUDGETS.maxGameChunkRawBytes,75_000);
});

test('renderer and shared server planning helpers remain budgeted executable gameplay chunks', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'yard-code-budget-')); t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(path.join(temp, 'assets')); await writeFile(path.join(temp, 'index.html'), '<script type="module" src="/assets/app.js"></script>');
  const modules = ['src/games/companion-yard-v2/canonical-presentation.mjs', 'game-logic/yard-v2/mika-media.mjs'];
  const bundle = { app: { type: 'chunk', fileName: 'assets/app.js', isEntry: true, imports: [], dynamicImports: ['assets/renderer.js', 'assets/planner.js'], modules: {} } };
  for (let i = 0; i < modules.length; i++) bundle[i] = { type: 'chunk', fileName: i ? 'assets/planner.js' : 'assets/renderer.js', isEntry: false, imports: [], dynamicImports: [], modules: { [path.join(root, modules[i])]: { renderedLength: 75_001 } } };
  const plugin = gameLoadingGraph(); plugin.configResolved({ root });
  let graph; plugin.generateBundle.call({ emitFile(asset) { graph = JSON.parse(asset.source); } }, {}, bundle);
  for (const chunk of graph.chunks) { await writeFile(path.join(temp, chunk.file), 'x'.repeat(chunk.isEntry ? 1 : 75_001)); if (!chunk.isEntry) { assert.equal(chunk.dataOnly, false); assert.equal(chunk.gameModules.length, 1); } }
  await writeFile(path.join(temp, 'game-loading-graph.json'), JSON.stringify(graph));
  const report = await analyzeDist({ distDir: temp });
  assert.equal(report.metrics.gameChunks.count, 2);
  assert.ok(report.failures.some(f => f.id === 'games.max-chunk.raw'));
});

test('small diagnostics preserve emitted code sizes and tolerate failed/no-output builds', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'yard-chunk-summary-')); t.after(() => rm(temp, { recursive: true, force: true }));
  assert.equal((await summarizeEmittedChunks(temp)).status, 'no-emitted-code-output');
  await mkdir(path.join(temp, 'dist/assets/yard-data'), { recursive: true });
  await writeFile(path.join(temp, 'dist/assets/CourtyardGame.js'), 'x'.repeat(100_319));
  await writeFile(path.join(temp, 'dist/assets/yard-data/data.js'), 'x'.repeat(20));
  await writeFile(path.join(temp, 'dist/assets/pixels.webp'), 'not included');
  const report = await summarizeEmittedChunks(temp);
  assert.equal(report.truncated, false); assert.equal(report.chunks.length, 2); assert.equal(report.chunks[0].rawBytes, 100_319);
  assert.ok((await readFile(path.join(temp, 'artifacts/perf/emitted-chunks.json'))).length < 1_000);
});


test('the observed real cycle has every shared runtime module assigned to a separate owner', async () => {
  const observed = JSON.parse(await readFile(path.join(root, 'tests/fixtures/yard-observed-build-cycle.json'), 'utf8'));
  const entry = observed.chunks.find(chunk => chunk.file === observed.entry);
  const renderer = observed.chunks.find(chunk => chunk.file !== observed.entry);
  assert.equal(entry.rawBytes, 66_182); assert.equal(renderer.rawBytes, 34_618);
  assert.ok(renderer.imports.includes(entry.file)); assert.ok(entry.imports.includes(renderer.file));
  const runtime = entry.modules.filter(source => source.startsWith('game-logic/yard-v2/') && source.endsWith('.mjs'));
  assert.equal(runtime.length, 25);
  for (const source of runtime) assert.equal(yardRendererChunk(path.join(root, source), root), source.endsWith('/sha256.mjs') ? 'yard-wire-hash' : 'yard-runtime-core', source);
  assert.equal(yardRendererChunk(path.join(root, 'src/games/companion-yard-v2/CourtyardGame.jsx'), root), undefined);
  assert.equal(yardRendererChunk(path.join(root, 'game-logic/yard-v2/family-media-source.mjs'), root), undefined, 'conditional family source must not become an eager core dependency');
});

test('retained shared runtime classification stays executable with only the pure receipt hash at boot', async () => {
  const core=[...YARD_RUNTIME_CORE_MODULES];
  const hash = 'game-logic/yard-v2/sha256.mjs';
  const runtime=[...core,hash];
  assert.equal(core.length,27);
  assert.equal(yardRendererChunk(path.join(root, hash), root), 'yard-wire-hash');
  assert.doesNotMatch(await readFile(path.join(root, hash), 'utf8'), /^\s*import\b/m, 'Boot hash must not pull the lazy runtime back in');
  for (const source of runtime) assert.equal(YARD_CONTRACT_DATA_MODULES.has(source), false);
  const plugin = gameLoadingGraph(); plugin.configResolved({ root });
  let graph; plugin.generateBundle.call({ emitFile(asset) { graph = JSON.parse(asset.source); } }, {}, {
    core: { type: 'chunk', fileName: 'assets/yard-runtime-core.js', isEntry: false, imports: ['assets/yard-wire-hash.js'], dynamicImports: [], modules: Object.fromEntries(core.map(source => [path.join(root, source), { renderedLength: 1 }])) },
    hash: { type: 'chunk', fileName: 'assets/yard-wire-hash.js', isEntry: false, imports: [], dynamicImports: [], modules: { [path.join(root, hash)]: { renderedLength: 1 } } },
  });
  assert.equal(graph.chunks[0].dataOnly, false); assert.equal(graph.chunks[0].gameModules.length, 27);
  assert.equal(graph.chunks[1].dataOnly, false); assert.deepEqual(graph.chunks[1].gameModules, [hash]);
  assert.equal(DEFAULT_BUILD_BUDGETS.maxGameChunkRawBytes, 75_000);
});
