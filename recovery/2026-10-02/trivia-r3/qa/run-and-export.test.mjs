import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseCompanionArguments, runAndExport } from './run-and-export.mjs';
import { run, LOCAL_ARTIFACTS_SCHEMA_VERSION } from './run-qa.mjs';

// Fake run/copy functions test orchestration only; no browser/model/API is called.
async function paths(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'qa-companion-unit-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'preview'), outputDir = path.join(temp, 'explicit-output');
  await mkdir(root); await mkdir(outputDir);
  return { root, outputDir, allowSync: true };
}

test('companion defaults to no copying and retains core QA options', () => {
  const args = parseCompanionArguments(['--game', 'merge', '--quick']);
  assert.equal(args.outputDir, null); assert.equal(args.allowSync, false);
  assert.equal(args.game, 'merge'); assert.equal(args.quick, true);
  assert.throws(() => parseCompanionArguments(['--output-dir']), /Missing/);
  assert.throws(() => parseCompanionArguments(['--allow-sync', '--allow-sync']), /Duplicate/);
});

test('local-only run never calls export or needs the export contract', async t => {
  const f = await paths(t); let runs = 0, copies = 0;
  const result = await runAndExport({ root: f.root, quick: true }, {
    artifactVersion: 0,
    runQA: async args => { runs++; assert.equal(args.quick, true); return { status: 'passed' }; },
    copyQA: async () => { copies++; }
  });
  assert.equal(runs, 1); assert.equal(copies, 0); assert.equal(result.exportStatus, 'disabled'); assert.equal(result.exitCode, 0);
});

test('bad opt-in, missing destination, and old runner fail BEFORE running QA', async t => {
  const f = await paths(t); let runs = 0;
  const dependencies = { artifactVersion: 1, runQA: async () => { runs++; } };
  await assert.rejects(runAndExport({ ...f, allowSync: false }, dependencies), /requires --allow-sync/);
  await assert.rejects(runAndExport({ root: f.root, allowSync: true }, dependencies), /explicit existing/);
  await assert.rejects(runAndExport({ ...f, outputDir: path.join(f.outputDir, 'missing') }, dependencies), /ENOENT/);
  await assert.rejects(runAndExport(f, { ...dependencies, artifactVersion: 0 }), /matching companion kit/);
  assert.equal(runs, 0);
});

test('export receives exactly the path returned by THIS run, with no scan or mtime selection', async t => {
  const f = await paths(t), archive = path.join(f.root, 'qa-results', 'exact-run-identity.zip');
  const seen = [];
  const result = await runAndExport(f, {
    artifactVersion: 1,
    runQA: async () => { seen.push('run'); return { status: 'passed', localArtifacts: { archivePath: archive } }; },
    copyQA: async options => { seen.push('copy'); assert.equal(options.archive, archive); assert.equal(options.outputDir, f.outputDir); return { status: 'copied-locally', cloudSyncVerified: false }; }
  });
  assert.deepEqual(seen, ['run', 'copy']); assert.equal(result.exitCode, 0); assert.equal(result.exported.cloudSyncVerified, false);
});

test('missing exact archive path never falls back to an older ZIP', async t => {
  const f = await paths(t); let copies = 0;
  const result = await runAndExport(f, {
    artifactVersion: 1,
    runQA: async () => ({ status: 'blocked', localArtifacts: { archivePath: null } }),
    copyQA: async () => { copies++; }
  });
  assert.equal(copies, 0); assert.equal(result.exitCode, 2); assert.match(result.error, /no other archive/);
});

test('nonpassing QA can export diagnostics and keeps nonzero QA status; copy errors stay separate', async t => {
  const f = await paths(t), archivePath = path.join(f.root, 'qa-results', 'failed-run.zip');
  const dependencies = { artifactVersion: 1, runQA: async () => ({ status: 'partial-failure', localArtifacts: { archivePath } }) };
  const copied = await runAndExport(f, { ...dependencies, copyQA: async () => ({ status: 'copied-locally' }) });
  assert.equal(copied.exitCode, 1); assert.equal(copied.qaStatus, 'partial-failure');
  const failed = await runAndExport(f, { ...dependencies, copyQA: async () => { throw new Error('fixture copy error'); } });
  assert.equal(failed.exitCode, 2); assert.equal(failed.qaStatus, 'partial-failure'); assert.equal(failed.error, 'fixture copy error');
});

test('source contains no directory scan, scheduler, process spawn, or remote execution mechanism', async () => {
  const source = await readFile(new URL('./run-and-export.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /readdir|glob\(|mtime|schtasks|child_process|eval\(/);
});

test('real early-blocked runner returns an exact local path without writing that field into report bytes', async t => {
  const f = await paths(t);
  assert.equal(LOCAL_ARTIFACTS_SCHEMA_VERSION, 1);
  // Empty fixture root has NO recognized preview, so run stops before browser
  // discovery or launch. This validates the actual output contract, not GUI QA.
  const result = await run({ root: f.root, game: 'auto', quick: true });
  assert.equal(result.status, 'blocked');
  assert.ok(path.isAbsolute(result.localArtifacts.archivePath));
  const archive = result.localArtifacts.archivePath;
  assert.equal(path.dirname(archive), path.join(f.root, 'qa-results'));
  const written = await readFile(path.join(archive.slice(0, -4), 'report.json'), 'utf8');
  assert.equal(JSON.parse(written).localArtifacts, undefined);
  assert.ok(!written.includes(f.root));
  const manifest = JSON.parse(await readFile(archive.slice(0, -4) + '.archive.json', 'utf8'));
  assert.equal(manifest.sha256, result.archive.sha256);
  const copied = await runAndExport(f, { artifactVersion: 1, runQA: async () => result });
  assert.equal(copied.exportStatus, 'copied-locally');
  assert.equal(copied.exitCode, 1);
  assert.equal(copied.exported.source, archive);
});
