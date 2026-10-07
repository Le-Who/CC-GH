import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as geometry from '../src/game-runtime/sceneGeometry.js';
import * as pointer from '../src/game-runtime/pointerSession.js';
import * as engine from '../src/game-core/match3/engine.js';
import * as animation from '../src/game-core/match3/animation.js';
import * as motion from '../src/game-core/match3/motion.js';
const require = createRequire(import.meta.url), ast = require('../recovery-tools/ast-recovery.cjs');
const { createPixiMock, loadClosure } = require('./fixtures/pixi-mock.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const boardFixture = () => Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ['fire', 'water', 'earth', 'air', 'light', 'dark'][(x + y * 2) % 6]));
function harness(width = 390, height = 844, reduced = false, idleTimers = false) {
  let now = 0;
  const env = createPixiMock({ width, height, publicRoot: root + 'public', coarse: reduced });
  const timers = new Map(); let timerId = 0;
  if (idleTimers) {
    env.window.setTimeout = (fn, ms) => { timers.set(++timerId, {fn, at:now+ms}); return timerId; };
    env.window.clearTimeout = id => timers.delete(id);
  }
  env.app.renderer.resolution = 2;
  env.ctx.Container.prototype.cacheAsTexture = function(options) { this.isCachedAsTexture = options !== false; this.cacheOptions = options; this.cacheWrites = (this.cacheWrites || 0) + 1; };
  env.app.ticker.started = true;
  env.app.start = () => { env.app.ticker.started = true; };
  env.app.stop = () => { env.app.ticker.started = false; };
  env.app.renderCount = 0;
  env.app.render = () => { env.app.renderCount++; };
  const art = loadClosure(root + 'src/games/match3/match3Art.js', ['MATCH3_NINE_SLICE', 'MATCH3_GEM_ART', 'match3ArtUrl'], { assetUrl: x => x }, ast);
  const layout = loadClosure(root + 'src/games/match3/match3Composition.js', ['composeMatch3'], { match3LayoutDefaults: JSON.parse(fs.readFileSync(root + 'src/app/hud-layout/defaultLayouts/match3.json')) }, ast);
  const source = fs.readFileSync(root + 'src/game-runtime/scenes/match3Scene.js', 'utf8');
  const imports = ast.acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body.filter(n => n.type === 'ImportDeclaration');
  const names = imports.find(n => n.source.value === './shared/runtime.js').specifiers.map(n => n.imported.name);
  const runtime = loadClosure(root + 'src/game-runtime/scenes/shared/runtime.js', names, { ...env.ctx, ...geometry, ...pointer, ...engine, ...animation, resolveAssetUrl: x => x }, ast);
  const ctx = { ...env.ctx, ...runtime, ...art, ...layout, ...motion, performance: { now: () => now } };
  const code = ast.extract(root + 'src/game-runtime/scenes/match3Scene.js', ['match3GemAsset', 'createMatch3BoardFrame', 'buildMatch3Scene']);
  const build = vm.runInNewContext(code + ';buildMatch3Scene', ctx), log = [];
  const composition = layout.composeMatch3({ width, height, safe: {} });
  let data = { match3: { board: boardFixture(), gameActive: true, inputLocked: false }, match3Composition: composition,
    onMatch3Cell: (...args) => log.push(['cell', ...args]), onMatch3Swap: (...args) => log.push(['swap', ...args]),
    onMatch3AnimationComplete: id => log.push(['complete', id]), onMatch3MotionPhase: info => log.push(['phase', info]) };
  const scene = build(env.app, data); env.flush();
  return { env, scene, composition, log, get data() { return data; },
    elapse: ms => { now += ms; },
    timers,
    advanceIdle: ms => { now += ms; for (const [id,timer] of [...timers]) if(timer.at<=now){timers.delete(id);timer.fn();} env.flush(); },
    targets: () => env.app.stage.children[0].children.filter(node => node.eventMode === 'static'),
    gems: () => env.app.stage.children[1].children.filter(node => node.visible),
    tick: (ms = 1000 / 60) => { now += ms; for (const tick of env.tickers) tick({ deltaTime: Math.min(100, ms) * .06, deltaMS: Math.min(100, ms) }); env.flush(); },
    update: patch => { data = { ...data, ...patch }; scene.update(data); env.flush(); },
  };
}
function startAnimation(h, type = 'cascade') {
  const board = h.data.match3.board.map(row => [...row]);
  board[0][0] = 'special_row'; board[0][3] = 'special_column'; board[5][0] = 'drop_gold';
  const from = { x: 0, y: 0 }, to = { x: 1, y: 0 };
  const result = type === 'invalid' ? { board, steps: [] } : engine.attemptMatch3Move(board, from, to, { collectDrops: true });
  const descriptor = { id: type + '-1', type, from, to, startBoard: board, steps: result.steps, finalBoard: result.board };
  h.update({ match3: { ...h.data.match3, board: result.board, inputLocked: true }, match3Animation: descriptor });
  return descriptor;
}
const poseSnapshot = h => h.gems().map(node => ({ x: node.x, y: node.y, scaleX: node.scale.x, scaleY: node.scale.y, alpha: node.alpha, type: node.gemType }));

test('Match3 preserves composition, all 64 full-cell targets, and pooled gem fit at every required viewport', () => {
  for (const [width, height] of [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]]) {
    const h = harness(width, height);
    assert.equal(h.targets().length, 64); assert.equal(h.gems().length, 64);
    for (const target of h.targets()) { assert.equal(target.hitArea.width, h.composition.board.cell); assert.equal(target.hitArea.height, h.composition.board.cell); }
    for (const gem of h.gems()) assert.ok(gem.children[0].width <= h.composition.board.cell * .86 + .001);
    assert.equal(h.env.app.stage.children[1].mask ?? null, null);
    assert.equal(h.env.app.stage.children[2].mask ?? null, null);
    h.scene.destroy(); h.env.flush();
    assert.equal(h.env.tickers.size, 0); assert.equal(h.env.window.listenerCount, 0); assert.equal(h.env.document.listenerCount, 0);
  }
});

test('tap, adjacent long swipe and pointer cancellations preserve input intent', () => {
  for (const operation of ['tap','swipe','cancel','blur','hidden','pause','resize','destroy']) {
    const h = harness(), { board } = h.composition;
    const start = h.env.event(board.left + 3.5 * board.cell, board.top + 4.5 * board.cell);
    h.targets()[35].emit('pointerdown', start);
    if (operation === 'tap') h.env.app.stage.emit('pointerup', start);
    else {
      const end = h.env.event(start.global.x + board.cell * 2.35, start.global.y);
      h.env.app.stage.emit('globalpointermove', end); h.env.flush();
      if (operation === 'swipe') h.env.app.stage.emit('pointerup', end);
      if (operation === 'cancel') h.env.app.stage.emit('pointercancel', end);
      if (operation === 'blur') h.env.window.emit('blur');
      if (operation === 'hidden') { h.env.document.visibilityState = 'hidden'; h.env.document.emit('visibilitychange'); }
      if (operation === 'pause') h.update({ match3: { ...h.data.match3, gameActive: false } });
      if (operation === 'resize') h.scene.resize(h.data);
      if (operation === 'destroy') h.scene.destroy();
    }
    h.env.flush();
    if (operation === 'tap') assert.deepEqual(h.log, [['cell',3,4]]);
    else if (operation === 'swipe') assert.deepEqual(JSON.parse(JSON.stringify(h.log)), [['swap',{x:3,y:4},{x:4,y:4}]]);
    else assert.deepEqual(h.log, []);
    if (operation !== 'destroy') h.scene.destroy(); h.env.flush();
    assert.equal(h.env.tickers.size, 0); assert.equal(h.env.window.listenerCount, 0); assert.equal(h.env.document.listenerCount, 0);
  }
});

test('cascade uses exactly one view per gem and never exposes delayed future FX', () => {
  const h = harness(); const descriptor = startAnimation(h);
  assert.equal(h.gems().length, 64);
  assert.equal(h.env.app.stage.children[2].children.filter(node => node.visible).length, 0);
  const initialPool = h.env.app.stage.children[1].children;
  for (let n = 0; n < 1000 && !h.log.some(item => item[0] === 'complete'); n++) {
    h.tick(); assert.ok(h.gems().length <= 64);
    assert.ok(h.env.app.stage.children[2].children.length <= motion.MATCH3_MOTION.maxBursts);
  }
  assert.equal(h.env.app.stage.children[1].children.length, initialPool.length);
  assert.deepEqual(h.log.filter(item => item[0] === 'complete'), [['complete', descriptor.id]]);
  h.update({}); h.tick(40);
  assert.equal(h.log.filter(item => item[0] === 'complete').length, 1, 'same descriptor cannot replay');
  h.scene.destroy(); h.env.flush();
});

test('pause and hidden time freeze poses and keep completion pending until resume', () => {
  const h = harness(); startAnimation(h); h.tick(60);
  const before = poseSnapshot(h);
  h.update({ match3: { ...h.data.match3, gameActive: false } });
  for (let n = 0; n < 100; n++) h.tick(1000);
  assert.deepEqual(poseSnapshot(h), before); assert.equal(h.log.filter(item => item[0] === 'complete').length, 0);
  h.update({ match3: { ...h.data.match3, gameActive: true } }); h.tick(0);
  assert.deepEqual(poseSnapshot(h), before, 'resume rebases at the actual boundary');
  h.env.document.visibilityState = 'hidden'; h.env.document.emit('visibilitychange'); h.tick(10000);
  assert.deepEqual(poseSnapshot(h), before);
  h.env.document.visibilityState = 'visible'; h.env.document.emit('visibilitychange'); h.tick(0);
  assert.deepEqual(poseSnapshot(h), before);
  for (let n = 0; n < 1000 && !h.log.some(item => item[0] === 'complete'); n++) h.tick();
  assert.equal(h.log.filter(item => item[0] === 'complete').length, 1);
  h.scene.destroy(); h.env.flush();
});

test('a slow foreground frame uses real elapsed time rather than capped Pixi deltaMS', () => {
  const h = harness(); startAnimation(h, 'invalid');
  h.tick(250); // Pixi reports only 100 ms; the 180 ms animation is already due.
  assert.deepEqual(h.log.filter(item => item[0] === 'complete'), [['complete', 'invalid-1']]);
  assert.equal(h.env.app.canvas.dataset.match3MotionPhase, 'idle');
  assert.equal(h.env.app.ticker.started, false);
  h.scene.destroy(); h.env.flush();
});

test('active state-update rendering is counted, rather than becoming an artificial pause', () => {
  const h = harness(); startAnimation(h, 'invalid');
  const chrome = h.env.app.stage.children[0], remove = chrome.removeChildren.bind(chrome);
  chrome.removeChildren = () => { h.elapse(250); return remove(); };
  h.update({ match3Composition: { ...h.data.match3Composition } });
  h.tick(0);
  assert.deepEqual(h.log.filter(item => item[0] === 'complete'), [['complete', 'invalid-1']]);
  chrome.removeChildren = remove;
  h.scene.destroy(); h.env.flush();
});

test('static chrome is cached once across selections and board changes, with live hit targets and resize invalidation', () => {
  const h = harness(), chrome = h.env.app.stage.children[0];
  assert.equal(chrome.isCachedAsTexture, true);
  assert.deepEqual(JSON.parse(JSON.stringify(chrome.cacheOptions)), { resolution: 2, antialias: false });
  const writes = chrome.cacheWrites, targets = h.targets();
  h.update({ selectedGem: { x: 2, y: 2 } });
  assert.equal(chrome.cacheWrites, writes);
  assert.deepEqual(h.targets(), targets);
  startAnimation(h);
  for (let i = 0; i < 30; i++) h.tick(16);
  assert.equal(chrome.cacheWrites, writes, 'accepted boards and phases do not rebuild static artwork');
  h.env.app.renderer.resolution = Math.sqrt(1_750_000 / (1280 * 720));
  h.scene.resize(h.data);
  assert.ok(chrome.cacheWrites > writes, 'layout changes refresh cached pixels');
  assert.equal(chrome.cacheOptions.resolution, h.env.app.renderer.resolution, 'a new backing density is applied to the refreshed cache');
  assert.equal(h.targets().length, 64);
  h.scene.destroy(); h.env.flush();
  assert.equal(chrome.isCachedAsTexture, false, 'teardown releases the cached render group');
});

test('phase changes retain pooled Sprite objects and HUD-only updates retain board chrome', () => {
  const h = harness(); startAnimation(h);
  const sprites = h.env.app.stage.children[1].children.map(view => view.art);
  const chrome = [...h.env.app.stage.children[0].children];
  h.update({ onMatch3MotionPhase: () => {} });
  assert.deepEqual(h.env.app.stage.children[0].children, chrome);
  for (let i = 0; i < 30; i++) h.tick(16);
  sprites.forEach((sprite, i) => assert.equal(h.env.app.stage.children[1].children[i].art, sprite));
  h.scene.destroy(); h.env.flush();
});

test('resize reprojects the same in-flight cell coordinates without settling or restarting', () => {
  const h = harness(); startAnimation(h); h.tick(60);
  const old = h.composition.board;
  const normalized = poseSnapshot(h).map(pose => ({ x: (pose.x - old.left) / old.cell, y: (pose.y - old.top) / old.cell }));
  h.env.app.screen.width = 844; h.env.app.screen.height = 390;
  h.scene.resize({ ...h.data, match3Composition: null });
  const { match3BoardLeft, match3BoardTop, match3BoardSize } = h.env.app.canvas.dataset;
  const cell = Number(match3BoardSize) / 8;
  const after = poseSnapshot(h).map(pose => ({ x: (pose.x - Number(match3BoardLeft)) / cell, y: (pose.y - Number(match3BoardTop)) / cell }));
  after.forEach((pose, i) => { assert.ok(Math.abs(pose.x - normalized[i].x) < 1e-8); assert.ok(Math.abs(pose.y - normalized[i].y) < 1e-8); });
  assert.equal(h.log.filter(item => item[0] === 'complete').length, 0);
  h.scene.destroy(); h.env.flush();
});

test('reduced motion has no burst sprites, and teardown removes active timelines/listeners', () => {
  const h = harness(390,844,true); startAnimation(h);
  for (let n = 0; n < 30; n++) h.tick();
  assert.equal(h.env.app.stage.children[2].children.length, 0);
  h.scene.destroy(); h.env.flush();
  assert.equal(h.env.tickers.size, 0); assert.equal(h.env.window.listenerCount, 0); assert.equal(h.env.document.listenerCount, 0);
});

test('idle and drag use on-demand rendering without 64 transparent quads or alternating gem shadows', () => {
  const h = harness();
  assert.equal(h.env.app.ticker.started,false,'idle board must not continuously repaint');
  assert.ok(h.targets().every(node=>node.kind==='Container'&&!node.shape),'hit areas are renderless');
  assert.ok(h.gems().every(node=>node.children.length===1&&node.children[0].kind==='Sprite'),'gem textures remain batchable');
  const renders=h.env.app.renderCount;for(let n=0;n<60;n++)h.tick();assert.equal(h.env.app.renderCount,renders);
  const {board}=h.composition,start=h.env.event(board.left+3.5*board.cell,board.top+4.5*board.cell);
  h.targets()[35].emit('pointerdown',start);
  h.env.app.stage.emit('globalpointermove',h.env.event(start.global.x+board.cell*2.35,start.global.y));h.env.flush();
  assert.equal(h.env.app.ticker.started,false);assert.ok(h.env.app.renderCount>renders);
  h.env.app.stage.emit('pointercancel',start);
  startAnimation(h);assert.equal(h.env.app.ticker.started,true);
  for(let n=0;n<1000&&!h.log.some(item=>item[0]==='complete');n++)h.tick();
  assert.equal(h.env.app.ticker.started,false,'completion stops repainting');
  h.scene.destroy();h.env.flush();
});


test('idle life touches one piece briefly and keeps the ticker asleep between events',()=>{
 const h=harness(390,844,false,true);
 assert.equal(h.timers.size,1);assert.equal(h.env.app.ticker.started,false);
 h.advanceIdle(11999);assert.equal(h.gems().filter(g=>g.rotation!==0).length,0);
 h.advanceIdle(1);h.tick(360);
 assert.equal(h.gems().filter(g=>g.rotation!==0).length,1);
 assert.ok(h.gems().every(g=>Math.abs(g.rotation)<=.025));
 h.tick(360);assert.equal(h.gems().filter(g=>g.rotation!==0).length,0);
 assert.equal(h.env.app.ticker.started,false);assert.equal(h.timers.size,1);
 h.scene.destroy();assert.equal(h.timers.size,0);
});

test('idle life cancels on selection, cascade, hidden, pause, static preference and teardown',()=>{
 for(const stop of ['selected','cascade','hidden','pause','static']){
  const h=harness(390,844,false,true);h.advanceIdle(12000);h.tick(200);
  if(stop==='selected')h.update({selectedGem:{x:1,y:1}});
  if(stop==='cascade')startAnimation(h);
  if(stop==='hidden'){h.env.document.hidden=true;h.env.document.visibilityState='hidden';h.env.document.emit('visibilitychange');}
  if(stop==='pause')h.update({match3:{...h.data.match3,gameActive:false}});
  if(stop==='static')h.update({match3:{...h.data.match3,idleMotion:false}});
  assert.equal(h.timers.size,0,stop);assert.equal(h.gems().filter(g=>g.rotation!==0).length,0,stop);
  h.scene.destroy();assert.equal(h.timers.size,0);
 }
 const reduced=harness(390,844,true,true);assert.equal(reduced.timers.size,0);reduced.scene.destroy();
});
