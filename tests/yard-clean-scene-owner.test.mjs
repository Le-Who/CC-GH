import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSceneOwner} from '../src/games/companion-yard-v2/scene-owner.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const settle = () => new Promise(resolve => setImmediate(resolve));
const snapshot = (id = 'A', patch = {}) => ({player: {id}, yardRuntime: {version: 1, mutable: true, status: 'ready', storageVersion: 2, ...patch}});
function harness({factory, loadScene, ...options} = {}) {
 const previousWindow = globalThis.window, window = new EventTarget(); globalThis.window = window;
 const canvas = {width: 300, height: 400, style: {}}, host = {style: {}}, children = [], views = [], states = [], errors = [], interruptions = [];
 const create = (_, props) => {
  const updates = [], calls = [], child = {props, updates, calls, disposed: false, ready: Promise.resolve(),
   update: value => updates.push(value), setGhost: value => calls.push(['ghost', value]),
   point: () => ({x: 1, y: 2}), hit: () => ({slotId: 'canonical:1'}), offsetPoint: value => value,
   inspectCanonicalSlot: value => { calls.push(['inspect', value]); return true; },
   selectCanonicalSlot: value => { calls.push(['select', value]); return true; },
   setCanonicalActionPending: value => calls.push(['pending', value]),
   dispose() { this.disposed = true; return this.retirement; }, diagnostics: () => ({id: children.indexOf(child)})};
  children.push(child); return factory?.(child) ?? child;
 };
 const base = {directHost: host, uiImageOwner: {setAdmissionCheck() {}, snapshot: () => ({bytes: 0})},
  onView: value => views.push(value), onPrototypeState: value => states.push(value), onError: value => errors.push(value),
  onPointerInterrupt: () => interruptions.push(true), loadScene: loadScene ?? (async () => ({createPipYardScene: create})), ...options};
 const owner = createSceneOwner(canvas, base);
 return {owner, canvas, host, children, views, states, errors, interruptions, create,
  newOwner: () => createSceneOwner(canvas, base),
  hide() { window.dispatchEvent(new Event('pagehide')); },
  show() { const event = new Event('pageshow'); Object.defineProperty(event, 'persisted', {value: true}); window.dispatchEvent(event); },
  async close() { await owner.dispose(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }};
}

test('first mounted scene is canonical and exposes no legacy or arbitrary movement controls', async () => {
 const h = harness();
 try {
  const value = snapshot(); h.owner.update(value); await h.owner.ready;
  assert.equal(h.children.length, 1); assert.equal(h.children[0].props.canonicalItems, true);
  assert.equal(h.children[0].props.canonicalSavedVisits, false); assert.deepEqual(h.children[0].updates, [value]);
  assert.equal(h.owner.diagnostics().mode, 'canonical-items');
  for (const key of ['setPrototypeEnabled', 'moveTo', 'movePlanter', 'inspectAgain', 'requestMikaItemArrival', 'prepareMikaCheckpoint']) assert.equal(h.owner[key], undefined);
  assert.equal(await h.owner.setCanonicalItemsEnabled(false), false); assert.equal(h.children.length, 1);
  assert.equal(h.owner.setGhost({slotId: 'old-grid'}), false);
  assert.equal(h.owner.setGhost({locationId: 'canonical-clean-garden', slotId: 'canonical:1'}), true);
  assert.equal(h.owner.inspectCanonicalSlot('canonical:1'), true);
 } finally { await h.close(); }
});

test('renderer failure retires clean resources and stays hidden and read-only until clean restart', async () => {
 const h = harness();
 try {
  h.owner.update(snapshot()); await h.owner.ready; const old = h.children[0];
  old.props.onView({mediaReady: true, mutable: false, itemMutable: true, pets: [{id: 'visible'}]});
  old.props.onFailure(Error('WEBGL_FAILED'), {operation: 'render'}); await h.owner.ready;
  assert.equal(old.disposed, true); assert.equal(h.children.length, 1); assert.equal(h.owner.diagnostics().mode, 'unavailable');
  assert.equal(h.canvas.style.visibility, 'hidden'); assert.equal(h.host.style.visibility, 'hidden');
  assert.deepEqual(h.views.at(-1).pets, []); assert.equal(h.views.at(-1).itemMutable, false); assert.equal(h.views.at(-1).mediaReady, false);
  assert.equal(h.owner.point({}), null); assert.equal(h.owner.inspectCanonicalSlot('canonical:1'), false);
  old.props.onView({mediaReady: true}); old.props.onRestartRequired(); await settle(); assert.equal(h.children.length, 1);
  h.owner.update(snapshot()); await h.owner.ready; assert.equal(h.children.length, 1);
  await h.owner.restart(); await h.owner.ready; assert.equal(h.children.length, 2); assert.equal(h.children[1].props.canonicalItems, true);
 } finally { await h.close(); }
});

test('pagehide and bfcache return serialize clean retirement before a fresh clean owner', async () => {
 const gate = deferred(), h = harness();
 try {
  h.owner.update(snapshot()); await h.owner.ready; const old = h.children[0]; old.retirement = gate.promise;
  h.hide(); h.show(); await settle(); assert.equal(old.disposed, true); assert.equal(h.children.length, 1);
  assert.equal(h.owner.point({}), null); old.props.onPointerInterrupt(); assert.equal(h.interruptions.length, 0);
  gate.resolve(); await h.owner.ready; assert.equal(h.children.length, 2); assert.equal(h.children[1].props.canonicalItems, true);
  h.children[1].props.onRestartRequired(); await h.owner.ready; assert.equal(h.children.length, 3);
  assert.equal(h.children[2].props.canonicalItems, true);
 } finally { gate.resolve(); await h.close(); }
});

for (const change of ['account-roundtrip', 'session']) test(`${change} invalidates old callbacks and recreates only the current canonical owner`, async () => {
 const gate = deferred(), h = harness(), session = {};
 try {
  h.owner.update(snapshot(), {accountSession: session}); await h.owner.ready; const old = h.children[0]; old.retirement = gate.promise;
  old.props.onView({privateAccount: 'A', mediaReady: true}); h.owner.setCanonicalActionPending(true);
  if (change === 'account-roundtrip') { h.owner.update(snapshot('B'), {accountSession: session}); h.owner.update(snapshot('A'), {accountSession: session}); }
  else h.owner.update(snapshot(), {accountSession: {}});
  assert.equal(h.views.at(-1), null); assert.equal(h.owner.point({}), null);
  old.props.onView({privateAccount: 'stale'}); old.props.onFailure(Error('stale')); old.props.onPointerInterrupt();
  await settle(); assert.equal(h.children.length, 1); assert.equal(h.errors.length, 0); assert.equal(h.interruptions.length, 0);
  gate.resolve(); await h.owner.ready;
  assert.equal(h.children.length, 2); assert.equal(h.children[1].updates.at(-1).player.id, 'A');
  assert.equal(h.children[1].props.canonicalActionPending, false);
 } finally { gate.resolve(); await h.close(); }
});

test('account A to B to A while module import is pending cannot construct a stale renderer', async () => {
 const gate = deferred(), entered = deferred(); let loads = 0;
 const h = harness({loadScene: async () => { loads++; if (loads === 1) { entered.resolve(); await gate.promise; } return {createPipYardScene: h.create}; }});
 try {
  h.owner.update(snapshot()); await entered.promise;
  h.owner.update(snapshot('B')); h.owner.update(snapshot('A')); gate.resolve(); await h.owner.ready;
  assert.equal(loads, 2); assert.equal(h.children.length, 1); assert.equal(h.children[0].updates.at(-1).player.id, 'A');
 } finally { gate.resolve(); await h.close(); }
});

test('account change during renderer initialization waits for its asynchronous resource retirement', async () => {
 const gate = deferred(), h = harness({factory: child => { if (child === h.children[0]) { child.ready = gate.promise; child.retirement = gate.promise; } return child; }});
 try {
  h.owner.update(snapshot()); await settle(); assert.equal(h.children.length, 1);
  const old = h.children[0]; h.owner.update(snapshot('B')); await settle();
  assert.equal(old.disposed, true); assert.equal(h.children.length, 1);
  old.props.onView({mediaReady: true, account: 'A'}); old.props.onRestartRequired();
  assert.equal(h.views.at(-1), null); gate.resolve(); await h.owner.ready;
  assert.equal(h.children.length, 2); assert.equal(h.children[1].updates.at(-1).player.id, 'B');
 } finally { gate.resolve(); await h.close(); }
});

test('fresh mounts wait for previous disposal and late callbacks cannot affect the replacement', async () => {
 const gate = deferred(), h = harness(); let replacement;
 try {
  h.owner.update(snapshot()); await h.owner.ready; const old = h.children[0]; old.retirement = gate.promise;
  const retiring = h.owner.dispose(); replacement = h.newOwner(); replacement.update(snapshot('B'));
  old.props.onView({mediaReady: true}); old.props.onRestartRequired(); old.props.onPointerInterrupt();
  await settle(); assert.equal(h.children.length, 1); assert.equal(h.interruptions.length, 0);
  gate.resolve(); await retiring; await replacement.ready;
  assert.equal(h.children.length, 2); assert.equal(h.children[1].updates.at(-1).player.id, 'B');
  const count = h.views.length; old.props.onView({mediaReady: true}); assert.equal(h.views.length, count);
  assert.equal(h.owner.setGhost(null), false); assert.equal(await h.owner.restart(), false);
 } finally { gate.resolve(); await replacement?.dispose(); await h.close(); }
});

test('saved v3 stays unavailable without explicit admission, including page return and account changes', async () => {
 const h = harness(), saved = snapshot('A', {storageVersion: 3, canonicalVisitProtocol: 'yard-canonical-authoritative/v1'});
 try {
  h.owner.update(saved); await h.owner.ready; assert.equal(h.children.length, 0); assert.equal(h.owner.diagnostics().mode, 'unavailable');
  await h.owner.restart(); h.hide(); h.show(); await h.owner.ready; assert.equal(h.children.length, 0);
  h.owner.update({...saved, player: {id: 'B'}}); await h.owner.ready; assert.equal(h.children.length, 0);
  h.owner.update(snapshot('B')); await h.owner.ready; assert.equal(h.children.length, 1); assert.equal(h.children[0].props.canonicalSavedVisits, false);
 } finally { await h.close(); }
});

test('saved protocol transitions retire before admission and unknown versions stay read-only', async () => {
 const h = harness({canonicalSavedVisitsAllowed: true, now: () => 10});
 try {
  h.owner.update(snapshot()); await h.owner.ready;
  h.owner.update(snapshot('A', {storageVersion: 3, canonicalVisitProtocol: 'yard-canonical-authoritative/v1', serverNow: 5000}));
  await h.owner.ready; assert.equal(h.children.length, 2); assert.equal(h.children[0].disposed, true);
  assert.equal(h.children[1].props.canonicalItems, true); assert.equal(h.children[1].props.canonicalSavedVisits, true);
  assert.equal(h.owner.diagnostics().savedServerNow, 5000); assert.equal(h.owner.setGhost({locationId: 'canonical-clean-garden'}), false);
  h.owner.update(snapshot('A', {storageVersion: 3, canonicalVisitProtocol: 'future'})); await h.owner.ready;
  assert.equal(h.children.length, 2); assert.equal(h.children[1].disposed, true); assert.equal(h.owner.diagnostics().mode, 'unavailable');
 } finally { await h.close(); }
});

test('failed factory and disposed pending import never create a fallback', async () => {
 const h = harness({loadScene: async () => { throw Error('CHUNK_UNAVAILABLE'); }});
 try { h.owner.update(snapshot()); await h.owner.ready; assert.equal(h.children.length, 0); assert.equal(h.owner.diagnostics().mode, 'unavailable'); assert.equal(h.errors[0].code, 'YARD_PIP_SCENE_FAILED'); }
 finally { await h.close(); }
 const gate = deferred(), entered = deferred();
 const pending = harness({loadScene: async () => { entered.resolve(); await gate.promise; return {createPipYardScene: pending.create}; }});
 try { pending.owner.update(snapshot()); await entered.promise; const disposing = pending.owner.dispose(); gate.resolve(); await disposing; assert.equal(pending.children.length, 0); }
 finally { gate.resolve(); await pending.close(); }
});

test('disabled or malformed runtime retires the renderer without allocating a replacement', async () => {
 const h = harness();
 try {
  h.owner.update(snapshot()); await h.owner.ready;
  for (const value of [snapshot('A', {mutable: false}), snapshot('A', {status: 'disabled'}), snapshot('A', {storageVersion: 99}), null, {}]) {
   h.owner.update(value); await h.owner.ready; assert.equal(h.children.length, 1); assert.equal(h.owner.diagnostics().mode, 'unavailable');
   assert.equal(h.owner.inspectCanonicalSlot('canonical:1'), false);
  }
  assert.equal(h.children[0].disposed, true); assert.equal(h.canvas.style.visibility, 'hidden');
 } finally { await h.close(); }
});

test('a failed retirement blocks allocations in a fresh owner instead of bypassing the resource barrier', async () => {
 // Isolate this deliberately poisoned global barrier from the healthy owners.
 const {createSceneOwner: createIsolatedOwner} = await import('../src/games/companion-yard-v2/scene-owner.mjs?failed-retirement');
 const previousWindow = globalThis.window; globalThis.window = new EventTarget();
 let creates = 0; const errors = [], canvas = {style: {}, width: 1, height: 1};
 const options = {directHost: {style: {}}, onError: error => errors.push(error),
  loadScene: async () => ({createPipYardScene() { creates++; return {update() {}, dispose: () => Promise.reject(Error('RETIRE_FAILED'))}; }})};
 const first = createIsolatedOwner(canvas, options); let second;
 try {
  first.update(snapshot()); await first.ready; await first.dispose();
  second = createIsolatedOwner(canvas, options); second.update(snapshot('B')); await second.ready;
  assert.equal(creates, 1); assert.equal(second.diagnostics().mode, 'unavailable'); assert.equal(errors.at(-1).message, 'RETIRE_FAILED');
  assert.equal(canvas.style.visibility, 'hidden');
 } finally { await first.dispose(); await second?.dispose(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('owner source contains one factory and no legacy allocation path', () => {
 const source = readFileSync(new URL('../src/games/companion-yard-v2/scene-owner.mjs', import.meta.url), 'utf8');
 assert.doesNotMatch(source, /createLegacy|loadPrototype|setPrototypeEnabled|currentMode\s*===?\s*['"]legacy|createCourtyardScene|\.\/scene\.mjs/);
 assert.equal((source.match(/createPipYardScene\(canvas/g) || []).length, 1);
});
