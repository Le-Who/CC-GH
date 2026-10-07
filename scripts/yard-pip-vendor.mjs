/** The reviewed vendored engine is third-party executable code, never game data. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import pins from './yard-pip-vendor.json' with { type: 'json' };
import { collectInitialShellFiles } from './sw-shell-precache.mjs';

export const YARD_PIP_VENDOR_MODULES = new Set(pins.files.filter(row => row.path.endsWith('.js')).map(row => row.path));
export const isYardPipVendorModule = source => YARD_PIP_VENDOR_MODULES.has(source);

export function yardPipVendor() {
  let root, previewBuild;
  const local = id => path.relative(root, id.split('?')[0]).replaceAll('\\', '/');
  return {
    name: 'exact-lazy-yard-pip-vendor', apply: 'build',
    configResolved(config) { root = config.root; previewBuild = config.define?.['import.meta.env.VITE_YARD_PIP_PREVIEW'] === JSON.stringify('true'); },
    async buildStart() {
      for (const row of pins.files) {
        const bytes = await readFile(path.join(root, row.path));
        assert.equal(bytes.length, row.bytes, `Pip vendor size changed: ${row.path}`);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, `Pip vendor bytes changed: ${row.path}`);
      }
    },
    async generateBundle(_options, bundle) {
      const shell = collectInitialShellFiles(bundle), vendorChunks = [], engineModules = new Set();
      for (const chunk of Object.values(bundle).filter(item => item.type === 'chunk')) {
        const rendered = Object.entries(chunk.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => id);
        assert.ok(!rendered.some(id => /node_modules[/\\](?:\.pnpm[/\\]three@|three[/\\])/.test(id)), 'A second Three installation entered the build');
        const vendor = rendered.filter(id => isYardPipVendorModule(local(id)));
        if (!vendor.length) continue;
        assert.equal(vendor.length, rendered.length, 'Pip engine must not absorb application code');
        assert.ok(!shell.has(chunk.fileName), 'Optional Three entered the startup shell');
        vendor.forEach(id => engineModules.add(local(id)));
        vendorChunks.push({ file: chunk.fileName, rawBytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code).length });
      }
      const rawBytes = vendorChunks.reduce((sum, row) => sum + row.rawBytes, 0);
      const gzipBytes = vendorChunks.reduce((sum, row) => sum + row.gzipBytes, 0);
      assert.equal(vendorChunks.length > 0, previewBuild, 'Literal preview build flag and emitted engine disagree');
      assert.ok(rawBytes <= 800_000 && gzipBytes <= 210_000, `Pinned optional engine exceeded its separate transfer budget: ${rawBytes} raw / ${gzipBytes} gzip`);
      if (vendorChunks.length) {
        assert.equal([...engineModules].filter(source => source.endsWith('/build/three.module.js')).length, 1);
        assert.equal([...engineModules].filter(source => source.endsWith('/build/three.core.js')).length, 1);
        this.emitFile({ type: 'asset', fileName: 'licenses/yard-pip-three.txt', source: await readFile(path.join(root, pins.files[0].path)) });
      }
      this.emitFile({ type: 'asset', fileName: 'yard-pip-vendor-report.json', source: JSON.stringify({
        format: 'yard-pip-vendor-report/v2', previewBuild,
        included: vendorChunks.length > 0, rawBytes, gzipBytes, chunks: vendorChunks, modules: [...engineModules].sort(),
        budget: { rawBytes: 800_000, gzipBytes: 210_000 }, startupBytes: 0,
      }, null, 2) + '\n' });
    },
  };
}
