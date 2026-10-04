import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attemptMatch3Move } from '../src/game-core/match3/engine.js';
import { armMatch3RefillSeed, installMatch3RefillSeed, match3MotionBoard } from './e2e/helpers/match3MotionFixture.js';

test('refill seed belongs to the scoring pointerup, unaffected by intervening reconnect randomness', () => {
  const original = Math.random, listeners = [], timers = [];
  let unrelatedCalls = 0;
  const unrelatedRandom = () => { unrelatedCalls++; return .73; };
  const scope = {
    Math,
    addEventListener(type, listener, capture) { assert.equal(type, 'pointerup'); assert.equal(capture, true); listeners.push(listener); },
    setTimeout(callback, delay) { assert.equal(delay, 0); timers.push(callback); },
  };
  try {
    Math.random = unrelatedRandom;
    installMatch3RefillSeed(scope);
    // Pixi installs its own window-capture listener during renderer init. The
    // fixture listener must already exist, even though no seed is armed yet.
    let result;
    scope.addEventListener('pointerup', event => {
      if (event.target.tagName === 'CANVAS') result = attemptMatch3Move(match3MotionBoard(), { x: 1, y: 6 }, { x: 1, y: 7 });
    }, true);
    armMatch3RefillSeed(2, scope);
    // Socket.IO's reconnect jitter/polling timestamp can run while Playwright
    // calculates the second cell position or dispatches its native touch input.
    for (let i = 0; i < 17; i++) Math.random();
    assert.equal(unrelatedCalls, 17);
    assert.equal(Math.random, unrelatedRandom);
    listeners.forEach(listener => listener({ target: { tagName: 'BUTTON' } }));
    assert.equal(scope.__match3RefillSeed.used, false);
    listeners.forEach(listener => listener({ target: { tagName: 'CANVAS', dataset: { match3BoardSize: '280' } } }));
    assert.equal(scope.__match3RefillSeed.armed, false);
    assert.equal(result.valid, true);
    assert.equal(result.totalPoints, 90);
    assert.equal(result.steps.length, 2);
    assert.equal(scope.__match3RefillSeed.calls, 6);
    assert.equal(scope.__match3RefillSeed.values.length, 6);
    assert.equal(timers.length, 1);
    timers[0]();
    assert.equal(Math.random, unrelatedRandom);
    assert.equal(scope.__match3RefillSeed.restored, true);
  } finally { Math.random = original; }
});
