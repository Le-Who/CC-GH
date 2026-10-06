import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { yardPipVendor, YARD_PIP_VENDOR_MODULES } from '../scripts/yard-pip-vendor.mjs';
const root = path.resolve(import.meta.dirname, '..');
const vendor = [...YARD_PIP_VENDOR_MODULES][0];
function chunk(modules, isEntry = false) {
  return { type: 'chunk', fileName: 'assets/fixture.js', code: 'export const fixture = true;', imports: [], dynamicImports: [], isEntry,
    modules: Object.fromEntries(modules.map(source => [path.join(root, source), { renderedLength: 10 }])) };
}
test('vendor exception rejects startup leakage, mixed application code and a second engine', async () => {
  const plugin = yardPipVendor(); plugin.configResolved({ root });
  await plugin.buildStart();
  for (const [fixture, message] of [
    [chunk([vendor], true), /startup shell/],
    [chunk([vendor, 'src/games/companion-yard-v2/scene.mjs']), /application code/],
    [chunk(['node_modules/three/build/three.module.js']), /second Three/],
  ]) await assert.rejects(plugin.generateBundle.call({ emitFile() {} }, {}, { 'assets/fixture.js': fixture }), message);
});
