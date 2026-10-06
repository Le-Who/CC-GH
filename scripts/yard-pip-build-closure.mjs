/** Offline evidence for an actual normal Vite output. Never starts a server. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const [output = 'dist', mode = 'off', reportFile = 'yard-pip-build-closure.json'] = process.argv.slice(2);
assert.ok(['off', 'preview'].includes(mode));
const dist = path.resolve(root, output), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async name => JSON.parse(await readFile(name, 'utf8'));
const graph = await readJson(path.join(dist, 'game-loading-graph.json'));
const byFile = new Map(graph.chunks.map(chunk => [chunk.file, chunk]));
const closure = (seeds, dynamic = false, alreadyLoaded = new Set()) => {
  const seen = new Set();
  function visit(file) {
    if (seen.has(file) || alreadyLoaded.has(file)) return;
    assert.ok(byFile.has(file), `Missing emitted import ${file}`); seen.add(file);
    const chunk = byFile.get(file);
    for (const dependency of [...chunk.imports, ...(dynamic && !chunk.isEntry ? [...chunk.dynamicImports,...(chunk.workerImports||[])] : [])]) visit(dependency);
  }
  seeds.forEach(visit); return seen;
};
for (const chunk of graph.chunks) for (const file of [...chunk.imports, ...chunk.dynamicImports,...(chunk.workerImports||[])]) assert.ok(byFile.has(file), `Broken import from ${chunk.file}: ${file}`);
const shell = closure(graph.chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.file));
const yard = closure([graph.entries['companion-yard-v2']]);
const prefix = 'src/games/companion-yard-v2/pip-prototype/';
const optionalChunks = graph.chunks.filter(chunk => chunk.modules.some(source => source.startsWith(prefix)));
assert.ok(optionalChunks.every(chunk => !shell.has(chunk.file) && !yard.has(chunk.file)), 'Optional code entered default/static loading');
assert.equal(optionalChunks.length > 0, mode === 'preview', 'Build gate did not remove or include optional code');
const renderer = graph.chunks.find(chunk => chunk.modules.includes('src/games/companion-yard-v2/scene.mjs'));
assert.ok(!closure([renderer.file]).has(graph.entries['companion-yard-v2']), 'Renderer imports its React owner');
const files = [];
async function walk(dir, relative = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), `Symlink in output: ${entry.name}`);
    const file = path.posix.join(relative, entry.name), absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(absolute, file);
    else { const bytes = await readFile(absolute); files.push({ path: file, bytes: bytes.length, sha256: hash(bytes) }); }
  }
}
await walk(dist); files.sort((a, b) => a.path.localeCompare(b.path));
const emitted = new Map(files.map(row => [row.path, row]));
const assets = [];
for (const name of ['data/fixture.json', 'data/location.json', 'data/calibration.json', 'source/pip-rest-coat.glsl', 'assets/clean-garden.png', 'assets/pip.glb', 'assets/planter-t2.glb', 'assets/leaf-pot-t2-preview.webp']) {
  const bytes = await readFile(path.join(root, prefix, name)), sha256 = hash(bytes);
  const matches = files.filter(row => row.sha256 === sha256);
  assert.equal(matches.length, mode === 'preview' ? 1 : 0, `Optional asset gate/identity: ${name}`);
  if (matches.length) assets.push({ source: prefix + name, ...matches[0] });
}
const inventory = await readJson(path.join(root, 'src/games/companion-yard-v2/ui-image-inventory.json'));
for (const row of inventory.rows) {
  const file = new URL(row.url, 'https://yard.invalid').pathname.slice(1);
  assert.equal(emitted.get(file)?.sha256, row.sha256, `UI resource is absent or changed: ${row.url}`);
}
const vendor = await readJson(path.join(dist, 'yard-pip-vendor-report.json'));
assert.equal(vendor.included, mode === 'preview');
const metric = async names => {
  const rows = [];
  for (const file of names) { const bytes = await readFile(path.join(dist, file)); rows.push({ file, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length }); }
  return { rawBytes: rows.reduce((n, row) => n + row.rawBytes, 0), gzipBytes: rows.reduce((n, row) => n + row.gzipBytes, 0), files: rows };
};
const optionalEntry = graph.chunks.find(chunk => chunk.modules.includes(prefix + 'yard-pip-scene.mjs'));
// Entering Pip does not re-run dynamic imports owned by the already loaded
// legacy renderer. Count only the new entry and its own still-unloaded closure.
const incremental = optionalEntry ? [...closure([optionalEntry.file], true, yard)] : [];
const serviceWorker = await readFile(path.join(dist, 'sw.js'), 'utf8');
for (const chunk of optionalChunks) assert.ok(!serviceWorker.includes(chunk.file), 'Optional code is service-worker precached');
for (const row of assets) assert.ok(!serviceWorker.includes(row.path), 'Optional asset is service-worker precached');
const report = { mode, complete: true, output, emittedFiles: files.length, emittedBytes: files.reduce((n, row) => n + row.bytes, 0),
  startup: await metric([...shell]), staticYard: await metric([...yard]), incrementalPip: await metric(incremental),
  optionalAssets: assets, optionalAssetBytes: assets.reduce((n, row) => n + row.bytes, 0), uiRowsVerified: inventory.rows.length,
  optionalModuleCount: optionalChunks.reduce((n, chunk) => n + chunk.modules.filter(source => source.startsWith(prefix)).length, 0),
  vendor, files, qualification: 'Actual emitted bytes and import/URL closure; not browser network, pixel or hardware performance evidence' };
await writeFile(path.resolve(root, reportFile), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ mode, complete: report.complete, emittedFiles: report.emittedFiles, emittedBytes: report.emittedBytes,
  startupRawBytes: report.startup.rawBytes, incrementalPipRawBytes: report.incrementalPip.rawBytes, optionalAssetBytes: report.optionalAssetBytes }));
