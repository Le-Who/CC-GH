import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBubboRun } from '../src/game-core/bubbo/engine.js';
import { traceBubboShot } from '../src/games/bubbo/bubboAim.js';
import { bubboFieldGeometry } from '../src/games/bubbo/bubboComposition.js';
import { BUBBO_FX_LIMITS, advanceBubboAmbience, sampleBubboIdle, createBubboShotEffects,
  advanceBubboEffects, sampleBubboEffect } from '../src/games/bubbo/bubboEffects.js';

const ambience = () => ({ time: 0, gain: 0, hold: BUBBO_FX_LIMITS.quietAfterInput });
const shot = { landed: { row: 3, col: 2 }, color: 'mint',
  popped: [{ row: 3, col: 2 }, { row: 2, col: 2 }, { row: 2, col: 3 }],
  dropped: [{ row: 4, col: 3, color: 'coral' }] };

test('idle motion is sparse, deterministic, bounded and cannot alter centers or aim', () => {
  const state = createBubboRun('underwater-motion');
  const before = JSON.stringify(state);
  const geometry = bubboFieldGeometry(304, 360);
  const traces = [-2.9, -2, -1.5, -.2].map(angle => traceBubboShot(state, geometry, angle));
  let clock = ambience(), idleFrames = 0, stillFrames = 0, glintFrames = 0;
  const selected = new Set();
  for (let frame = 0; frame < 60 * 60; frame++) {
    clock = advanceBubboAmbience(clock, 1000 / 60);
    const sample = sampleBubboIdle(state, clock);
    assert.deepEqual(sampleBubboIdle(state, clock), sample);
    if (!sample) { stillFrames++; continue; }
    idleFrames++;
    if (sample.glint > 0) glintFrames++;
    selected.add(`${sample.row}:${sample.col}`);
    assert.ok(sample.row < 8 && state.board[sample.row][sample.col]);
    assert.ok(Math.abs(sample.rotation) <= BUBBO_FX_LIMITS.idleRotation);
    assert.ok(sample.glint >= 0 && sample.glint <= 1);
    assert.equal('x' in sample || 'y' in sample || 'scale' in sample, false);
  }
  assert.ok(idleFrames > 0 && stillFrames > idleFrames, 'more still time than movement');
  assert.ok(glintFrames < idleFrames / 2, 'light is rarer than sway');
  assert.ok(selected.size > 3, 'gestures are not synchronized or pinned to one token');
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual([-2.9, -2, -1.5, -.2].map(angle => traceBubboShot(state, geometry, angle)), traces);
});

test('aim and active flight quench ambient motion, then restore gently after quiet time', () => {
  for (const mode of [{ aiming: true }, { busy: true }]) {
    let clock = { time: 700, gain: 1, hold: 0 };
    for (let i = 0; i < 3; i++) clock = advanceBubboAmbience(clock, 40, mode);
    assert.equal(clock.gain, 0);
    assert.equal(clock.hold, BUBBO_FX_LIMITS.quietAfterInput);
    for (let i = 0; i < 16; i++) clock = advanceBubboAmbience(clock, 50);
    assert.equal(clock.gain, 0, 'no immediate restart after release');
    clock = advanceBubboAmbience(clock, 50);
    assert.ok(clock.gain > 0 && clock.gain <= .1);
  }
});

test('paused, hidden and reduced-motion ambience has no ticking or residual movement', () => {
  for (const mode of [{ playing: false }, { hidden: true }, { reducedMotion: true }]) {
    const next = advanceBubboAmbience({ time: 731, gain: 1, hold: 0 }, 99999, mode);
    assert.equal(next.time, 731);
    assert.equal(next.gain, 0);
    assert.equal(sampleBubboIdle(createBubboRun('rest'), next), null);
  }
  assert.equal(advanceBubboAmbience(ambience(), 99999).time, 50, 'no catch-up storm');
  for (const dt of [-1, NaN, Infinity]) assert.equal(advanceBubboAmbience(ambience(), dt).time, 0);
});

test('shot feedback is deterministic, snapshots original colors, and respects a hard budget', () => {
  const state = createBubboRun('colors');
  const lastShot = structuredClone(shot), original = JSON.stringify(lastShot);
  const fx = createBubboShotEffects(lastShot, { ...state, pressureStep: .4, rowOffset: 1 });
  assert.deepEqual(createBubboShotEffects(lastShot, { ...state, pressureStep: .4, rowOffset: 1 }), fx);
  assert.equal(JSON.stringify(lastShot), original);
  assert.equal(fx[0].kind, 'hit');
  assert.equal(fx.find(effect => effect.kind === 'drop').color, 'coral');
  assert.equal(fx.find(effect => effect.row === 2 && effect.col === 2).color, state.board[2][2]);
  assert.ok(fx.every(effect => effect.pressureStep === .4 && effect.rowOffset === 1));
  const all = Array.from({ length: 99 }, (_, i) => ({ row: Math.floor(i / 9), col: i % 9 }));
  const big = createBubboShotEffects({ ...shot, popped: [...all.slice(0, 50), ...all.slice(0, 50)], dropped: all.slice(50) });
  assert.equal(big.length, BUBBO_FX_LIMITS.maxEffects);
  assert.equal(big.filter(effect => effect.kind === 'pop').length, BUBBO_FX_LIMITS.maxPops);
  assert.equal(big.filter(effect => effect.kind === 'drop').length, BUBBO_FX_LIMITS.maxDrops);
  assert.equal(new Set(big.filter(effect => effect.kind !== 'hit').map(effect => `${effect.row}:${effect.col}`)).size, 31);
  assert.equal(createBubboShotEffects({ popped: [{row: 800,col:0},{row:0,col:-1},null] }).length, 0);
});

test('hit, pop and drop form a short ordered sequence, without disappearance before stagger', () => {
  let fx = createBubboShotEffects(shot);
  assert.equal(fx.find(effect => effect.kind === 'hit').delay, 0);
  assert.ok(fx.find(effect => effect.kind === 'pop').delay < fx.find(effect => effect.kind === 'drop').delay);
  const waiting = sampleBubboEffect(fx.find(effect => effect.kind === 'drop'));
  assert.equal(waiting.waiting, true);
  assert.equal(waiting.visible, true);
  assert.equal(waiting.alpha, 1);
  for (let time = 0; time < 1000; time += 25) {
    for (const effect of fx) {
      const sample = sampleBubboEffect(effect);
      assert.ok(sample.alpha >= 0 && sample.alpha <= 1);
      assert.ok(sample.y >= 0 && sample.y <= 2.4);
    }
    fx = advanceBubboEffects(fx, 25);
  }
  assert.deepEqual(fx, []);
});

test('reduced-motion feedback stays legible without scale, travel, rotation or stagger', () => {
  const fx = createBubboShotEffects(shot, { reducedMotion: true });
  assert.ok(fx.length > 0);
  for (const effect of fx) {
    assert.equal(effect.delay, 0);
    assert.ok(effect.duration <= 200);
    const sample = sampleBubboEffect({ ...effect, age: effect.duration / 2 });
    assert.deepEqual([sample.x, sample.y, sample.rotation, sample.scale], [0, 0, 0, 1]);
    assert.equal(sample.alpha, .5);
  }
});

test('interruptions dispose feedback instead of replaying stale bursts', () => {
  const fx = createBubboShotEffects(shot);
  assert.deepEqual(advanceBubboEffects(fx, 16, { playing: false }), []);
  assert.deepEqual(advanceBubboEffects(fx, 16, { hidden: true }), []);
  assert.ok(advanceBubboEffects(fx, 99999).every(effect => effect.age === 50));
  assert.ok(advanceBubboEffects(Array(100).fill(fx[0]), 16).length <= BUBBO_FX_LIMITS.maxEffects);
});
