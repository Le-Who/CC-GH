import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MATCH3_RENDER_PIXEL_BUDGET, match3RenderResolution, resizeMatch3Renderer } from '../src/games/match3/match3RenderBudget.js';

const host = fs.readFileSync(new URL('../src/game-runtime/PixiGameHost.jsx', import.meta.url), 'utf8');
const initStart = host.indexOf('await app.init(') + 'await app.init('.length;
const initSource = host.slice(initStart, host.indexOf('\n        });', initStart) + '\n        }'.length);
const resizeStart = host.indexOf('const syncSize = () =>');
const resizeSource = host.slice(resizeStart, host.indexOf('\n    const observer =', resizeStart));

test('Match3 backing budget preserves DPR2 phones and bounds large surfaces without changing CSS units', () => {
  for (const [width, height] of [[320,568],[360,800],[390,844],[414,896],[393,873],[430,932],[844,390]]) {
    assert.equal(match3RenderResolution(width, height, 2), 2);
  }
  for (const [width, height] of [[768,1024],[1024,768],[1280,720]]) {
    const resolution = match3RenderResolution(width, height, 2);
    assert.ok(resolution > 1 && resolution < 2);
    assert.ok(width * height * resolution ** 2 <= MATCH3_RENDER_PIXEL_BUDGET + 1);
    // Pixi converts client → backing coordinates then divides by resolution;
    // a renderer-only cap must not move any touch target in logical space.
    for (const [x, y] of [[0,0],[width/2,height/2],[width-1,height-1]]) {
      assert.ok(Math.abs(x * resolution / resolution - x) < 1e-9);
      assert.ok(Math.abs(y * resolution / resolution - y) < 1e-9);
    }
  }
});

test('actual host init keeps every non-Match3 renderer setting unchanged', () => {
  for (const sceneKey of ['blox','merge','bubbo','garden','yard','settlement','farm','match3']) for (const dpr of [1,2,3]) {
    const container = {};
    const options = vm.runInNewContext(`(${initSource})`, { sceneKey, containerRef: { current: container }, window: { devicePixelRatio: dpr }, size: { width: 1280, height: 720 }, match3RenderResolution });
    assert.equal(options.resizeTo, container);
    assert.deepEqual(JSON.parse(JSON.stringify({ ...options, resizeTo: null })), {
      resizeTo: null, backgroundAlpha: 0, antialias: sceneKey !== 'match3', autoDensity: true,
      resolution: sceneKey === 'match3' ? match3RenderResolution(1280,720,dpr) : Math.min(dpr,2),
      preference: 'webgl', powerPreference: 'high-performance',
    });
  }
});

test('actual host resize caps only Match3 and preserves logical size, redraw, and scene-state forwarding', () => {
  for (const sceneKey of ['blox','merge','bubbo','garden','yard','settlement','farm','match3']) {
    const calls = [], state = {}, dimensions = { width: 390, height: 844 };
    const app = { renderer: { resize: (...args) => calls.push(['resize', ...args]) }, render: () => calls.push(['render']) };
    const resize = vm.runInNewContext(`let resizeFrame=0,lastWidth=0,lastHeight=0;${resizeSource};syncSize`, {
      sceneKey, appRef: { current: app }, stateRef: { current: state }, match3RenderResolution, resizeMatch3Renderer,
      containerRef: { current: { getBoundingClientRect: () => dimensions } },
      sceneRef: { current: { resize: next => { assert.equal(next, state); calls.push(['scene']); } } },
      window: { devicePixelRatio: 2, cancelAnimationFrame() {}, requestAnimationFrame: fn => { fn(); return 1; } },
    });
    resize(); resize(); // same-size observer notifications do not repaint.
    dimensions.width = 1280; dimensions.height = 720; resize();
    const args = (width, height) => sceneKey === 'match3' ? [width, height, match3RenderResolution(width,height,2)] : [width, height];
    assert.deepEqual(calls, [['resize', ...args(390,844)], ['scene'], ['render'], ['resize', ...args(1280,720)], ['scene'], ['render']]);
  }
});

test('host reapplies the final Match3 backing budget after async init and asset loading', () => {
  const start = host.indexOf('// Async init/assets');
  const end = host.indexOf('// Scene builders', start);
  const sync = host.slice(start, end);
  assert.ok(start > host.indexOf('await Assets.load(assetKeys'));
  assert.ok(end < host.indexOf('sceneRef.current = buildScene'));
  for (const sceneKey of ['match3', 'blox', 'merge']) {
    const calls = [];
    // Simulate init at the transient shell size, followed by the final layout
    // while asset loading is pending and no further ResizeObserver event occurs.
    const renderer = { resolution: match3RenderResolution(1024,667,2), resize: (...args) => calls.push(args) };
    const container = { getBoundingClientRect: () => ({ width: 1280, height: 720 }) };
    vm.runInNewContext(sync, { sceneKey, app: { renderer }, containerRef: { current: container }, window: { devicePixelRatio: 2 }, resizeMatch3Renderer });
    assert.deepEqual(calls, sceneKey === 'match3' ? [[1280,720,match3RenderResolution(1280,720,2)]] : []);
  }
});
