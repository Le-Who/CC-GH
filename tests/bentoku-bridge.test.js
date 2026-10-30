import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectBentokuFrame } from '../src/games/bentoku/bentokuBridge.js';

function fixture() {
  const target = new EventTarget();
  const sent = [];
  const frame = { postMessage: (data, origin) => sent.push({ data, origin }) };
  let ready = 0;
  const bridge = connectBentokuFrame({ targetWindow: target, frameWindow: frame, onReady: () => ready++ });
  const receive = (patch = {}) => {
    const event = Object.assign(new Event('message'), {
      origin: 'https://bentoku-nine.vercel.app', source: frame,
      data: { type: 'bentoku:ready', version: 1 }, ...patch,
    });
    target.dispatchEvent(event);
  };
  return { bridge, frame, sent, receive, ready: () => ready };
}

test('only the Bentoku frame can finish loading; unrelated windows and messages are ignored', () => {
  const f = fixture();
  for (const patch of [
    { origin: 'https://other.example' }, { source: {} },
    { data: null }, { data: { type: 'bentoku:ready', version: 2 } },
    { data: { type: 'unrelated', version: 1 } },
  ]) f.receive(patch);
  assert.equal(f.ready(), 0);
  f.receive();
  assert.equal(f.ready(), 1);
  assert.deepEqual(f.sent.at(-1), {
    data: { type: 'ccgh:bentoku:visibility', version: 1, visible: true },
    origin: 'https://bentoku-nine.vercel.app',
  });
  f.bridge.destroy();
});

test('a late ready message respects Home visibility and never receives account or launch data', () => {
  const f = fixture();
  f.bridge.setVisible(false);
  f.receive();
  assert.equal(f.sent.at(-1).data.visible, false);
  f.bridge.setVisible(true);
  assert.deepEqual(f.sent.at(-1).data, { type: 'ccgh:bentoku:visibility', version: 1, visible: true });
  f.bridge.destroy();
  assert.equal(f.sent.at(-1).data.visible, false);
  const count = f.sent.length;
  f.receive(); f.bridge.connect(); f.bridge.setVisible(true);
  assert.equal(f.ready(), 1);
  assert.equal(f.sent.length, count);
});
