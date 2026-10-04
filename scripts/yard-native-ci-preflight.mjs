import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const closures = {};
for (const name of ['mochi', 'pebble', 'pip', 'eight']) {
  const path = `recovery-tools/yard-canonical-${name}-qa/SOURCE-CLOSURE.json`;
  const bytes = await readFile(resolve(root, path)), manifest = JSON.parse(bytes);
  if (manifest.runtimeActivated !== false || manifest.files.length !== 95) throw Error('Expected closed 95-file source identity');
  for (const file of manifest.files) if (hash(await readFile(resolve(root, file.path))) !== file.sha256) throw Error(`Source identity mismatch: ${file.path}`);
  closures[path] = { files: manifest.files.length, sha256: hash(bytes) };
}
const mediaPath = 'recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json';
const mediaBytes = await readFile(resolve(root, mediaPath)), media = JSON.parse(mediaBytes);
if (media.runtimeActivated !== false || media.files.length !== 978) throw Error('Expected closed 978-file media identity');
for (const file of media.files) {
  const bytes = await readFile(resolve(root, file.repositoryPath));
  if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw Error(`Media identity mismatch: ${file.repositoryPath}`);
}
closures[mediaPath] = { files: media.files.length, sha256: hash(mediaBytes) };
const scriptHashes = {};
for (const path of ['scripts/yard-native-full-gameplay.cjs', 'scripts/yard-native-gameplay-runtime.mjs', 'scripts/yard-eight-canonical-ci-server.mjs', 'recovery-tools/yard-canonical-eight-qa/preview.mjs', 'recovery-tools/yard-canonical-eight-qa/fixture.json']) scriptHashes[path] = hash(await readFile(resolve(root, path)));
const trackedChanges = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
if (process.env.GITHUB_ACTIONS === 'true' && trackedChanges.length) throw Error(`CI must test the committed source identity: ${trackedChanges.join(', ')}`);
console.log(JSON.stringify({ scope: 'Preflight identities only; no full-duration result.', commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(), trackedChanges, node: process.version, closures, scriptHashes }, null, 2));
