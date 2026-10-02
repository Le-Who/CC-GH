import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { zipReport } from './core.mjs';
import { exportArchive, parseExportArguments } from './export-artifacts.mjs';

// Unit fixtures only: no browser, Drive, network, scheduler, or credentials.
async function fixture(t) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'qa-export-unit-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'preview'), outputDir = path.join(temp, 'explicit-export');
  const reportDir = path.join(root, 'qa-results', '2026-10-01-unit');
  await mkdir(reportDir, { recursive: true });
  await mkdir(outputDir);
  const report = { schemaVersion: 1, tool: 'cc-gh-user-run-qa-v1', status: 'passed', finishedAt: '2026-10-01T10:00:00Z' };
  await writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report));
  await writeFile(path.join(reportDir, 'capture.txt'), 'Fixture, not a real screenshot');
  const archive = reportDir + '.zip';
  const manifest = await zipReport(reportDir, archive);
  await writeFile(reportDir + '.archive.json', JSON.stringify(manifest));
  return { root, outputDir, archive, reportDir, manifest, report, allowSync: true };
}

test('export CLI is explicit and rejects unknown, duplicate, and missing options', () => {
  assert.equal(parseExportArguments([]).allowSync, false);
  assert.equal(parseExportArguments(['--dry-run']).dryRun, true);
  assert.throws(() => parseExportArguments(['--output-dir']), /Missing/);
  assert.throws(() => parseExportArguments(['--output-dir', '--allow-sync']), /Missing/);
  assert.throws(() => parseExportArguments(['--allow-sync', '--allow-sync']), /Duplicate/);
  assert.throws(() => parseExportArguments(['--latest']), /Unknown/);
});

test('no export without explicit allow-sync; dry-run makes no writes', async t => {
  const f = await fixture(t);
  await assert.rejects(exportArchive({ ...f, allowSync: false }), /Export disabled/);
  const result = await exportArchive({ ...f, allowSync: false, dryRun: true });
  assert.equal(result.status, 'validated-only');
  assert.equal(result.cloudSyncVerified, false);
  assert.deepEqual(await readdir(f.outputDir), []);
});

test('copy verifies SHA, preserves original, leaves no partial, and uses unique names', async t => {
  const f = await fixture(t), original = await readFile(f.archive);
  await writeFile(path.join(f.outputDir, 'existing.zip'), 'Unrelated existing file');
  const first = await exportArchive(f), second = await exportArchive(f);
  assert.equal(first.status, 'copied-locally');
  assert.equal(first.cloudSyncVerified, false);
  assert.notEqual(first.destination, second.destination);
  assert.deepEqual(await readFile(first.destination), original);
  assert.deepEqual(await readFile(f.archive), original);
  assert.equal(createHash('sha256').update(await readFile(first.destination)).digest('hex'), first.sha256);
  assert.equal(await readFile(path.join(f.outputDir, 'existing.zip'), 'utf8'), 'Unrelated existing file');
  assert.equal((await readdir(f.outputDir)).filter(x => x.endsWith('.partial')).length, 0);
});

test('missing output directory is refused and never created', async t => {
  const f = await fixture(t), outputDir = path.join(f.outputDir, 'missing');
  await assert.rejects(exportArchive({ ...f, outputDir }), /ENOENT/);
  assert.deepEqual(await readdir(f.outputDir), []);
});

test('relative, external, and nested archive paths are refused', async t => {
  const f = await fixture(t);
  await assert.rejects(exportArchive({ ...f, outputDir: './Drive' }), /absolute/);
  await assert.rejects(exportArchive({ ...f, archive: '../other.zip' }), /absolute/);
  await assert.rejects(exportArchive({ ...f, archive: path.join(f.outputDir, 'other.zip') }), /direct ZIP child/);
  await assert.rejects(exportArchive({ ...f, archive: path.join(f.reportDir, 'nested.zip') }), /direct ZIP child/);
  await assert.rejects(exportArchive({ ...f, outputDir: path.join(f.root, 'qa-results') }), /separate export/);
});

test('wrong SHA and wrong byte count fail before destination writes', async t => {
  const f = await fixture(t);
  await writeFile(f.reportDir + '.archive.json', JSON.stringify({ ...f.manifest, sha256: '0'.repeat(64) }));
  await assert.rejects(exportArchive(f), /SHA-256/);
  await writeFile(f.reportDir + '.archive.json', JSON.stringify({ ...f.manifest, bytes: f.manifest.bytes + 1 }));
  await assert.rejects(exportArchive(f), /byte count/);
  assert.deepEqual(await readdir(f.outputDir), []);
});

test('running and unrecognized reports cannot be exported', async t => {
  const f = await fixture(t);
  for (const report of [{ ...f.report, status: 'running' }, { ...f.report, tool: 'unknown' }, { ...f.report, finishedAt: '' }]) {
    await writeFile(path.join(f.reportDir, 'report.json'), JSON.stringify(report));
    await assert.rejects(exportArchive(f), /completed, recognized/);
  }
  assert.deepEqual(await readdir(f.outputDir), []);
});

test('failed and interrupted completed reports remain exportable for diagnosis', async t => {
  const f = await fixture(t);
  for (const status of ['partial-failure', 'blocked', 'interrupted']) {
    await writeFile(path.join(f.reportDir, 'report.json'), JSON.stringify({ ...f.report, status }));
    const result = await exportArchive({ ...f, dryRun: true });
    assert.equal(result.qaStatus, status);
  }
});

test('source, report, manifest, and output symlinks are refused', async t => {
  const f = await fixture(t);
  const outputLink = path.join(path.dirname(f.outputDir), 'linked-output');
  await symlink(f.outputDir, outputLink, 'dir');
  await assert.rejects(exportArchive({ ...f, outputDir: outputLink }), /non-symlink/);
  const realZip = path.join(f.outputDir, 'source.zip');
  await writeFile(realZip, await readFile(f.archive));
  await rm(f.archive); await symlink(realZip, f.archive);
  await assert.rejects(exportArchive(f), /non-symlink/);
  await rm(f.archive); await writeFile(f.archive, await readFile(realZip));
  const originalReport = path.join(f.outputDir, 'report.json');
  await writeFile(originalReport, JSON.stringify(f.report));
  await rm(path.join(f.reportDir, 'report.json')); await symlink(originalReport, path.join(f.reportDir, 'report.json'));
  await assert.rejects(exportArchive(f), /non-symlink/);
  await rm(path.join(f.reportDir, 'report.json')); await writeFile(path.join(f.reportDir, 'report.json'), JSON.stringify(f.report));
  await rm(f.reportDir + '.archive.json'); await symlink(originalReport, f.reportDir + '.archive.json');
  await assert.rejects(exportArchive(f), /non-symlink/);
});
