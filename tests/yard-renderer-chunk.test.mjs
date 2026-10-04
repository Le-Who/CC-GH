import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { YARD_RENDERER_MODULES, yardRendererChunk } from '../scripts/yard-renderer-chunk.mjs';
import { YARD_CONTRACT_DATA_MODULES } from '../scripts/yard-contract-data.mjs';
import { gameLoadingGraph } from '../scripts/game-loading-graph.mjs';
import { summarizeEmittedChunks } from '../scripts/summarize-emitted-chunks.mjs';
import { DEFAULT_BUILD_BUDGETS, analyzeDist } from '../scripts/perf-build-guard.mjs';
const root = path.resolve(import.meta.dirname, '..');

test('the renderer boundary contains exactly the ten existing static browser modules', async () => {
  const visited = new Set();
  async function visit(source) {
    if (visited.has(source)) return; visited.add(source);
    const text = await readFile(path.join(root, source), 'utf8');
    for (const match of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)) {
      const ref = match[1] || match[2]; if (!ref.startsWith('.')) continue;
      const local = path.posix.normalize(path.posix.join(path.posix.dirname(source), ref));
      if (local.startsWith('src/games/companion-yard-v2/') && local.endsWith('.mjs')) await visit(local);
    }
  }
  await visit('src/games/companion-yard-v2/scene.mjs');
  assert.deepEqual([...YARD_RENDERER_MODULES].sort(), [...visited].sort());
  assert.equal(visited.size, 10);
  for (const source of visited) { assert.equal(yardRendererChunk(path.join(root, source), root), 'yard-renderer'); assert.equal(YARD_CONTRACT_DATA_MODULES.has(source), false); }
  for (const source of ['CourtyardGame.jsx', 'family-actor-media.mjs', 'mochi-actor-media.mjs']) assert.equal(yardRendererChunk(path.join(root, 'src/games/companion-yard-v2', source), root), undefined);
  assert.equal(DEFAULT_BUILD_BUDGETS.maxGameChunkRawBytes, 75_000);
});

test('renderer and shared server planning helpers remain budgeted executable gameplay chunks', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'yard-code-budget-')); t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(path.join(temp, 'assets')); await writeFile(path.join(temp, 'index.html'), '<script type="module" src="/assets/app.js"></script>');
  const modules = ['src/games/companion-yard-v2/scene.mjs', 'game-logic/yard-v2/mika-media.mjs'];
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
