/**
 * Optional, explicit user-run export. No network/API calls, credential access,
 * folder discovery, scheduling, browser launch, or automatic invocation.
 * Copying into a synced folder CAN transmit data through its sync client.
 */
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseExportArguments(args) {
  const out = { root: DEFAULT_ROOT, allowSync: false, dryRun: false };
  const names = { '--root': 'root', '--archive': 'archive', '--output-dir': 'outputDir' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
    seen.add(arg);
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--allow-sync') out.allowSync = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (names[arg]) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value after ${arg}`);
      out[names[arg]] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return out;
}

function absolute(value, label) {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be an explicitly supplied absolute local path`);
  }
  return path.resolve(value);
}

async function regularFile(file, maxBytes) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Not a regular non-symlink file: ${file}`);
  if (info.size > maxBytes) throw new Error(`File exceeds the safety size limit: ${file}`);
  return info;
}

async function regularJson(file, maxBytes) {
  await regularFile(file, maxBytes);
  return JSON.parse(await readFile(file, 'utf8'));
}

async function directory(file, label) {
  const info = await lstat(file);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be an existing non-symlink directory`);
  return realpath(file);
}

/** Read-only destination preflight, also used BEFORE an opt-in QA run starts. */
export async function validateExportDestination(rootPath, requestedOutput) {
  const root = await realpath(absolute(rootPath, '--root'));
  const outputDir = await directory(absolute(requestedOutput, '--output-dir'), '--output-dir');
  if (outputDir === root || outputDir.startsWith(root + path.sep)) {
    throw new Error('Use a separate export directory outside this preview root');
  }
  return outputDir;
}

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

async function hashHandle(handle, size) {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(64 * 1024);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - offset), offset);
    if (!bytesRead) throw new Error('Archive changed or ended unexpectedly');
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return hash.digest('hex');
}

/** Validate and copy ONE named finished QA archive. Never choose a latest file. */
export async function exportArchive(options) {
  if (!options.dryRun && options.allowSync !== true) {
    throw new Error('Export disabled. Review the archive and destination, then explicitly supply --allow-sync; a sync client may upload these bytes');
  }
  const root = await realpath(absolute(options.root ?? DEFAULT_ROOT, '--root'));
  const archive = absolute(options.archive, '--archive');
  const requestedOutput = absolute(options.outputDir, '--output-dir');
  const results = await directory(path.join(root, 'qa-results'), 'qa-results');
  if (path.dirname(archive) !== path.join(root, 'qa-results') || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.zip$/.test(path.basename(archive))) {
    throw new Error('--archive must name one direct ZIP child of this preview root/qa-results');
  }
  const sourceInfo = await regularFile(archive, MAX_BYTES);
  if (path.dirname(await realpath(archive)) !== results) throw new Error('Archive escaped qa-results');
  const outputDir = await validateExportDestination(root, requestedOutput);
  const stemPath = archive.slice(0, -4);
  await directory(stemPath, 'The original completed report folder');
  const report = await regularJson(path.join(stemPath, 'report.json'), 16 * 1024 * 1024);
  if (report.schemaVersion !== 1 || report.tool !== 'cc-gh-user-run-qa-v1' ||
      !['passed', 'partial-failure', 'blocked', 'interrupted'].includes(report.status) ||
      !Number.isFinite(Date.parse(report.finishedAt))) {
    throw new Error('Only a completed, recognized QA report can be exported');
  }
  const manifest = await regularJson(stemPath + '.archive.json', 64 * 1024);
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes < 22 || manifest.bytes > MAX_BYTES || manifest.bytes !== sourceInfo.size ||
      !Number.isSafeInteger(manifest.files) || manifest.files < 1 || manifest.files > 4096) {
    throw new Error('Invalid archive manifest or ZIP byte count');
  }

  // Opening once keeps the source handle stable while copying. O_NOFOLLOW is
  // extra protection where supported; lstat/realpath checks also run on Windows.
  const source = await open(archive, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let tempPath, temp, renamed = false;
  try {
    const before = await source.stat();
    if (!before.isFile() || !sameFile(sourceInfo, before)) throw new Error('Archive changed during validation');
    const end = Buffer.alloc(22);
    await source.read(end, 0, end.length, before.size - end.length);
    if (end.readUInt32LE(0) !== 0x06054b50 || end.readUInt16LE(20) !== 0) throw new Error('Expected a completed QA ZIP32 archive');
    const sha256 = await hashHandle(source, before.size);
    if (sha256 !== manifest.sha256 || !sameFile(before, await source.stat())) {
      throw new Error('Source SHA-256 mismatch or archive changed; nothing was copied');
    }
    const result = {
      status: options.dryRun ? 'validated-only' : 'copied-locally',
      source: archive, outputDir, bytes: before.size, sha256, qaStatus: report.status,
      cloudSyncVerified: false,
      note: 'This verifies local bytes only. Check Drive for desktop sync status and the file in Drive before claiming upload completion.'
    };
    if (options.dryRun) return result;

    const id = randomUUID();
    const finalPath = path.join(outputDir, `${path.basename(stemPath)}--${sha256.slice(0, 12)}--${id}.zip`);
    tempPath = path.join(outputDir, `.cc-gh-qa-${id}.partial`);
    if (await exists(finalPath)) throw new Error('Destination already exists; refusing to overwrite');
    temp = await open(tempPath, 'wx', 0o600);
    const buffer = Buffer.alloc(64 * 1024), copiedHash = createHash('sha256');
    let offset = 0;
    while (offset < before.size) {
      const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      if (!bytesRead) throw new Error('Source changed while copying');
      copiedHash.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        const { bytesWritten } = await temp.write(buffer, written, bytesRead - written, offset + written);
        if (!bytesWritten) throw new Error('Export write made no progress');
        written += bytesWritten;
      }
      offset += bytesRead;
    }
    await temp.sync();
    await temp.close(); temp = null;
    const verify = await open(tempPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      if ((await verify.stat()).size !== before.size || await hashHandle(verify, before.size) !== sha256 ||
          copiedHash.digest('hex') !== sha256 || !sameFile(before, await source.stat())) {
        throw new Error('Copy SHA-256 mismatch or source changed; refusing to publish ZIP');
      }
    } finally { await verify.close(); }
    if (await realpath(requestedOutput) !== outputDir) throw new Error('Output directory changed during export');
    if (await exists(finalPath)) throw new Error('Destination appeared during export; refusing to overwrite');
    // Same-directory rename exposes the completed local ZIP in one operation.
    // It is NOT a cloud transaction: Drive may also observe the .partial file.
    await rename(tempPath, finalPath);
    renamed = true;
    return { ...result, destination: finalPath };
  } finally {
    await source.close();
    if (temp) await temp.close().catch(() => {});
    if (tempPath && !renamed) await unlink(tempPath).catch(() => {});
  }
}

function help() {
  console.log(`Optional CC-GH QA ZIP export. No default destination; no automatic upload.\n\nReview without writing:\n  node qa/export-artifacts.mjs --archive "ABSOLUTE_QA_ZIP_PATH" --output-dir "EXISTING_ABSOLUTE_SYNC_FOLDER" --dry-run\n\nExplicitly allow copying into the selected folder (its sync client may upload):\n  node qa/export-artifacts.mjs --archive "ABSOLUTE_QA_ZIP_PATH" --output-dir "EXISTING_ABSOLUTE_SYNC_FOLDER" --allow-sync\n\nOptional: --root "ABSOLUTE_PREVIEW_ROOT"\nRequires the original report folder and matching .archive.json beside the ZIP.\nNever discovers Drive folders, reads credentials, creates schedules, or runs QA.\nThe destination must already exist outside the preview root.\nA successful copy does not prove that Drive uploaded the file.\nSee DRIVE-AUTOMATION.md.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseExportArguments(process.argv.slice(2));
    if (options.help) help();
    else console.log(JSON.stringify(await exportArchive(options), null, 2));
  } catch (error) {
    console.error(`QA export failed: ${error.message}`);
    process.exitCode = 2;
  }
}
