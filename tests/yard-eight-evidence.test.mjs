import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat, rm, symlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { YARD_EIGHT_EVIDENCE_ROOTS, EVIDENCE_PART_BYTES, EVIDENCE_KINDS, EVIDENCE_PARTS_PER_KIND, collectBrowserEvidence } from '../scripts/collect-browser-ci-evidence.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('closed eight-species evidence retains the original upload scope and unchanged browser command', () => {
  assert.deepEqual(YARD_EIGHT_EVIDENCE_ROOTS, [
    'test-results-yard-eight',
    'recovery-tools/yard-canonical-eight-qa/fixture.json',
    'recovery-tools/yard-canonical-eight-qa/SOURCE-CLOSURE.json',
    'recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json',
  ]);
  assert.equal(EVIDENCE_PART_BYTES, 240 * 1024 * 1024);
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /run: node --test tests\/browser-ci-contract\.test\.mjs tests\/yard-eight-evidence\.test\.mjs/);
  const job = workflow.match(/^  mochi:\n([\s\S]*?)(?=^  [a-z][a-z0-9_-]*:)/m)?.[1];
  assert.ok(job);
  assert.match(job, /run: pnpm exec playwright test -c playwright\.yard-eight\.config\.js --project=chromium --workers=1/);
  const uploads = job.split(/\n(?=      - )/).filter(step => step.includes('group: yard-eight-closed'));
  assert.equal(uploads.length, 1);
  assert.match(uploads[0], /if: always\(\)/);
  assert.match(uploads[0], /uses: \.\/\.github\/actions\/upload-browser-evidence/);
  assert.match(uploads[0], /include-hidden-files: 'true'/);
  assert.doesNotMatch(uploads[0], /continue-on-error|game-hub-yard-eight-closed|\brm\b|\bmv\b/);
  assert.doesNotMatch(job, /name: game-hub-yard-eight-closed-/);
});

test('all bounded uploads honor the explicit hidden-evidence opt-in without changing its default', () => {
  const action = read('.github/actions/upload-browser-evidence/action.yml');
  assert.match(action, /  include-hidden-files:\n    description: [^\n]+\n    default: 'false'/);
  const steps = action.split(/\n(?=    - name:)/);
  for (const kind of EVIDENCE_KINDS) for (let i = 1; i <= EVIDENCE_PARTS_PER_KIND; i++) {
    const part = `${kind}-${String(i).padStart(2, '0')}`;
    const uploads = steps.filter(step => step.includes(`path: browser-evidence/${part}/\n`));
    assert.equal(uploads.length, 1, part);
    assert.match(uploads[0], /if: always\(\)/);
    assert.match(uploads[0], /include-hidden-files: \$\{\{ inputs\.include-hidden-files \}\}/);
    assert.ok(uploads[0].includes(`name: game-hub-browser-\${{ inputs.group }}-${part}-\${{ github.sha }}-\${{ github.run_attempt }}`));
  }
});

test('closed-family shards round-trip every original byte, hidden file, outcome, timing and source hash', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'yard-eight-evidence-'));
  try {
    const input = resolve(dir, 'input'), output = resolve(dir, 'output');
    const files = new Map([
      ['test-results-yard-eight/results.json', Buffer.from(JSON.stringify({ stats: { unexpected: 1 }, duration: 12345, errors: ['preserve failure'], attachments: [{ body: Buffer.alloc(120000, 37).toString('base64') }] }))],
      ['test-results-yard-eight/.last-run.json', Buffer.from('{"status":"failed"}\n')],
      ['test-results-yard-eight/one/.attachments/frame.png', Buffer.alloc(32000, 81)],
      ['test-results-yard-eight/one/video.webm', Buffer.alloc(120000, 173)],
      ['test-results-yard-eight/one/trace.zip', Buffer.alloc(15000, 23)],
      ['test-results-yard-eight/server.log', Buffer.alloc(0)],
      ...YARD_EIGHT_EVIDENCE_ROOTS.slice(1).map(path => [path, Buffer.from(JSON.stringify({ source: path, exactHash: 'unchanged' }) + '\n')]),
    ]);
    for (const [path, body] of files) { await mkdir(dirname(resolve(input, path)), { recursive: true }); await writeFile(resolve(input, path), body); }
    await mkdir(resolve(input, 'test-results'), { recursive: true });
    await writeFile(resolve(input, 'test-results/unrelated.json'), 'other job scope');
    const result = await collectBrowserEvidence({ root: input, output, group: 'yard-eight-closed', partBytes: 65536, indexReserve: 16384 });
    assert.equal(result.sourceFiles, files.size);
    const parts = result.parts.map(part => part.name), reconstructed = new Map();
    assert.ok(result.parts.filter(part => part.name.startsWith('review-')).length > 1, 'oversized inline report must split');
    assert.ok(result.parts.filter(part => part.name.startsWith('videos-')).length > 1, 'oversized video must split');
    assert.ok(result.parts.some(part => part.name.startsWith('traces-')));
    for (const part of result.parts) {
      assert.ok(part.bytes <= 65536);
      const index = JSON.parse(await readFile(resolve(output, part.name, 'INDEX.json')));
      assert.equal(index.group, 'yard-eight-closed'); assert.deepEqual(index.parts, parts);
      assert.equal(index.part, part.name);
      let payloadBytes = 0;
      for (const entry of index.files) {
        assert.ok(files.has(entry.source), 'do not mix unrelated default evidence roots');
        const payload = await readFile(resolve(output, part.name, entry.payload));
        assert.equal(payload.length, entry.bytes); assert.equal(hash(payload), entry.sha256);
        assert.equal(entry.originalBytes, files.get(entry.source).length); assert.equal(entry.originalSha256, hash(files.get(entry.source)));
        payloadBytes += payload.length;
        if (!reconstructed.has(entry.source)) reconstructed.set(entry.source, []);
        reconstructed.get(entry.source).push({ offset: entry.offset, payload });
      }
      assert.equal(index.payloadBytes, payloadBytes);
      assert.equal(part.bytes, payloadBytes + (await stat(resolve(output, part.name, 'INDEX.json'))).size);
    }
    assert.equal(reconstructed.size, files.size);
    for (const [path, original] of files) {
      const chunks = reconstructed.get(path).sort((a, b) => a.offset - b.offset); let next = 0;
      for (const chunk of chunks) { assert.equal(chunk.offset, next); next += chunk.payload.length; }
      assert.deepEqual(Buffer.concat(chunks.map(chunk => chunk.payload)), original);
      assert.deepEqual(await readFile(resolve(input, path)), original, 'source evidence must remain untouched');
    }
    await assert.rejects(collectBrowserEvidence({ root: input, output: resolve(dir, 'overflow'), group: 'yard-eight-closed', partBytes: 65536, indexReserve: 16384, maxParts: 1 }), /exceeds/);
    await assert.rejects(stat(resolve(dir, 'overflow')), /ENOENT/);
    for (const [path, original] of files) assert.deepEqual(await readFile(resolve(input, path)), original);
    await symlink(resolve(dir, 'output'), resolve(input, 'test-results-yard-eight/symlink'));
    await assert.rejects(collectBrowserEvidence({ root: input, output: resolve(dir, 'linked'), group: 'yard-eight-closed' }), /symlink/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
