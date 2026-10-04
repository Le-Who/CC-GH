/** Run after the real Vite build. Uses the production Express delivery path. */
import { resolve } from 'node:path';
import test from 'node:test';
import { verifyYardPublicMediaHttp } from '../scripts/yard-public-media-http.mjs';

test('built production server delivers 706 exact assets with correct MIME and misses return 404', async () => {
  const { app } = await import('../server.js');
  console.log('YARD_PRODUCTION_MEDIA_DELIVERY', JSON.stringify(await verifyYardPublicMediaHttp({ rootDir: resolve(import.meta.dirname, '..'), app })));
});
