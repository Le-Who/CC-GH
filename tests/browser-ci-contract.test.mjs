import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat, rm, symlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { BROWSER_GROUPS, browserArgs, discoverBrowserSpecs, validateBrowserGroups, validateDefaultBrowserConfig, validateBrowserDiscovery } from '../scripts/browser-ci-groups.mjs';
import { EVIDENCE_KINDS, EVIDENCE_PARTS_PER_KIND, EVIDENCE_PART_BYTES, collectBrowserEvidence } from '../scripts/collect-browser-ci-evidence.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

test('every default Chromium spec belongs to exactly one complete, runnable group', () => {
  const specs = discoverBrowserSpecs(resolve(root, 'tests/e2e'));
  assert.deepEqual(validateBrowserGroups(specs), { groups: 11, specs: specs.length });
  for (const file of specs) {
    const owners = Object.keys(BROWSER_GROUPS).filter(group => browserArgs(group).slice(3, -2).some(pattern => new RegExp(pattern).test(`${root}tests/e2e/${file}`)));
    assert.equal(owners.length, 1, file);
  }
  for (const group of Object.keys(BROWSER_GROUPS)) {
    const args = browserArgs(group);
    assert.deepEqual(args.slice(0, 3), ['exec', 'playwright', 'test']);
    assert.deepEqual(args.slice(-2), ['--project=chromium', '--workers=1']);
    assert.ok(!args.some(arg => /^--(grep|retries|shard)/.test(arg)));
  }
});

test('new specs, duplicates, stale names and changed discovery fail closed', () => {
  assert.throws(() => validateBrowserGroups(['a.spec.js', 'nested/new.test.ts'], { a: ['a.spec.js'] }), /Unassigned/);
  assert.throws(() => validateBrowserGroups(['a.spec.js'], { a: ['a.spec.js'], b: ['a.spec.js'] }), /Duplicate/);
  assert.throws(() => validateBrowserGroups(['a.spec.js'], { a: ['stale.spec.js'] }), /Unknown/);
  assert.throws(() => browserArgs('untrusted; echo unsafe'), /Unknown/);
  const config = read('playwright.config.js'); validateDefaultBrowserConfig(config);
  assert.throws(() => validateDefaultBrowserConfig(config.replace('testDir:', 'testMatch:')), /discovery/);
  assert.throws(() => validateDefaultBrowserConfig(`${config}\n// testIgnore: future rule`), /discovery/);
  assert.throws(() => validateDefaultBrowserConfig(config.replace('reuseExistingServer: false', 'reuseExistingServer: true')), /isolated/);
});

test('matrix replaces the monolithic browser run and remains a required release gate', () => {
  const workflow = read('.github/workflows/ci.yml'), config = read('playwright.config.js');
  const browser = workflow.match(/^  browser:\n([\s\S]*?)(?=^  [a-z][a-z0-9_-]*:)/m)?.[1];
  assert.ok(browser); assert.match(browser, /fail-fast: false/);
  assert.match(browser, /matrix: \$\{\{ fromJSON\(needs\.browser-plan\.outputs\.matrix\) \}\}/);
  assert.match(workflow, /node scripts\/browser-ci-groups\.mjs --matrix/);
  assert.match(workflow, /playwright test --project=chromium --list --reporter=json/);
  assert.match(workflow, /browser-ci-groups\.mjs --verify-list browser-ci-discovery.json/);
  assert.equal((workflow.match(/browser-ci-groups\.mjs --run/g) || []).length, 1);
  assert.doesNotMatch(workflow, /run: pnpm exec playwright test --project=chromium --workers=1/);
  assert.match(workflow, /needs: \[test, browser, touch, mochi\]/);
  assert.match(browser, /DATABASE_URL: ''/); assert.match(browser, /REDIS_URL: ''/);
  assert.doesNotMatch(browser, /continue-on-error|retries:|services:|max-failures/);
  assert.match(config, /retries: process\.env\.CI \? 2 : 0/);
  assert.match(config, /DATABASE_URL: ""/); assert.match(config, /REDIS_URL: ""/);
  for (const required of ['pnpm test', 'preview/yard-persistent-candidate/run-checks.mjs', 'preview/yard-persistent-candidate/compile-check.mjs', 'tests/merge-lab-postgres.test.mjs', 'tests/garden-accounting-postgres.test.mjs', 'tests/garden-r2-postgres.test.mjs', 'tests/yard-v2-postgres.test.mjs']) assert.ok(workflow.includes(required), required);
  assert.match(workflow, /tests\/e2e\/gestures.spec.js --project=mobile-chrome --workers=1/);
});

test('real Playwright discovery must load every grouped file and only Chromium tests', () => {
  const report = { suites: [{ file: 'a.spec.js', specs: [{ id: 'a-id', file: 'a.spec.js', tests: [{ projectName: 'chromium' }] }] }], errors: [] };
  assert.deepEqual(validateBrowserDiscovery(report, ['a.spec.js']), { specs: 1, tests: 1 });
  assert.throws(() => validateBrowserDiscovery({ ...report, errors: [{ message: 'unsupported nested test.use' }] }, ['a.spec.js']), /failed/);
  assert.throws(() => validateBrowserDiscovery(report, ['a.spec.js', 'b.spec.js']), /omitted/);
  assert.throws(() => validateBrowserDiscovery(report, ['b.spec.js']), /unassigned/);
  const wrongProject = structuredClone(report); wrongProject.suites[0].specs[0].tests[0].projectName = 'mobile-chrome';
  assert.throws(() => validateBrowserDiscovery(wrongProject, ['a.spec.js']), /project/);
  const duplicate = structuredClone(report); duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
  assert.throws(() => validateBrowserDiscovery(duplicate, ['a.spec.js']), /duplicate/);
});

test('all bounded evidence parts have independent, unconditional, group-unique uploads', () => {
  const action = read('.github/actions/upload-browser-evidence/action.yml');
  assert.ok(EVIDENCE_PART_BYTES < 512 * 1024 * 1024);
  assert.match(action, /collect-browser-ci-evidence\.mjs/);
  const steps = action.split(/\n(?=    - name:)/);
  for (const kind of EVIDENCE_KINDS) for (let i = 1; i <= EVIDENCE_PARTS_PER_KIND; i++) {
    const part = `${kind}-${String(i).padStart(2, '0')}`;
    const uploads = steps.filter(step => step.includes(`path: browser-evidence/${part}/\n`));
    assert.equal(uploads.length, 1, part);
    const step = uploads[0]; assert.match(step, /if: always\(\)/); assert.match(step, /uses: actions\/upload-artifact@v7/);
    assert.ok(step.includes(`name: game-hub-browser-\${{ inputs.group }}-${part}-\${{ github.sha }}-\${{ github.run_attempt }}`));
    assert.match(step, /compression-level: 0/); assert.doesNotMatch(step, /continue-on-error/);
  }
});

test('bounded collector preserves every byte and hash, including split videos, without altering sources', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'browser-evidence-test-'));
  try {
    const input = resolve(dir, 'input'), output = resolve(dir, 'output'); await mkdir(resolve(input, 'test-results/one'), { recursive: true });
    const files = new Map([
      ['playwright-results.json', Buffer.from('{"stats":{"unexpected":1}}\n')],
      ['test-results/one/video.webm', Buffer.alloc(120000, 173)],
      ['test-results/one/small.webm', Buffer.from('small video')],
      ['test-results/one/frame.png', Buffer.alloc(32000, 81)],
      ['test-results/one/trace.zip', Buffer.alloc(15000, 23)],
    ]);
    for (const [path, body] of files) await writeFile(resolve(input, path), body);
    const result = await collectBrowserEvidence({ root: input, output, group: 'match3', partBytes: 65536, indexReserve: 16384 });
    assert.equal(result.sourceFiles, files.size);
    const reconstructed = new Map();
    for (const part of result.parts) {
      assert.ok(part.bytes <= 65536);
      const index = JSON.parse(await readFile(resolve(output, part.name, 'INDEX.json')));
      for (const entry of index.files) {
        const payload = await readFile(resolve(output, part.name, entry.payload));
        assert.equal(payload.length, entry.bytes); assert.equal(hash(payload), entry.sha256);
        assert.equal(entry.originalSha256, hash(files.get(entry.source))); assert.equal(entry.originalBytes, files.get(entry.source).length);
        if (!reconstructed.has(entry.source)) reconstructed.set(entry.source, []);
        reconstructed.get(entry.source).push({ offset: entry.offset, payload });
        if (entry.source.endsWith('small.webm')) assert.ok(entry.payload.endsWith('small.webm'), 'small videos remain directly playable');
      }
    }
    assert.equal(reconstructed.size, files.size);
    for (const [path, body] of files) {
      const chunks = reconstructed.get(path).sort((a, b) => a.offset - b.offset); let next = 0;
      for (const chunk of chunks) { assert.equal(chunk.offset, next); next += chunk.payload.length; }
      assert.deepEqual(Buffer.concat(chunks.map(chunk => chunk.payload)), body); assert.deepEqual(await readFile(resolve(input, path)), body);
    }
    await assert.rejects(collectBrowserEvidence({ root: input, output, group: 'match3' }), /EEXIST/);
    await assert.rejects(collectBrowserEvidence({ root: input, output: resolve(dir, 'overflow'), group: 'match3', partBytes: 65536, indexReserve: 16384, maxParts: 1 }), /exceeds/);
    await assert.rejects(stat(resolve(dir, 'overflow')), /ENOENT/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('collector rejects evidence symlinks and does not manufacture test success when no results exist', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'browser-evidence-empty-'));
  try {
    const input = resolve(dir, 'input'); await mkdir(input);
    const empty = await collectBrowserEvidence({ root: input, output: resolve(dir, 'empty'), group: 'garden' });
    assert.equal(empty.sourceFiles, 0); assert.equal(empty.parts.length, 1);
    await symlink(resolve(dir, 'empty'), resolve(input, 'test-results'));
    await assert.rejects(collectBrowserEvidence({ root: input, output: resolve(dir, 'linked'), group: 'garden' }), /symlink/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
