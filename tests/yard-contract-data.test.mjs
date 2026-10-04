import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, renameSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fingerprint, PROMOTED_PATHS } from '../scripts/yard-active-contract.mjs';
import { execFileSync } from 'node:child_process';
import { deriveDispatcher, normalizeBuildTree, verifyBuildTransition, gitBlob, TOOL_PINS, CLOSED_BUILD, CLOSED_DISPATCHER_BLOB, REVIEWED_BUILD_PATHS, REVIEWED_ACCEPTANCE_PATHS, REVIEWED_TOOL_PATHS, EXTENSION_PATH, DISPATCHER_PATH } from '../scripts/yard-active-build-transition.mjs';
import { assertExactPromotionTree, ADDED_PROMOTION_PATHS } from '../scripts/yard-ci-dispatch.mjs';
import path from 'node:path';
import test from 'node:test';
import { YARD_CONTRACT_DATA_MODULES, yardContractChunk, yardChunkFileNames, yardContractData } from '../scripts/yard-contract-data.mjs';
import { gameLoadingGraph } from '../scripts/game-loading-graph.mjs';

const root = path.resolve(process.env.YARD_CONTRACT_TEST_SOURCE_ROOT || path.resolve(import.meta.dirname, '..')); // read-only test fixture location
const source = [...YARD_CONTRACT_DATA_MODULES][0];
function fixture({ eager = false, mixed = false, wrongPath = false } = {}) {
  const data = wrongPath ? 'assets/family-actor-media.js' : 'assets/yard-data/yard-data-clip-contracts-hash.js';
  return {
    'assets/app.js': { type: 'chunk', fileName: 'assets/app.js', isEntry: true, imports: eager ? [data] : [], dynamicImports: ['assets/CourtyardGame.js'], modules: {} },
    'assets/CourtyardGame.js': { type: 'chunk', fileName: 'assets/CourtyardGame.js', imports: [data], dynamicImports: [], modules: { [path.join(root, 'src/games/companion-yard-v2/CourtyardGame.jsx')]: { renderedLength: 100 } } },
    [data]: { type: 'chunk', fileName: data, imports: [], dynamicImports: [], modules: { [path.join(root, source)]: { renderedLength: 100 }, ...(mixed ? { [path.join(root, 'game-logic/yard-v2/family-media-source.mjs')]: { renderedLength: 100 } } : {}) } },
  };
}
function plugin() { const plugin = yardContractData(); plugin.configResolved({ root }); return plugin; }

test('only the exact 29 frozen JSON contracts are data-only; original bytes remain pinned', async () => {
  assert.equal(YARD_CONTRACT_DATA_MODULES.size, 29);
  for (const id of YARD_CONTRACT_DATA_MODULES) assert.ok(id.endsWith('.json'));
  await plugin().buildStart();
  assert.equal(yardContractChunk(path.join(root, 'game-logic/yard-v2/family-media-source.mjs'), root), undefined);
  assert.equal(yardContractChunk(path.join(root, 'src/games/companion-yard-v2/scene.mjs'), root), undefined);
  assert.equal(yardContractChunk(path.join(root, 'game-logic/yard-v2/media/unreviewed.json'), root), undefined);
  assert.match(yardContractChunk(path.join(root, source), root), /^yard-data-/);
});

test('nested data chunks are excluded by the real Workbox glob BEFORE its unchanged size limit', async () => {
  const config = await readFile(path.join(root, 'vite.config.js'), 'utf8');
  const block = config.match(/globPatterns:\s*\[([\s\S]*?)\]/)[1];
  const patterns = [...block.matchAll(/"([^"]+)"/g)].map(row => row[1]);
  assert.equal(patterns.length, 1);
  for (const id of YARD_CONTRACT_DATA_MODULES) {
    const name = yardContractChunk(path.join(root, id), root);
    const out = yardChunkFileNames({ name }).replace('[name]', name).replace('[hash]', 'fixture');
    assert.equal(patterns.some(pattern => path.matchesGlob(out, pattern)), false);
  }
  assert.doesNotMatch(config, /maximumFileSizeToCacheInBytes/);
  assert.equal(yardChunkFileNames({ name: 'CourtyardGame' }), 'assets/[name]-[hash].js');
});

test('real Rollup module metadata rejects mixed executable data chunks and static shell reachability', () => {
  assert.doesNotThrow(() => plugin().generateBundle({}, fixture()));
  assert.throws(() => plugin().generateBundle({}, fixture({ eager: true })), /startup shell/);
  assert.throws(() => plugin().generateBundle({}, fixture({ mixed: true })), /mixed into executable|Executable code/);
  assert.throws(() => plugin().generateBundle({}, fixture({ wrongPath: true })), /mixed into executable/);
  const mixed = fixture(); mixed['assets/yard-data/yard-data-clip-contracts-hash.js'].imports.push('assets/CourtyardGame.js');
  assert.throws(() => plugin().generateBundle({}, mixed), /Executable code/);
  const withCss = fixture(); withCss['assets/yard-data/yard-data-clip-contracts-hash.js'].viteMetadata = { importedCss: new Set(['assets/game.css']) };
  assert.throws(() => plugin().generateBundle({}, withCss), /Executable code/);
});

test('loading graph reports JSON separately but never exempts a mixed server implementation', () => {
  const graphPlugin = gameLoadingGraph(); graphPlugin.configResolved({ root });
  let graph; const emit = { emitFile(asset) { graph = JSON.parse(asset.source); } };
  graphPlugin.generateBundle.call(emit, {}, fixture());
  assert.equal(graph.chunks.find(c => c.file.includes('yard-data')).dataOnly, true);
  assert.equal(graph.chunks.find(c => c.file.includes('CourtyardGame')).dataOnly, false);
  graphPlugin.generateBundle.call(emit, {}, fixture({ mixed: true }));
  assert.equal(graph.chunks.find(c => c.file.includes('yard-data')).dataOnly, false);
});


test('vendor or virtual runtime code never receives the immutable JSON exemption', () => {
  for (const extra of [path.join(root, 'node_modules/helper/index.js'), '\0virtual:executable']) {
    const bundle = fixture();
    bundle['assets/yard-data/yard-data-clip-contracts-hash.js'].modules[extra] = { renderedLength: 10 };
    assert.throws(() => plugin().generateBundle({}, bundle), /mixed into executable|Executable code/);
    const graphPlugin = gameLoadingGraph(); graphPlugin.configResolved({ root });
    let graph; graphPlugin.generateBundle.call({ emitFile(asset) { graph = JSON.parse(asset.source); } }, {}, bundle);
    assert.equal(graph.chunks.find(c => c.file.includes('yard-data')).dataOnly, false);
  }
});


const familyPath = 'game-logic/yard-v2/media/family-actor-profiles.json';
const activePath = 'game-logic/yard-v2/active-release-contract.json';
const archivePath = `preview/yard-persistent-candidate/history/pre-activation/promoted-inputs/${familyPath}`;
function writeOwned(dir, file, bytes) {
  const target = path.join(dir, file); mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target + '.owned', bytes); renameSync(target + '.owned', target);
}
function buildFixture({ contract = true, closedFamily = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'yard-build-contract-'));
  function referenceTree(relative) {
    mkdirSync(path.join(dir, relative), { recursive: true });
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) referenceTree(file);
      else if (file !== activePath) symlinkSync(path.join(root, file), path.join(dir, file));
    }
  }
  // References immutable source files; no art or repository is cloned.
  referenceTree('game-logic/yard-v2');
  mkdirSync(path.dirname(path.join(dir, archivePath)), { recursive: true });
  symlinkSync(path.join(root, archivePath), path.join(dir, archivePath));
  if (contract) writeOwned(dir, activePath, readFileSync(path.join(root, activePath)));
  if (closedFamily) writeOwned(dir, familyPath, readFileSync(path.join(root, archivePath)));
  assert.equal(existsSync(path.join(dir, '.git')), false);
  assert.equal(existsSync(path.join(dir, 'recovery-tools')), false);
  return dir;
}
async function verifyFixture(dir) { const p = yardContractData(); p.configResolved({ root: dir }); await p.buildStart(); }
function changeContract(dir, change) {
  const data = JSON.parse(readFileSync(path.join(dir, activePath), 'utf8')); change(data);
  writeOwned(dir, activePath, JSON.stringify(data));
}
test('Docker-shaped filesystem verifies exact ACTIVE readiness without Git/recovery and strict CLOSED bytes without a contract', async () => {
  await verifyFixture(buildFixture());
  await verifyFixture(buildFixture({ contract: false, closedFamily: true }));
});
test('ACTIVE family bytes require the ACTIVE contract; malformed and inconsistent mode fail', async () => {
  await assert.rejects(() => verifyFixture(buildFixture({ contract: false })), /Frozen Yard contract changed/);
  const malformed = buildFixture(); writeOwned(malformed, activePath, '{'); await assert.rejects(() => verifyFixture(malformed));
  for (const value of [null, false, 0, []]) { const bad = buildFixture({ closedFamily: true }); writeOwned(bad, activePath, JSON.stringify(value)); await assert.rejects(() => verifyFixture(bad), /ACTIVE contract must be an object/); }
  const wrongMode = buildFixture(); changeContract(wrongMode, d => { d.mode = 'CLOSED'; }); await assert.rejects(() => verifyFixture(wrongMode));
});
test('ACTIVE contract with stale CLOSED family bytes fails', async () => {
  await assert.rejects(() => verifyFixture(buildFixture({ closedFamily: true })));
});
test('archive path and archived-byte substitution fail before accepting promoted data', async () => {
  const wrongPath = buildFixture(); changeContract(wrongPath, d => { d.transitions.find(r => r.path === familyPath).archive = '../../unowned'; });
  await assert.rejects(() => verifyFixture(wrongPath), /Exact archived CLOSED family path/);
  const changed = buildFixture(); writeOwned(changed, archivePath, readFileSync(path.join(root, archivePath)) + '\n');
  await assert.rejects(() => verifyFixture(changed), /Archived family bytes changed/);
});
test('arbitrary family changes remain rejected even if the mutable after fingerprint is repinned', async () => {
  for (const mutate of [d => { d.willow.playbackReady = false; }, d => { d.willow.unreviewed = true; }]) {
    const dir = buildFixture(), data = JSON.parse(readFileSync(path.join(dir, familyPath))); mutate(data);
    const bytes = JSON.stringify(data); writeOwned(dir, familyPath, bytes);
    changeContract(dir, d => { d.transitions.find(r => r.path === familyPath).after = fingerprint(bytes); });
    await assert.rejects(() => verifyFixture(dir), /Only exact family readiness promotion/);
  }
});
test('unrelated frozen JSON and closed runtime policy still block an ACTIVE build', async () => {
  const unrelated = buildFixture(), file = 'game-logic/yard-v2/media/family-runtime-roots.json';
  writeOwned(unrelated, file, readFileSync(path.join(root, file)) + '\n'); await assert.rejects(() => verifyFixture(unrelated), /Frozen Yard contract changed/);
  const closedPolicy = buildFixture(), policy = 'game-logic/yard-v2/release-policy.mjs';
  writeOwned(closedPolicy, policy, readFileSync(path.join(root, policy), 'utf8').replace('enabled: true', 'enabled: false'));
  await assert.rejects(() => verifyFixture(closedPolicy));
});


const authorRoot = path.resolve(import.meta.dirname, '..');
const originalDispatcher = () => execFileSync('git', ['cat-file', 'blob', `${CLOSED_BUILD}:${DISPATCHER_PATH}`], { cwd: root, encoding: 'utf8' });
function buildTreeFixture() {
  const entry = objectId => ({ mode: '100644', type: 'blob', objectId });
  const before = new Map(PROMOTED_PATHS.map(p => [p, entry('a'.repeat(40))]));
  const after = new Map(PROMOTED_PATHS.map(p => [p, entry('b'.repeat(40))]));
  for (const p of ADDED_PROMOTION_PATHS) after.set(p, entry('c'.repeat(40)));
  before.set('routes/player.js', entry('d'.repeat(40))); after.set('routes/player.js', entry('d'.repeat(40)));
  for (const [p, pin] of Object.entries(TOOL_PINS)) { before.set(p, entry(pin.before)); after.set(p, entry(pin.after)); }
  before.set(DISPATCHER_PATH, entry(CLOSED_DISPATCHER_BLOB)); after.set(DISPATCHER_PATH, entry(gitBlob(deriveDispatcher(originalDispatcher()))));
  after.set(EXTENSION_PATH, entry(gitBlob(readFileSync(path.join(authorRoot, EXTENSION_PATH)))));
  return { before, after };
}
test('build extension preserves the exact21 source fence and adds separately pinned build and production-acceptance tooling', () => {
  const { before, after } = buildTreeFixture();
  assert.deepEqual(assertExactPromotionTree(before, after), { changedFiles: 21, reviewedBuildToolingFiles: 4, reviewedAcceptanceToolingFiles: 3, totalChangedFiles: 28, unchangedFiles: 1 });
  for (const p of REVIEWED_TOOL_PATHS) {
    const bad = new Map(after); bad.set(p, { ...bad.get(p), objectId: 'f'.repeat(40) }); assert.throws(() => assertExactPromotionTree(before, bad));
    const mode = new Map(after); mode.set(p, { ...mode.get(p), mode: '100755' }); assert.throws(() => assertExactPromotionTree(before, mode));
  }
  const partial = new Map(after); partial.set('scripts/yard-contract-data.mjs', before.get('scripts/yard-contract-data.mjs')); assert.throws(() => normalizeBuildTree(before, partial));
  const unrelated = new Map(after); unrelated.set('routes/player.js', { ...unrelated.get('routes/player.js'), objectId: 'e'.repeat(40) }); assert.throws(() => assertExactPromotionTree(before, unrelated), /Unrelated tree change/);
});
test('dispatcher extension is derived exactly from A rather than accepting arbitrary self bytes', () => {
  const original = originalDispatcher(), derived = deriveDispatcher(original);
  assert.equal(derived, readFileSync(path.join(authorRoot, DISPATCHER_PATH), 'utf8'));
  assert.throws(() => deriveDispatcher(original + '\n'), /Exact original A dispatcher bytes/);
  const dir = mkdtempSync(path.join(tmpdir(), 'yard-build-wiring-'));
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim();
  writeOwned(dir, '.git', `gitdir: ${gitDir}\n`);
  for (const file of REVIEWED_TOOL_PATHS) writeOwned(dir, file, readFileSync(path.join(authorRoot, file)));
  const proof = verifyBuildTransition({ rootDir: dir, closedCommit: CLOSED_BUILD });
  assert.equal(proof.changedFiles, 7); assert.equal(proof.buildTransition.paths.length, 4);
  assert.deepEqual(proof.acceptanceTransition.paths, REVIEWED_ACCEPTANCE_PATHS); assert.equal(proof.acceptanceTransition.requiredTotalCases, 9);
  writeOwned(dir, DISPATCHER_PATH, derived + '\n// unreviewed dispatcher change\n');
  assert.throws(() => verifyBuildTransition({ rootDir: dir, closedCommit: CLOSED_BUILD }), /exact reviewed transformation/);
});
