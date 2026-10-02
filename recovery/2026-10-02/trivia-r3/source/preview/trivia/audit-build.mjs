import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRIVIA_PREVIEW_VERSION } from './version.js';
import { isAllowedTriviaAsset, TRIVIA_PREVIEW_KIND } from '../../vite.trivia-preview.config.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(repo, 'dist-trivia-preview');
const marker = JSON.parse(readFileSync(path.join(out, 'trivia-preview.json')));
assert.equal(marker.kind, TRIVIA_PREVIEW_KIND);
assert.equal(marker.previewVersion, TRIVIA_PREVIEW_VERSION);
assert.equal(marker.storage, 'memory-only');
assert.equal(marker.productionCompatible, false);
const files = [];
const walk = directory => {
  for (const name of readdirSync(directory)) {
    const file = path.join(directory, name);
    const info = statSync(file);
    if (info.isDirectory()) walk(file);
    else files.push({ path: path.relative(out, file).split(path.sep).join('/'), bytes: info.size });
  }
};
walk(out);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const item of marker.assets) {
  const bytes = readFileSync(path.join(out, item.path));
  assert.equal(bytes.length, item.bytes, `Asset size drift: ${item.path}`);
  assert.equal(digest(bytes), item.sha256, `Asset hash drift: ${item.path}`);
}
for (const item of marker.sources) assert.equal(digest(readFileSync(path.join(repo, item.path))), item.sha256, `Source changed after build: ${item.path}`);
for (const file of files.filter(file => file.path.startsWith('games/'))) assert.ok(isAllowedTriviaAsset(`/${file.path}`), `Unexpected game asset: ${file.path}`);
assert.ok(!files.some(file => /(?:^|\/)(?:sw\.js|workbox-|manifest\.webmanifest)/.test(file.path)), 'PWA output is not permitted');
const cssSources = marker.sources.filter(item => item.path.endsWith('.css')).map(item => item.path);
assert.deepEqual(cssSources.sort(), ['preview/trivia/fonts.css', 'preview/trivia/host.css', 'preview/trivia/launcher.css', 'preview/shared/launcher.css', 'src/app/hud-layout/hud-layout.css', 'src/games/trivia/trivia-presentation.css'].sort());
const total = list => list.reduce((bytes, file) => bytes + file.bytes, 0);
const group = predicate => { const selected = files.filter(predicate); return { files: selected.length, bytes: total(selected) }; };
console.log(JSON.stringify({
  result: 'PASS: static build inventory, isolation metadata and source/asset hashes',
  previewVersion: marker.previewVersion,
  browserQa: marker.browserQa,
  output: { files: files.length, bytes: total(files) },
  nonvirtualModulesAudited: marker.modulesAudited,
  projectSourceModules: marker.sources.length,
  newArt: group(file => file.path.startsWith('games/trivia-v2/')),
  retainedTokens: group(file => file.path.startsWith('games/puzzling-potions/images/')), // expected zero
  fonts: group(file => file.path.endsWith('.woff2')),
  javascript: group(file => file.path.endsWith('.js')),
  css: group(file => file.path.endsWith('.css')),
  cssSources,
}, null, 2));
