// Strict metadata validation for checked-in lossless VP8L assets. Pixel equality is
// separately decoded with Sharp in the asset pipeline suite and recorded in the proof fixture.
const assert = require('node:assert/strict');
function readLosslessWebpMetadata(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  let result;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + length <= bytes.length, 'truncated WebP chunk');
    assert.notEqual(tag, 'VP8 ', 'lossy image payload is forbidden');
    assert.notEqual(tag, 'ANIM', 'animated assets are not part of this export');
    if (tag === 'VP8L') {
      assert.equal(result, undefined, 'only one lossless image payload is supported');
      assert.ok(length >= 5);
      assert.equal(bytes[start], 0x2f);
      const bits = bytes.readUInt32LE(start + 1);
      assert.equal(bits >>> 29, 0, 'unknown VP8L version');
      result = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = start + length + (length % 2);
  }
  assert.ok(result, 'lossless VP8L payload missing');
  return result;
}
module.exports = { readLosslessWebpMetadata };
