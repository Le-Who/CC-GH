import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeUvNineSlice } from '../src/games/settlement/settlementNineSlice.js';
const input = { sourceWidth: 2172, sourceHeight: 724, x: 0, y: 129, width: 2172, height: 465, corner: 96 };
test('nine slices partition the selected native frame, not transparent outer padding', () => {
 const pieces = makeUvNineSlice(input);
 assert.equal(pieces.length, 9);
 assert.equal(new Set(pieces.map(piece => piece.id)).size, 9);
 assert.equal(pieces.reduce((area, piece) => area + piece.source.width * piece.source.height, 0), input.width * input.height);
 assert.ok(pieces.every(piece => piece.source.y >= 129 && piece.source.y + piece.source.height <= 594));
 assert.deepEqual(pieces[0].source, { x: 0, y: 129, width: 96, height: 96 });
 assert.deepEqual(pieces[8].source, { x: 2076, y: 498, width: 96, height: 96 });
});
test('CSS background positioning reconstructs the exact source origin for each UV', () => {
 for (const piece of makeUvNineSlice(input)) {
  const [xp, yp] = piece.style.backgroundPosition.split(' ').map(parseFloat);
  assert.ok(Math.abs(xp / 100 * (input.sourceWidth - piece.source.width) - piece.source.x) < 0.00001);
  assert.ok(Math.abs(yp / 100 * (input.sourceHeight - piece.source.height) - piece.source.y) < 0.00001);
 }
});
test('out-of-range UV or degenerate corner cannot silently corrupt material', () => {
 for (const update of [{ y: 700 }, { width: 3000 }, { corner: 240 }, { sourceWidth: NaN }, { x: -1 }]) assert.throws(() => makeUvNineSlice({ ...input, ...update }), RangeError);
});

