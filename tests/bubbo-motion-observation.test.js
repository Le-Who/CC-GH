import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { observeBubboShot } from './e2e/helpers/bubboMotionObservation.js';

function harness(initialReward = null) {
  let now = 0, reward = initialReward;
  const observers = [];
  const document = { hidden: false };
  const lane = { querySelector: () => reward };
  const canvas = { dataset: { shots: '0', bubboFx: JSON.stringify({ effects: 0, playing: true }) }, closest: () => ({ querySelector: () => lane }) };
  const window = {};
  const observe = vm.runInNewContext(`(${observeBubboShot.toString()})`, {
    window, document, innerWidth: 1280, innerHeight: 720, performance: { now: () => now },
    getComputedStyle: node => node.style,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = true; observers.push(this); }
      observe() {} disconnect() { this.active = false; }
    },
  });
  return { canvas, document, window, observers,
    get data() { return window.__bubboShotObservation.data; },
    start(number = 1) { observe(canvas, number); },
    change({ shot, effects, label, elapsed = 16 } = {}) {
      now += elapsed;
      if (shot !== undefined) canvas.dataset.shots = String(shot);
      if (effects !== undefined) canvas.dataset.bubboFx = JSON.stringify({ effects, playing: true });
      if (label !== undefined) reward = label;
      observers.filter(observer => observer.active).forEach(observer => observer.callback());
    },
  };
}
const label = (text = 'Bomb +100', style = {}) => ({
  textContent: text, style: { display: 'inline', visibility: 'visible', opacity: '.65', ...style },
  getBoundingClientRect: () => ({ x: 880, y: 675, left: 880, top: 675, right: 1020, bottom: 695, width: 140, height: 20 }),
});

test('atomic recorder retains a real burst and visible reward after a slow remote round trip', () => {
  const h = harness(); h.start();
  h.change({ shot: 1, effects: 5, label: label() });
  assert.equal(h.data.firstResultFrame.effects, 5);
  assert.equal(h.data.reward.visible, true);
  // Reproduce CI3: burst has expired before the first external fx() read, and
  // a screenshot can finish after the reward's own TTL. Evidence must survive.
  h.change({ effects: 0, label: null, elapsed: 3000 });
  assert.equal(JSON.parse(h.canvas.dataset.bubboFx).effects, 0);
  assert.equal(h.data.firstResultFrame.effects, 5);
  assert.equal(h.data.maxEffects, 5);
  assert.equal(h.data.reward.text, 'Bomb +100');
  assert.equal(h.data.transitions.at(-1).effects, 0);
});

test('a previous reward inside its TTL cannot satisfy another shot', () => {
  const old = label(), h = harness(old); h.start(2);
  h.change({ shot: 2, effects: 8 });
  assert.equal(h.data.reward, null);
  h.change({ label: label('Lightning +175') });
  assert.equal(h.data.reward.text, 'Lightning +175');
});

test('missing burst or invisible reward stays failed rather than being inferred from score', () => {
  const h = harness(); h.start();
  h.change({ shot: 1, effects: 0, label: label('Bomb +100', { display: 'none' }) });
  assert.equal(h.data.firstResultFrame.effects, 0);
  assert.equal(h.data.positiveSamples, 0);
  assert.equal(h.data.reward, null);
  h.change({ label: label('Bomb +100', { opacity: '0' }) });
  assert.equal(h.data.reward, null);
  h.change({ label: label('Bomb +100', { visibility: 'hidden' }) });
  assert.equal(h.data.reward, null);
  h.change({ label: label() });
  assert.equal(h.data.reward.visible, true);
  assert.equal(h.data.firstResultFrame.effects > 0 && h.data.reward.visible, false);
});

test('wrong shot, offscreen reward and hidden document are not positive observations', () => {
  const h = harness(); h.start(2);
  h.change({ shot: 1, effects: 4, label: label() });
  assert.equal(h.data.firstResultFrame, null);
  h.document.hidden = true;
  h.change({ shot: 2, effects: 4 });
  assert.equal(h.data.firstResultFrame, null);
  h.document.hidden = false;
  const offscreen = label();
  offscreen.getBoundingClientRect = () => ({ x: 1500, y: 0, left: 1500, top: 0, right: 1600, bottom: 20, width: 100, height: 20 });
  h.change({ label: offscreen });
  assert.equal(h.data.reward, null);
});

test('observation is bounded and replacement disconnects the old recorder', () => {
  const h = harness(); h.start();
  for (let i = 0; i < 100; i++) h.change({ shot: 1, effects: i % 33 });
  assert.equal(h.data.transitions.length, 64);
  assert.equal(h.data.maxEffects, 32);
  const before = JSON.stringify(h.canvas.dataset);
  h.start(2);
  assert.equal(h.observers[0].active, false);
  assert.equal(JSON.stringify(h.canvas.dataset), before, 'recorder never changes runtime data');
  assert.equal(h.data.firstResultFrame, null);
  h.window.__bubboShotObservation.stop();
  assert.equal(h.observers[1].active, false);
});
