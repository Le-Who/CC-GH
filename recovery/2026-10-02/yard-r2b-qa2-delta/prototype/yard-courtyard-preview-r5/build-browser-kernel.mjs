/** Local deterministic packaging only. Reads immutable freeze; writes only ./browser.
 * Run `node build-browser-kernel.mjs`. No installs, bundler, or remote calls. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const freeze = path.resolve(here, '../../checkpoints/yard-state-foundation-r1-20261002T0232Z');
const out = path.join(here, 'browser'), root = 'prototype/yard-state-r1';
const digest = text => createHash('sha256').update(text).digest('hex');
const files = new Map();
async function collect(relative) {
  if (files.has(relative)) return;
  const absolute = path.resolve(freeze, relative);
  if (!absolute.startsWith(freeze + path.sep)) throw new Error('Unexpected import outside freeze');
  const source = await readFile(absolute, 'utf8'); files.set(relative, source);
  for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
    if (match[1] === 'node:crypto' && relative === `${root}/util.mjs`) continue;
    if (!match[1].startsWith('.')) throw new Error(`Unexpected bare import ${match[1]}`);
    await collect(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
  }
}
for (const name of ['simulation','migration','geometry','boundary','util']) await collect(`${root}/${name}.mjs`);
await collect('design/yard-v2/baseline-47519/game-logic/player.js');
const manifest = { sourceCheckpoint: 'yard-state-foundation-r1-20261002T0232Z', files: [], transformations: [
  'util: Node createHash replaced by sync UTF-8 SHA256; canonical/hash32/random functions unchanged',
  'boundary: Node Buffer hex→base64url replaced by equivalent pure helper for legacy receipt checks',
  'All other copied source bytes unchanged',
] };
for (const [relative, source] of [...files].sort(([a],[b])=>a.localeCompare(b))) {
  let generated = source;
  if (relative === `${root}/util.mjs`) {
    generated = generated.replace("import { createHash } from 'node:crypto';", "import { sha256 } from '../../sha256.mjs';");
    const before = "createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')";
    if (!generated.includes(before)) throw new Error('SHA replacement source mismatch');
    generated = generated.replace(before, "sha256(typeof value === 'string' ? value : canonical(value))");
  }
  if (relative === `${root}/boundary.mjs`) {
    const before = "Buffer.from(requestHash, 'hex').toString('base64url')";
    if (!generated.includes(before)) throw new Error('Legacy receipt replacement source mismatch');
    generated = "import { hexToBase64url } from '../../sha256.mjs';\n" + generated.replace(before, 'hexToBase64url(requestHash)');
  }
  const filename = path.join(out, relative); await mkdir(path.dirname(filename), {recursive:true}); await writeFile(filename, generated);
  manifest.files.push({path:relative, sourceSha256:digest(source), generatedSha256:digest(generated), changed:source!==generated});
}
await writeFile(path.join(out, 'sha256.mjs'), await readFile(path.join(here, 'sha256.mjs')));
await writeFile(path.join(out, 'kernel.mjs'), `import * as simulation from './${root}/simulation.mjs';\nimport * as migration from './${root}/migration.mjs';\nimport * as geometry from './${root}/geometry.mjs';\nimport * as boundary from './${root}/boundary.mjs';\nimport * as util from './${root}/util.mjs';\nimport { createDefaultPlayer } from './design/yard-v2/baseline-47519/game-logic/player.js';\nexport const browserKernel = { ...simulation, ...migration, ...geometry, ...boundary, ...util, createDefaultPlayer };\n`);
await writeFile(path.join(out,'PROVENANCE.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Browser kernel: ${files.size} source modules; two explicit platform substitutions; all imports local`);
