import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isRetiredAssetPath } from './asset-retirement-policy.mjs';

export async function assertNoRetiredPublicAssets(publicDir) {
  const retired = [];
  async function visit(prefix = '') {
    let entries;
    try { entries = await readdir(join(publicDir, prefix), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT' && !prefix) return; throw error; }
    for (const entry of entries) {
      const file = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(file);
      else if (isRetiredAssetPath(file)) retired.push(file);
    }
  }
  await visit();
  if (retired.length) throw Error(`Retired/source-only assets must not ship from public/: ${retired.sort().join(', ')}`);
  return { checked: true, retired: 0 };
}

// Vite copies every public file. Fail before copying, including stale local files
// recreated by old generators; do not silently delete files during a build.
export function retiredPublicAssets() {
  return {
    name: 'retired-public-assets-guard',
    async configResolved(config) {
      if (config.publicDir) await assertNoRetiredPublicAssets(config.publicDir);
    },
  };
}
