import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {yardReleasePresentation} from '../src/games/companion-yard-v2/release-presentation.mjs';

const entry = readFileSync(new URL('../src/games/companion-yard-v2/scene-entry.mjs', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/games/companion-yard-v2/YardReleaseGame.jsx', import.meta.url), 'utf8');
function evaluate(env = {}, supplied = {}) {
 let options, loads = 0;
 const body = entry.replace(/^import .*\n/gm, '').replace('export function', 'function')
  .replaceAll('import.meta.env', 'env').replace("import('./pip-prototype/yard-pip-scene.mjs')", 'loadCleanModule()');
 const factory = new Function('env', 'createSceneOwner', 'DEFAULT_RENDER_PROFILE', 'PAINTED_RENDER_PROFILE', 'loadCleanModule', body + ';return createCourtyardScene;')(
  env, (canvas, value) => { options = value; return {canvas}; }, 'default', 'painted', async () => { loads++; return {clean: true}; });
 const canvas = {}; assert.equal(factory(canvas, supplied).canvas, canvas);
 return {options, loads: () => loads};
}
function select(env = {}) {
 const selector = release.match(/useGameHub\((state =>[\s\S]*?)\);/)[1].replaceAll('import.meta.env', 'env');
 return new Function('yardReleasePresentation', 'env', 'return (' + selector + ');')(yardReleasePresentation, env);
}

test('normal entry loads exactly one clean factory without a preview or QA flag', async () => {
 const normal = evaluate({}, {loadScene: () => { throw Error('Untrusted substitute'); }, canonicalSavedVisitsAllowed: true});
 assert.equal(normal.options.canonicalSavedVisitsAllowed, false);
 assert.equal(normal.options.renderProfile, 'default');
 assert.deepEqual(await normal.options.loadScene(), {clean: true});
 assert.equal(normal.loads(), 1);
 assert.equal((entry.match(/import\('\.\/pip-prototype\/yard-pip-scene\.mjs'\)/g) || []).length, 1);
 assert.doesNotMatch(entry, /createLegacy|\.\/scene\.mjs|MIKA_QA|PIP_PREVIEW|loadQaLayer|__yardMikaQa/);
});

test('saved visits need their independent build gate; old QA flags do not select a renderer', async () => {
 for (const env of [{VITE_YARD_PIP_PREVIEW: 'false'}, {VITE_YARD_MIKA_QA: 'true', VITE_YARD_MIKA_ITEM_QA: 'true', VITE_YARD_MIKA_CONTINUATION_QA: 'true'}]) {
  const result = evaluate(env); assert.equal(result.options.canonicalSavedVisitsAllowed, false);
  assert.deepEqual(await result.options.loadScene(), {clean: true});
 }
 const saved = evaluate({VITE_YARD_SAVED_VISITS: 'true', VITE_YARD_PAINTED_FOOD_TRIAL: 'true'});
 assert.equal(saved.options.canonicalSavedVisitsAllowed, true); assert.equal(saved.options.renderProfile, 'painted');
});

test('normal release mounts only the clean Courtyard; disabled and malformed snapshots get Home shell', () => {
 const choose = select();
 assert.equal(choose({snapshot:null}), 'loading');
 for (const snapshot of [{}, {yardRuntime: {version: 99, mutable: true}}, {yardRuntime: {version: 1, mutable: false}}, {yardRuntime: {version: 1, mutable: true, storageVersion: 99}}, {yardRuntime: {version: 1, mutable: true, status: 'disabled'}}, {yardRuntime: {version: 1, mutable: true, status: 'ready', error: 'INVALID_DATA'}}]) {
  assert.equal(choose({snapshot}), 'read-only');
 }
 assert.equal(choose({snapshot: {yardRuntime: {version: 1, mutable: true, storageVersion: 2, status: 'ready'}}}), 'persistent');
 assert.doesNotMatch(release, /CompanionYardGame|\bLegacy\b|PIP_PREVIEW|yardPipPreview|allowCanonicalEntry|allowPipPrototype/);
 assert.equal((release.match(/React\.lazy\(/g) || []).length, 1);
 assert.match(release, /return <Persistent\/>/);
 assert.match(release, /data-yard-read-only=\{mode === 'read-only'/);
 assert.match(release, /mode === 'loading' \? 'yard.persistent.loading'/); assert.match(release, /onClick=\{openHome\}/);
});

test('saved v3 snapshots cannot enter the ordinary clean candidate implicitly', () => {
 const snapshot = {yardRuntime: {version: 1, storageVersion: 3, canonicalVisitProtocol: 'yard-canonical-authoritative/v1', status: 'ready'}};
 assert.equal(select()({snapshot}), 'read-only');
 assert.equal(select({VITE_YARD_SAVED_VISITS: 'true'})({snapshot}), 'persistent');
 for (const patch of [{canonicalVisitProtocol: 'future'}, {error: 'blocked'}, {status: 'future'}, {storageVersion: 4}]) {
  assert.equal(select({VITE_YARD_SAVED_VISITS: 'true'})({snapshot: {yardRuntime: {...snapshot.yardRuntime, ...patch}}}), 'read-only');
 }
});
