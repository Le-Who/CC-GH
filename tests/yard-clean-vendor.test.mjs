import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import pins from '../scripts/yard-pip-vendor.json' with { type: 'json' };
import { yardPipVendor } from '../scripts/yard-pip-vendor.mjs';

async function fixture(t, { previewFlag = 'false', startup = false, code = 'export const engine = true;' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yard-clean-vendor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const license = path.join(root, pins.files[0].path);
  await mkdir(path.dirname(license), { recursive: true });
  await writeFile(license, 'Test license for the bundle-hook fixture.');
  const plugin = yardPipVendor();
  plugin.configResolved({ root, define: { 'import.meta.env.VITE_YARD_PIP_PREVIEW': JSON.stringify(previewFlag) } });
  const vendorName = 'assets/engine.js';
  const bundle = {
    'assets/app.js': { type: 'chunk', fileName: 'assets/app.js', isEntry: true, imports: startup ? [vendorName] : [], dynamicImports: ['assets/yard.js'], modules: {}, code: 'app' },
    'assets/yard.js': { type: 'chunk', fileName: 'assets/yard.js', isEntry: false, imports: [], dynamicImports: [vendorName], modules: { [path.join(root, 'src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs')]: { renderedLength: 4 } }, code: 'yard' },
    [vendorName]: { type: 'chunk', fileName: vendorName, isEntry: false, imports: [], dynamicImports: [], modules: Object.fromEntries(pins.files.filter(row => row.path.endsWith('.js')).map(row => [path.join(root, row.path), { renderedLength: 1 }])), code },
  };
  const emitted = [];
  const run = () => plugin.generateBundle.call({ emitFile: value => emitted.push(value) }, {}, bundle);
  return { root, plugin, bundle, emitted, run };
}

test('the normal clean route emits v3 without depending on a preview flag', async t => {
  for (const previewFlag of ['false', 'true', undefined]) {
    const { run, emitted } = await fixture(t, { previewFlag });
    await run();
    const report = JSON.parse(emitted.find(row => row.fileName === 'yard-pip-vendor-report.json').source);
    assert.equal(report.format, 'yard-pip-vendor-report/v3');
    assert.equal(report.activation, 'canonical-clean');
    assert.equal(report.included, true);
    assert.equal(Object.hasOwn(report, 'previewBuild'), false);
    assert.equal(report.startupBytes, 0);
    assert.deepEqual(report.budget, { rawBytes: 800_000, gzipBytes: 210_000 });
    assert.deepEqual(report.modules, pins.files.filter(row => row.path.endsWith('.js')).map(row => row.path).sort());
    assert.ok(emitted.some(row => row.fileName === 'licenses/yard-pip-three.txt'));
  }
});

test('a missing engine or a startup engine cannot qualify the normal clean build', async t => {
  const missing = await fixture(t); delete missing.bundle['assets/engine.js'];
  await assert.rejects(missing.run(), /must include its lazy source-pinned engine/);
  const eager = await fixture(t, { startup: true });
  await assert.rejects(eager.run(), /startup shell/);
});

test('the engine retains independent raw and gzip transfer caps', async t => {
  await assert.rejects((await fixture(t, { code: 'x'.repeat(800_001) })).run(), /separate transfer budget/);
  await assert.rejects((await fixture(t, { code: randomBytes(270_000).toString('base64') })).run(), /separate transfer budget/);
});

test('vendor isolation and the second-engine prohibition remain enforced', async t => {
  const mixed = await fixture(t);
  mixed.bundle['assets/engine.js'].modules[path.join(mixed.root, 'src/games/companion-yard-v2/gameplay.mjs')] = { renderedLength: 1 };
  await assert.rejects(mixed.run(), /must not absorb application code/);
  const duplicate = await fixture(t);
  duplicate.bundle['assets/yard.js'].modules[path.join(duplicate.root, 'node_modules/three/build/three.module.js')] = { renderedLength: 1 };
  await assert.rejects(duplicate.run(), /second Three installation/);
});

test('every reviewed vendor pin remains unchanged and corrupted source bytes fail before bundling', async t => {
  const pinBytes = await readFile(new URL('../scripts/yard-pip-vendor.json', import.meta.url));
  const gitIdentity = createHash('sha1').update(`blob ${pinBytes.length}\0`).update(pinBytes).digest('hex');
  assert.equal(gitIdentity, '6852bb8be9a6ddc1ca71526933bd196672c1ac2a');
  const { root, plugin } = await fixture(t);
  const license = path.join(root, pins.files[0].path);
  await writeFile(license, Buffer.alloc(pins.files[0].bytes));
  await assert.rejects(plugin.buildStart(), /Pip vendor bytes changed/);
  await writeFile(license, Buffer.alloc(pins.files[0].bytes - 1));
  await assert.rejects(plugin.buildStart(), /Pip vendor size changed/);
});
