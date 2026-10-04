/** Loopback smoke of the real production app; no database/startup side effects. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeYardPublicMedia, readYardPublicMediaMap } from './yard-public-media.mjs';

export async function verifyYardPublicMediaHttp({ rootDir = process.cwd(), app } = {}) {
  const root = resolve(rootDir);
  const result = await materializeYardPublicMedia({ rootDir: root, outputDir: 'dist', verify: true });
  const map = await readYardPublicMediaMap(root);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    for (const row of map.files) {
      const response = await fetch(new URL(row.path, base), { headers: { 'accept-encoding': 'identity' } });
      assert.equal(response.status, 200, row.path);
      assert.equal(response.headers.get('content-type')?.split(';')[0], row.contentType, row.path);
      assert.equal(Number(response.headers.get('content-length')), row.bytes, row.path);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, row.bytes, row.path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, row.path);
    }
    for (const path of ['assets/yard-family/unknown/runtime-media.json', 'assets/yard-fox/handoff.json', 'assets/yard-turtles/atlas-manifest.json', 'assets/yard-fox/missing.webp']) {
      const response = await fetch(new URL(path, base)); assert.equal(response.status, 404, path); assert.match(response.headers.get('content-type'), /^text\/plain/);
      assert.equal(await response.text(), 'Asset not found');
    }
    const sample = map.files.find(row => row.contentType === 'image/webp');
    const head = await fetch(new URL(`${sample.path}?v=frozen-source-revision`, base), { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), sample.bytes);
    // Frozen art is served on demand and excluded from startup/SW precache.
    for (const name of ['index.html', 'sw.js', 'assets-runtime/manifest.json']) assert.doesNotMatch(await readFile(resolve(root, 'dist', name), 'utf8'), /assets\/yard-(family|fox|turtles)\//);
    return result;
  } finally { await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app } = await import('../server.js');
  console.log('YARD_PRODUCTION_MEDIA_DELIVERY', JSON.stringify(await verifyYardPublicMediaHttp({ app })));
}
