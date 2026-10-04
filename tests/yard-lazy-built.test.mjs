/** Post-Vite proof: inspect actual emitted chunks, graph, HTML and service worker. */
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { YARD_CONTRACT_DATA_MODULES, YARD_DATA_OUTPUT_PREFIX } from '../scripts/yard-contract-data.mjs';
import { YARD_RENDERER_MODULES } from '../scripts/yard-renderer-chunk.mjs';
import { DEFAULT_BUILD_BUDGETS } from '../scripts/perf-build-guard.mjs';

const root = path.resolve(import.meta.dirname, '..');
test('actual Vite Yard metadata stays out of startup/precache and executable chunks retain the 75 KB cap', async () => {
  const dist = path.join(root, 'dist');
  const graph = JSON.parse(await readFile(path.join(dist, 'game-loading-graph.json'), 'utf8'));
  const chunks = new Map(graph.chunks.map(chunk => [chunk.file, chunk]));
  const closure = (seeds, dynamic = false) => {
    const seen = new Set();
    const visit = file => { if (seen.has(file)) return; const chunk = chunks.get(file); assert.ok(chunk, file); seen.add(file);
      for (const next of [...chunk.imports, ...(dynamic && !chunk.isEntry ? chunk.dynamicImports : [])]) visit(next); };
    seeds.forEach(visit); return seen;
  };
  const startup = closure(graph.chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.file));
  assert.ok(graph.entries['companion-yard-v2']); assert.ok(graph.entries['yard-player-entry']);
  const yard = closure([graph.entries['companion-yard-v2']], true);
  const data = graph.chunks.filter(chunk => chunk.file.startsWith(YARD_DATA_OUTPUT_PREFIX));
  assert.ok(data.length > 0, 'immutable data must be separately reported, not embedded in executable chunks');
  const renderer = graph.chunks.find(chunk => chunk.modules.includes('src/games/companion-yard-v2/scene.mjs'));
  assert.ok(renderer && renderer.file !== graph.entries['companion-yard-v2'], 'canvas renderer must have its own executable boundary');
  assert.equal(renderer.dataOnly, false); assert.equal(startup.has(renderer.file), false);
  assert.equal(closure([renderer.file]).has(graph.entries['companion-yard-v2']), false, 'renderer must not form a static cycle back into its React entry');
  assert.ok(renderer.modules.every(id => YARD_RENDERER_MODULES.has(id)), 'manual renderer chunk must not absorb other dependencies');
  assert.ok(renderer.gameModules.length > 0);
  const report = { data: [], gameCode: [], startupYardData: [] };
  for (const chunk of data) {
    assert.equal(startup.has(chunk.file), false, chunk.file); assert.ok(yard.has(chunk.file), chunk.file);
    assert.equal(chunk.dataOnly, true); assert.equal(chunk.gameModules.length, 0);
    assert.equal(chunk.renderedModuleCount, chunk.modules.length);
    assert.ok(chunk.modules.length > 0 && chunk.modules.every(id => YARD_CONTRACT_DATA_MODULES.has(id)));
    assert.deepEqual(chunk.imports, []); assert.deepEqual(chunk.dynamicImports, []); assert.deepEqual(chunk.css, []);
    const bytes = await readFile(path.join(dist, chunk.file));
    report.data.push({ file: chunk.file, modules: chunk.modules, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length });
  }
  for (const chunk of graph.chunks.filter(chunk => chunk.gameModules.some(id => id.startsWith('src/games/companion-yard-v2/') || id.startsWith('game-logic/yard-v2/')))) {
    assert.equal(chunk.dataOnly, false, chunk.file);
    const rawBytes = (await stat(path.join(dist, chunk.file))).size;
    assert.ok(rawBytes <= DEFAULT_BUILD_BUDGETS.maxGameChunkRawBytes, `${chunk.file}: ${rawBytes} > 75000 executable bytes`);
    report.gameCode.push({ file: chunk.file, rawBytes, modules: chunk.gameModules });
  }
  assert.ok(report.gameCode.length > 0);
  for (const name of ['index.html', 'sw.js']) {
    const source = await readFile(path.join(dist, name), 'utf8');
    for (const chunk of data) assert.equal(source.includes(chunk.file), false, `${name} must not warm ${chunk.file}`);
  }
  report.dataRawBytes = report.data.reduce((sum, row) => sum + row.rawBytes, 0);
  report.dataGzipBytes = report.data.reduce((sum, row) => sum + row.gzipBytes, 0);
  const out = path.join(root, 'artifacts/perf'); await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'yard-lazy-build-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('YARD_LAZY_BUILD', JSON.stringify(report));
});
