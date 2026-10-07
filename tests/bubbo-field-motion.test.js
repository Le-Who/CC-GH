/** Real component + real aim/flight/effects under a deterministic DOM/Canvas contract.
 * These are functional tests, not browser screenshots or visual acceptance. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createBubboRun } from '../src/game-core/bubbo/engine.js';
import { bubboFieldGeometry } from '../src/games/bubbo/bubboComposition.js';
import * as aim from '../src/games/bubbo/bubboAim.js';
import * as motion from '../src/games/bubbo/bubboMotion.js';
import * as effects from '../src/games/bubbo/bubboEffects.js';
import * as canvasEffects from '../src/games/bubbo/bubboEffectsCanvas.js';

const file = fs.readFileSync(new URL('../src/games/bubbo/BubboField.jsx', import.meta.url), 'utf8');
const source = file.replace(/^import .*;\s*$/gm, '').replace(/^export default BubboField;\s*$/m, '');
const flush = async () => { for(let i=0;i<4;i++) await Promise.resolve(); };

async function fieldHarness({ width = 700, height = 390, reducedMotion = false } = {}) {
  let hook = 0, nextFrame = 0, now = 100, captured = null, tree, disposed = false;
  const slots = [], pending = [], frames = new Map(), images = [], events = [], draws = [];
  const listeners = new Map(), documentListeners = new Map(), mediaListeners = new Map();
  const document = { hidden: false, addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: name => documentListeners.delete(name) };
  const media = { matches: reducedMotion, addEventListener: (name, fn) => mediaListeners.set(name, fn), removeEventListener: name => mediaListeners.delete(name) };
  const ctx = new Proxy({ drawImage: (image, ...args) => draws.push({ image: image.src, args }),
    createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => object[key] ?? (() => {}) });
  const canvas = { width: 0, height: 0, dataset: {}, getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 70, top: 30, right: 70 + props.width, bottom: 30 + props.height, width: props.width, height: props.height }),
    focus() {}, setPointerCapture: id => { captured = id; }, hasPointerCapture: id => captured === id,
    releasePointerCapture: id => { if (captured === id) captured = null; } };
  const React = {
    forwardRef: fn => fn,
    useRef(value) { const index = hook++; return slots[index] ??= { current: value }; },
    useState(value) { const index = hook++; slots[index] ??= { value }; return [slots[index].value, next => { slots[index].value = next; }]; },
    useImperativeHandle(ref, factory) { if(ref)ref.current = factory(); },
    useLayoutEffect(fn, deps) { return this.useEffect(fn, deps); },
    useEffect(fn, deps) { const index = hook++, previous = slots[index];
      if(!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const component = vm.runInNewContext(source + '\nBubboField', {
    React, jsxRuntime: { jsx, jsxs: jsx }, ...aim, ...motion, ...effects, ...canvasEffects,
    bubboFieldGeometry, BUBBO_TOKEN_ART: ['mint','amber','coral','sky','berry'], bubboArtUrl: key => key,
    acquireGameGesture: () => () => {}, document,
    window: { devicePixelRatio: 2, matchMedia: () => media, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame: id => frames.delete(id),
    Image: class { constructor() { this.complete = true; this.naturalWidth = 320; images.push(this); } },
  });
  const props = { width, height, nextLabel: 'Next', state: { ...createBubboRun('field-motion'), current: 'mint', next: 'coral', gameActive: true, runActive: true },
    onShotStart: color => events.push({ kind: 'start', color }), onFire: (row,col,path,color) => events.push({ kind: 'fire', row,col,path,color }),
    onBusy: busy => events.push({ kind: 'busy', busy }), onAim: angle => events.push({ kind: 'aim', angle }),
    onPause: () => { events.push({ kind: 'pause' }); props.state = { ...props.state, gameActive: false }; render(); } };
  function render() { hook = 0; tree = component(props, null); tree.props.children[0].props.ref.current = canvas; pending.splice(0).forEach(fn => fn()); }
  function frame(ms = 16) { assert.equal(disposed, false); now += ms; const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn(now)); }
  render(); images.forEach(image => image.onload()); await flush(); render(); frame();
  return { props, events, canvas, frames, draws, render, frame,
    get input() { return tree.props.children[0].props; }, get captured() { return captured; },
    get session() { return slots.find(slot => slot?.current?.ambience)?.current; },
    change(patch) { props.state = { ...props.state, ...patch }; render(); frame(); },
    resize(nextWidth,nextHeight) { props.width=nextWidth;props.height=nextHeight;render();frame(); },
    blur() { listeners.get('blur')();frame(); },
    hide() { document.hidden=true;documentListeners.get('visibilitychange')(); },
    show() { document.hidden=false;documentListeners.get('visibilitychange')();frame(); },
    reduce(value) { media.matches=value;mediaListeners.get('change')();frame(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.());disposed=true;assert.equal(frames.size,0);assert.equal(listeners.size,0);assert.equal(documentListeners.size,0);assert.equal(mediaListeners.size,0); },
  };
}
const pointer = (extra = {}) => ({ pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 270, clientY: 180, preventDefault() {}, ...extra });
const count = (field, kind) => field.events.filter(event => event.kind === kind).length;

for(const pointerType of ['mouse', 'touch']) for(const [width,height] of [[304,360],[700,390]]) {
  test(`${pointerType} ${width}x${height}: captured release outside fires once with a clamped trajectory`, async () => {
    for(const end of [{clientX:-200,clientY:180},{clientX:1600,clientY:180},{clientX:300,clientY:-100},{clientX:300,clientY:1400}]) {
      const field = await fieldHarness({width,height});
      field.input.onPointerDown(pointer({pointerType}));
      assert.equal(field.captured,1);
      field.input.onPointerMove(pointer({pointerType,...end}));
      const angle = field.session.angle;
      assert.ok(angle >= -Math.PI + .18 && angle <= -.18);
      field.input.onPointerUp(pointer({pointerType,...end}));
      field.input.onPointerUp(pointer({pointerType,...end}));
      assert.equal(field.captured,null);
      assert.equal(count(field,'start'),1);
      for(let i=0;i<60;i++) field.frame();
      assert.equal(count(field,'fire'),1);
      assert.equal(field.session.flight,null);
      field.unmount();
    }
  });
}

test('unowned release, start outside, secondary pointer and foreign cancellation cannot fire or steal capture', async () => {
  const field=await fieldHarness();
  field.input.onPointerUp(pointer());
  field.input.onPointerDown(pointer({clientX:10}));
  field.input.onPointerUp(pointer());
  field.input.onPointerDown(pointer({button:2}));
  field.input.onPointerDown(pointer({isPrimary:false}));
  assert.equal(count(field,'start'),0);
  assert.equal(field.captured,null);
  field.input.onPointerDown(pointer());
  field.input.onPointerDown(pointer({pointerId:2}));
  field.input.onPointerMove(pointer({pointerId:2,clientX:1200}));
  field.input.onPointerCancel(pointer({pointerId:2}));
  field.input.onLostPointerCapture(pointer({pointerId:2}));
  field.input.onPointerUp(pointer({pointerId:2}));
  assert.equal(field.captured,1);
  assert.equal(count(field,'start'),0);
  field.input.onPointerUp(pointer({clientX:1400}));
  assert.equal(count(field,'start'),1);
  field.unmount();
});

for(const reason of ['cancel','capture-loss','blur','hidden','pause','resize','exit']) test(`${reason}: an interrupted gesture never fires on late release`, async () => {
  const field=await fieldHarness();
  field.input.onPointerDown(pointer());
  if(reason==='cancel')field.input.onPointerCancel(pointer());
  if(reason==='capture-loss')field.input.onLostPointerCapture(pointer());
  if(reason==='blur')field.blur();
  if(reason==='hidden')field.hide();
  if(reason==='pause')field.change({gameActive:false});
  if(reason==='resize')field.resize(304,360);
  if(reason==='exit')field.unmount();
  field.input.onPointerUp(pointer({clientX:1400}));
  assert.equal(field.captured,null);
  assert.equal(count(field,'start'),0);
  if(reason!=='exit')field.unmount();
});

test('idle gain fades on touch/keyboard aim and flight; centers and collision data stay unchanged', async () => {
  const field=await fieldHarness();
  const geometry=field.canvas.dataset.bubboGeometry;
  for(let i=0;i<100;i++)field.frame(20);
  assert.equal(field.session.ambience.gain,1);
  field.input.onPointerDown(pointer());
  for(let i=0;i<7;i++)field.frame(20);
  assert.equal(field.session.ambience.gain,0);
  field.input.onPointerCancel(pointer());
  for(let i=0;i<100;i++)field.frame(20);
  field.input.onKeyDown({key:'ArrowLeft',preventDefault(){}});
  for(let i=0;i<7;i++)field.frame(20);
  assert.equal(field.session.ambience.gain,0);
  field.input.onKeyDown({key:' ',preventDefault(){}});
  field.frame();
  assert.equal(field.session.ambience.gain,0);
  assert.equal(field.canvas.dataset.bubboGeometry,geometry);
  field.unmount();
});

test('pause/hidden stop animation scheduling, resume freezes flight debt, reduced motion clears FX', async () => {
  const field=await fieldHarness();
  field.input.onKeyDown({key:' ',preventDefault(){}});
  field.frame(30);
  const progress=field.session.flight.progress;
  field.blur();
  assert.equal(field.frames.size,0);
  field.frame(20000);
  assert.equal(field.session.flight.progress,progress);
  field.change({gameActive:true});
  assert.equal(field.session.flight.progress,progress,'wake frame has no catch-up delta');
  field.hide();
  assert.equal(field.frames.size,0);
  field.show();
  assert.equal(field.frames.size,0,'hidden pause remains paused after showing');
  field.change({gameActive:true});
  for(let i=0;i<60;i++)field.frame();
  field.change({lastShot:{id:'pop',color:'mint',landed:{row:2,col:2},popped:[{row:2,col:2}],dropped:[]}});
  assert.ok(field.session.effects.length>0);
  field.reduce(true);
  assert.equal(field.session.effects.length,0);
  assert.equal(field.session.ambience.gain,0);
  field.unmount();
});

test('reaction snapshots are bounded and cleaned on resize/new run; old events do not replay after pause', async () => {
  const field=await fieldHarness();
  field.change({lastShot:{id:'one',color:'mint',landed:{row:2,col:2},popped:[{row:2,col:2}],dropped:[]}});
  assert.ok(field.session.effects.length>0);
  field.resize(304,360);
  assert.equal(field.session.effects.length,0);
  field.change({gameActive:false});field.change({gameActive:true});
  assert.equal(field.session.effects.length,0);
  field.change({seed:'new',lastShot:null});
  assert.equal(field.session.effects.length,0);
  assert.equal(field.session.ambience.gain,0);
  field.unmount();
});


test('keyboard fire consumes captured gesture, preventing a second shot on delayed pointer release', async () => {
  const field=await fieldHarness();
  field.input.onPointerDown(pointer());
  field.input.onKeyDown({key:' ',preventDefault(){}});
  assert.equal(field.captured,null);
  for(let i=0;i<60;i++)field.frame();
  assert.equal(count(field,'fire'),1);
  field.input.onPointerUp(pointer({clientX:1400}));
  assert.equal(count(field,'start'),1);
  field.unmount();
});


test('layout commit cancels capture before the resize frame can run', async () => {
  const field=await fieldHarness();
  field.input.onPointerDown(pointer());
  field.props.width=304;field.props.height=360;field.render();
  assert.equal(field.captured,null);
  field.input.onPointerUp(pointer({clientX:1400}));
  assert.equal(count(field,'start'),0);
  field.unmount();
});


test('survivor reaction reaches the real canvas draw and expires without moving centers',async()=>{
  const field=await fieldHarness();
  const board=field.props.state.board.map(row=>[...row]);
  board[3][4]=null;
  field.change({board,lastShot:{id:'local-hit',landed:{row:3,col:4},popped:[{row:3,col:4}],dropped:[]}});
  assert.ok(field.session.reactions.length>0);
  const geometry=JSON.parse(field.canvas.dataset.bubboGeometry);
  field.draws.length=0;
  for(let i=0;i<7;i++)field.frame(20);
  assert.ok(field.draws.some(draw=>draw.args.at(-1)>geometry.cell*.99&&draw.args.at(-1)<=geometry.cell*.99*1.025),'live survivor art breathes gently');
  assert.equal(field.props.state.board,board,'presentation does not replace the board');
  for(let i=0;i<20;i++)field.frame(20);
  assert.equal(field.session.reactions.length,0);
  field.unmount();
});

for(const reason of ['pause','resize','reduce','row-shift','refill','new-run','blur','hidden'])test(`${reason}: survivor reaction never leaks to a later board or lifecycle`,async()=>{
  const field=await fieldHarness();
  const shot={id:'local-hit',landed:{row:3,col:4},popped:[],dropped:[]};
  field.change({lastShot:shot});
  assert.ok(field.session.reactions.length>0);
  if(reason==='pause')field.change({gameActive:false});
  if(reason==='resize')field.resize(304,360);
  if(reason==='reduce')field.reduce(true);
  if(reason==='row-shift')field.change({rowOffset:1});
  if(reason==='refill')field.change({waveIndex:field.props.state.waveIndex+1,lastShot:{...shot,id:'refill-hit'}});
  if(reason==='new-run')field.change({seed:'new-run'});
  if(reason==='blur')field.blur();
  if(reason==='hidden')field.hide();
  assert.equal(field.session.reactions.length,0);
  field.unmount();
});
