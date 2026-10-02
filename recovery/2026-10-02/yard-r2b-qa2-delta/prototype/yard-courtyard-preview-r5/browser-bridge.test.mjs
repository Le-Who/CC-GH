import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { sha256, hexToBase64url } from './sha256.mjs';
import { browserKernel as browser } from './browser/kernel.mjs';
import { nodeKernel as node } from './kernel-node.mjs';
import { createCourtyardAdapter, PREVIEW_SCENE } from './adapter.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const report = { standardVectors: 0, textParity: 0, canonicalObjectParity: 0, base64Parity: 0,
  sourceClosureModules: 0, sourceModulesChanged: 2, scenariosByteEqual: [],
  scope: 'Browser-safe dependency closure exercised under Node; browser UI/render not tested here' };

test('standard SHA256 vectors, padding boundaries and million-a', () => {
  for (const [input, expected] of [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['a'.repeat(1000000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
  ]) { assert.equal(sha256(input), expected); report.standardVectors++; }
  for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1024]) assert.equal(sha256('x'.repeat(n)), hash('x'.repeat(n)));
});

test('UTF8 parity includes emoji, combining characters, lone surrogates, zero bytes and deterministic fuzz', () => {
  const samples = ['Мика 🐈', '你好', 'e\u0301', 'é', '\ud800', '\udfff', '\u0000abc\u0000', '\ud800\ud800x\udfff', '𐐷🧶'];
  let seed = 123456789;
  for (let i = 0; i < 2048; i++) {
    let s = '';
    for (let j = 0; j < i % 80; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; s += String.fromCharCode(seed >>> 16); }
    samples.push(s);
  }
  for (const s of samples) { assert.equal(sha256(s), hash(s)); assert.equal(browser.digest(s), node.digest(s)); report.textParity++; }
});

test('canonical JSON digest, legacy hash32, random seeds and base64url match exact source', () => {
  for (let i = 0; i < 1000; i++) {
    const value = { z: [i, null, true, false, { '🧶': `Мика-${i}`, a: '\ud800' }], a: i / 7, nested: { y: i % 2, x: [] } };
    assert.equal(browser.canonical(value), node.canonical(value));
    assert.equal(browser.digest(value), node.digest(value)); report.canonicalObjectParity++;
    const seed = `${i}:🐈:courtyard`;
    assert.equal(browser.hash32(seed), node.hash32(seed)); assert.equal(browser.randomUnit(seed), node.randomUnit(seed));
    assert.equal(browser.randomInt(seed, 45, 110), node.randomInt(seed, 45, 110));
  }
  for (let n = 0; n < 128; n++) {
    const hex = Array.from({ length: n }, (_, i) => ((i * 127 + n) % 256).toString(16).padStart(2, '0')).join('');
    assert.equal(hexToBase64url(hex), Buffer.from(hex, 'hex').toString('base64url')); report.base64Parity++;
  }
});

test('packaged source closure has exact provenance, only two platform substitutions and no Node globals/imports', async () => {
  const manifest = JSON.parse(await readFile(new URL('./browser/PROVENANCE.json', import.meta.url)));
  assert.equal(manifest.files.filter(f => f.changed).length, 2);
  const paths = new Set(manifest.files.map(f => new URL(`./browser/${f.path}`, import.meta.url).href));
  paths.add(new URL('./browser/sha256.mjs', import.meta.url).href);
  for (const row of manifest.files) {
    const url = new URL(`./browser/${row.path}`, import.meta.url), code = await readFile(url, 'utf8');
    const source = await readFile(new URL(`../../checkpoints/yard-state-foundation-r1-20261002T0232Z/${row.path}`, import.meta.url), 'utf8');
    assert.equal(hash(source), row.sourceSha256); assert.equal(hash(code), row.generatedSha256);
    if (!row.changed) assert.equal(source, code);
    assert.doesNotMatch(code, /\bBuffer\.|\bprocess\.|['"]node:/);
    for (const match of code.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('.')); assert.ok(paths.has(new URL(match[1], url).href));
    }
  }
  report.sourceClosureModules = manifest.files.length;
});

test('complete mouse/cushion adapter, save bytes and replay claims match Node kernel exactly', async () => {
  const clips = JSON.parse(await readFile(new URL('./clip-contracts.json', import.meta.url)));
  // Binding comparison fixture; independent media evidence is not a browser/art pass.
  for (const c of Object.values(clips)) { c.playbackReady = true; c.validatedPhases = c.requiredPhases; }
  const turns = JSON.parse(await readFile(new URL('./turn-contracts.json', import.meta.url)));
  const options = { clips, turns, scene: structuredClone(PREVIEW_SCENE) };
  const a = createCourtyardAdapter(node, options), b = createCourtyardAdapter(browser, options);
  for (const scenario of ['mouse', 'cushion']) {
    const left = a.create({ scenario }), right = b.create({ scenario });
    assert.deepEqual(left, right);
    let ls = a.action(left.session, { action: 'yard.setFood', payload: { foodId: 'kibble' }, actionId: 'preview:food' }).session;
    let rs = b.action(right.session, { action: 'yard.setFood', payload: { foodId: 'kibble' }, actionId: 'preview:food' }).session;
    for (const time of [7999, 8000, 14501, 20200, 31112, 120000]) {
      ls = a.advancePresentation(ls, time); rs = b.advancePresentation(rs, time);
      assert.deepEqual(rs, ls); assert.equal(a.encode(ls).value, b.encode(rs).value);
      rs = b.restore(b.encode(rs).value, right.backup).session;
    }
    const command = { action: 'yard.collectGifts', actionId: 'preview:claim' };
    const lr = a.action(ls, command), rr = b.action(rs, command);
    assert.deepEqual(rr, lr); assert.deepEqual(b.action(rr.session, command), a.action(lr.session, command));
    report.scenariosByteEqual.push(scenario);
  }
});

test('legacy receipt boundary works without global Buffer or process', () => {
  const p = node.createDefaultPlayer('legacy', 'Legacy', 0), request = { action: 'yard.collectGifts', payload: {} };
  p._actionReceipts = { items: [{ clientActionId: 'old:claim', action: request.action,
    payloadHash: Buffer.from(node.digest(request), 'hex').toString('base64url') }] };
  const record = browser.splitForStorage(browser.migratePlayerSnapshot(p, { now: 0 })).record;
  const previous = { Buffer: globalThis.Buffer, process: globalThis.process };
  try {
    globalThis.Buffer = undefined; globalThis.process = undefined;
    const result = browser.planCommand(record, { ...request, actionId: 'old:claim', expectedVersion: record.version }, { now: 0 });
    assert.equal(result.legacyReplay, true); assert.equal(result.proposal, null);
  } finally { globalThis.Buffer = previous.Buffer; globalThis.process = previous.process; }
});
test.after(async () => writeFile(new URL('./BROWSER-VALIDATION.json', import.meta.url), JSON.stringify(report, null, 2) + '\n'));
