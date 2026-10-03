import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createGameGestureController } from '../src/platform/gameGestures.js';
import { bubboFieldGeometry } from '../src/games/bubbo/bubboComposition.js';
import * as aim from '../src/games/bubbo/bubboAim.js';
import * as motion from '../src/games/bubbo/bubboMotion.js';
import * as art from '../src/games/bubbo/bubboArt.js';
import { createBubboRun } from '../src/game-core/bubbo/engine.js';

const require = createRequire(import.meta.url);
const { acorn } = require('../recovery-tools/ast-recovery.cjs');
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function mockSdk({ enabled = true, supported = true, mounted = true } = {}) {
  const calls = [];
  return {
    calls,
    isSwipeBehaviorSupported: () => supported,
    isSwipeBehaviorMounted: () => mounted,
    mountSwipeBehavior() { calls.push('mount'); mounted = true; },
    isVerticalSwipesEnabled: () => enabled,
    disableVerticalSwipes() { calls.push('disable'); enabled = false; },
    enableVerticalSwipes() { calls.push('enable'); enabled = true; },
  };
}

test('native swipe scopes restore prior state only after their final owner releases', async () => {
  const sdk = mockSdk();
  const controller = createGameGestureController(() => sdk);
  const bubbo = controller.acquire();
  await settle();
  const pixi = controller.acquire();
  assert.deepEqual(sdk.calls, ['disable']);
  pixi(); pixi();
  assert.equal(sdk.isVerticalSwipesEnabled(), false, 'unrelated pointer cleanup cannot release Bubbo');
  bubbo(); bubbo();
  assert.deepEqual(sdk.calls, ['disable', 'enable']);
  const reentry = controller.acquire();
  assert.equal(sdk.isVerticalSwipesEnabled(), false);
  reentry();
  assert.equal(sdk.isVerticalSwipesEnabled(), true);
});

test('already-disabled host behavior is preserved', async () => {
  const sdk = mockSdk({ enabled: false });
  const controller = createGameGestureController(() => sdk);
  const release = controller.acquire();
  await settle(); release();
  assert.equal(sdk.isVerticalSwipesEnabled(), false);
  assert.equal(sdk.calls.includes('enable'), false);
});

test('released scopes cannot disable swipes after delayed SDK loading', async () => {
  let resolve;
  const sdk = mockSdk();
  const controller = createGameGestureController(() => new Promise(done => { resolve = done; }));
  const release = controller.acquire();
  await settle(); release(); resolve(sdk); await settle();
  assert.deepEqual(sdk.calls, []);
  const current = controller.acquire();
  assert.deepEqual(sdk.calls, ['disable']);
  current();
  assert.deepEqual(sdk.calls, ['disable', 'enable']);
});

test('latest owner survives mount/cleanup replay while SDK is loading', async () => {
  let resolve;
  const sdk = mockSdk();
  const controller = createGameGestureController(() => new Promise(done => { resolve = done; }));
  const first = controller.acquire(); await settle(); first();
  const replay = controller.acquire(); resolve(sdk); await settle();
  assert.deepEqual(sdk.calls, ['disable']);
  replay(); assert.deepEqual(sdk.calls, ['disable', 'enable']);
});

test('older clients, missing SDK, and bridge exceptions leave browser gameplay usable', async () => {
  for (const sdk of [null, mockSdk({ supported: false }), { isSwipeBehaviorSupported: () => true, disableVerticalSwipes() { assert.fail('no restoration API'); } }, { isSwipeBehaviorSupported() { throw Error('unsupported'); } }]) {
    const controller = createGameGestureController(() => sdk);
    const release = controller.acquire(); await settle(); assert.doesNotThrow(release);
    if (sdk?.calls) assert.deepEqual(sdk.calls, []);
  }
  const controller = createGameGestureController(() => Promise.reject(Error('not installed')));
  const release = controller.acquire(); await settle(); assert.doesNotThrow(release);
});

test('supported swipe component is mounted before querying and changing its state', async () => {
  const sdk = mockSdk({ mounted: false });
  const controller = createGameGestureController(() => sdk);
  const release = controller.acquire(); await settle(); release();
  assert.deepEqual(sdk.calls, ['mount', 'disable', 'enable']);
});

function fieldHarness({ active = false, imageError = false } = {}) {
  const sdk = mockSdk();
  const controller = createGameGestureController(() => sdk);
  let hook = 0, tree, pauses = 0, captured = null;
  const slots = [], pending = [], images = [], windowListeners = new Map(), documentListeners = new Map();
  const document = { hidden: false, addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: name => documentListeners.delete(name) };
  const canvas = {
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 320, bottom: 480, width: 320, height: 480 }),
    focus() {}, setPointerCapture: id => { captured = id; },
    hasPointerCapture: id => captured === id, releasePointerCapture: () => { captured = null; },
  };
  const React = {
    forwardRef: fn => fn,
    useRef(value) { const index = hook++; return slots[index] ??= { current: value }; },
    useState(initial) { const index = hook++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = value; }]; },
    useImperativeHandle() {},
    useLayoutEffect(effect, deps) { return this.useEffect(effect, deps); },
    useEffect(effect, deps) {
      const index = hook++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const file = fs.readFileSync(new URL('../src/games/bubbo/BubboField.jsx', import.meta.url), 'utf8');
  const ast = acorn.parse(file, { ecmaVersion: 'latest', sourceType: 'module' });
  const source = ast.body.filter(node => !node.type.startsWith('Import') && !node.type.startsWith('Export')).map(node => file.slice(node.start, node.end)).join('\n');
  const jsx = (type, props) => ({ type, props });
  const component = vm.runInNewContext(source + '\nBubboField', {
    React, jsxRuntime: { jsx, jsxs: jsx }, ...aim, ...motion, ...art, bubboFieldGeometry,
    acquireGameGesture: () => controller.acquire(), document,
    window: { matchMedia: () => ({ matches: false }), addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: name => windowListeners.delete(name) },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    Image: class { constructor() { images.push(this); } },
  });
  const props = { state: { ...createBubboRun('gesture-test'), current: 'mint', gameActive: active, runActive: active }, width: 320, height: 480, onPause() { pauses++; props.state = { ...props.state, gameActive: false }; } };
  function render() {
    hook = 0; tree = component(props, null);
    tree.props.children[0].props.ref.current = canvas;
    pending.splice(0).forEach(fn => fn());
    return tree;
  }
  render();
  return {
    sdk, props, render,
    get input() { return tree.props.children[0].props; },
    get captured() { return captured; }, get pauses() { return pauses; },
    async ready() { images.forEach(image => imageError ? image.onerror() : image.onload()); await settle(); render(); await settle(); },
    async active(value) { props.state = { ...props.state, gameActive: value, runActive: value }; render(); await settle(); },
    async blur() { windowListeners.get('blur')(); render(); await settle(); },
    async hide() { document.hidden = true; documentListeners.get('visibilitychange')(); render(); await settle(); },
    async unmount() { slots.forEach(slot => slot?.cleanup?.()); await settle(); assert.equal(windowListeners.size, 0); assert.equal(documentListeners.size, 0); },
  };
}
const pointer = (pointerId = 1) => ({ pointerId, button: 0, isPrimary: true, clientX: 130, clientY: 180, preventDefault() {} });

test('real Bubbo field pre-arms host for playable aiming, releases on pause/result/exit, and re-arms on resume', async () => {
  const field = fieldHarness(); await field.ready();
  assert.deepEqual(field.sdk.calls, [], 'menu never owns native gestures');
  await field.active(true);
  assert.deepEqual(field.sdk.calls, ['disable'], 'disabled before the first pointerdown');
  field.input.onPointerDown(pointer());
  assert.equal(field.captured, 1);
  await field.active(false);
  assert.equal(field.captured, null);
  assert.equal(field.sdk.isVerticalSwipesEnabled(), true);
  await field.active(true);
  assert.equal(field.sdk.isVerticalSwipesEnabled(), false);
  await field.unmount();
  assert.equal(field.sdk.isVerticalSwipesEnabled(), true);
});

test('Bubbo loading and failed art do not acquire native gesture ownership', async () => {
  const loading = fieldHarness({ active: true });
  await settle(); assert.deepEqual(loading.sdk.calls, []); await loading.unmount();
  const failed = fieldHarness({ active: true, imageError: true });
  await failed.ready(); assert.deepEqual(failed.sdk.calls, []); await failed.unmount();
});

test('Bubbo pointercancel/capture loss cancel aiming; blur/hidden pause and release the native host', async () => {
  for (const reason of ['blur', 'hide']) {
    const field = fieldHarness({ active: true }); await field.ready();
    field.input.onPointerDown(pointer()); field.input.onPointerCancel(pointer());
    assert.equal(field.captured, null);
    assert.equal(field.sdk.isVerticalSwipesEnabled(), false, 'next aiming gesture remains protected while playing');
    field.input.onPointerDown(pointer(2)); field.input.onLostPointerCapture(pointer(2));
    assert.equal(field.captured, null);
    field.input.onPointerDown(pointer(3)); await field[reason]();
    assert.equal(field.captured, null); assert.equal(field.pauses, 1);
    assert.equal(field.sdk.isVerticalSwipesEnabled(), true);
    await field.unmount();
  }
});

test('actual Pixi compatibility adapter cannot release Bubbo ownership and remains idempotent', async () => {
  const sdk = mockSdk();
  const source = fs.readFileSync(new URL('../src/platform/telegram.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const api = vm.runInNewContext(source + '\ntelegramSdkPromise = Promise.resolve(sdkMock); ({ acquireGameGesture, setGameGestureActive });', { createGameGestureController, sdkMock: sdk });
  const bubbo = api.acquireGameGesture(); await settle();
  api.setGameGestureActive(false);
  assert.equal(sdk.isVerticalSwipesEnabled(), false);
  api.setGameGestureActive(true); api.setGameGestureActive(true); await settle();
  bubbo(); assert.equal(sdk.isVerticalSwipesEnabled(), false);
  api.setGameGestureActive(false); api.setGameGestureActive(false);
  assert.deepEqual(sdk.calls, ['disable', 'enable']);
});
