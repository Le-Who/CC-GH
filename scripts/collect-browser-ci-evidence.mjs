import { mkdir, readdir, lstat, open, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, sep, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Each independent upload stays comfortably below the 512 MB retrieval limit,
// even for uncompressible video/trace bytes and ZIP metadata. Never drop bytes.
export const EVIDENCE_PART_BYTES = 240 * 1024 * 1024;
export const EVIDENCE_PARTS_PER_KIND = 8;
export const EVIDENCE_KINDS = ['review', 'videos', 'traces'];
export const EVIDENCE_ROOTS = ['browser-ci-discovery.json', 'playwright-results.json', 'playwright-report', 'test-results'];
// Match the original closed-family upload exactly; keep other job scopes unchanged.
export const YARD_EIGHT_EVIDENCE_ROOTS = [
  'test-results-yard-eight',
  'recovery-tools/yard-canonical-eight-qa/fixture.json',
  'recovery-tools/yard-canonical-eight-qa/SOURCE-CLOSURE.json',
  'recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json',
];
const reserve = 1024 * 1024;
export const evidenceKind = path => /\.(webm|mp4|mov)$/i.test(path) ? 'videos' : /\.zip$/i.test(path) ? 'traces' : 'review';
async function fileHash(path) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex');
}
export async function collectBrowserEvidence({ root = '.', output = 'browser-evidence', group, partBytes = EVIDENCE_PART_BYTES, indexReserve = reserve, maxParts = EVIDENCE_PARTS_PER_KIND } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(group || '')) throw Error('A validated browser group is required');
  if (!(partBytes > indexReserve && indexReserve > 0)) throw Error('Invalid evidence part budget');
  root = resolve(root); output = resolve(output);
  const files = [];
  async function visit(path) {
    let info; try { info = await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (info.isSymbolicLink()) throw Error(`Evidence symlink rejected: ${path}`);
    if (info.isDirectory()) for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error(`Evidence symlink rejected: ${entry.name}`);
      await visit(resolve(path, entry.name));
    }
    else if (info.isFile()) files.push({ source: relative(root, path).split(sep).join('/'), path, bytes: info.size });
  }
  for (const name of group === 'yard-eight-closed' ? YARD_EIGHT_EVIDENCE_ROOTS : EVIDENCE_ROOTS) await visit(resolve(root, name));
  files.sort((a, b) => a.source.localeCompare(b.source));
  const parts = [], states = new Map(EVIDENCE_KINDS.map(kind => [kind, []]));
  function nextPart(kind) {
    const rows = states.get(kind);
    if (rows.length >= maxParts) throw Error(`${kind} evidence exceeds ${maxParts} bounded artifacts; raise the declared upload coverage, never truncate`);
    const part = { name: `${kind}-${String(rows.length + 1).padStart(2, '0')}`, kind, bytes: 0, entries: [] };
    rows.push(part); parts.push(part); return part;
  }
  for (const file of files) {
    const kind = evidenceKind(file.source); file.sha256 = await fileHash(file.path);
    let offset = 0;
    do {
      let part = states.get(kind).at(-1);
      if (!part || part.bytes === partBytes - indexReserve) part = nextPart(kind);
      const bytes = Math.min(file.bytes - offset, partBytes - indexReserve - part.bytes);
      // Small videos/images/diagnostics retain their usable names and extensions.
      const payload = offset === 0 && bytes === file.bytes ? `files/${file.source}` : `chunks/${file.source}.part-${String(offset).padStart(12, '0')}`;
      const entry = { source: file.source, originalBytes: file.bytes, originalSha256: file.sha256, offset, bytes, payload, file };
      part.entries.push(entry); part.bytes += bytes; offset += bytes;
    } while (offset < file.bytes);
  }
  if (!parts.length) nextPart('review');
  // Refuse stale/mixed outputs; leave original evidence untouched on every path.
  await mkdir(output);
  for (const part of parts) {
    const dir = resolve(output, part.name); await mkdir(dir);
    const entries = [];
    for (const entry of part.entries) {
      const targetPath = resolve(dir, entry.payload); await mkdir(dirname(targetPath), { recursive: true });
      const input = await open(entry.file.path, 'r'), target = await open(targetPath, 'wx'), hash = createHash('sha256');
      try {
        let remaining = entry.bytes, offset = entry.offset;
        const buffer = Buffer.alloc(Math.min(1024 * 1024, Math.max(1, remaining)));
        while (remaining) {
          const { bytesRead } = await input.read(buffer, 0, Math.min(buffer.length, remaining), offset);
          if (!bytesRead) throw Error(`Evidence file changed during collection: ${entry.source}`);
          const chunk = buffer.subarray(0, bytesRead); await target.writeFile(chunk); hash.update(chunk); remaining -= bytesRead; offset += bytesRead;
        }
      } finally { await input.close(); await target.close(); }
      const { file, ...record } = entry; entries.push({ ...record, sha256: hash.digest('hex') });
    }
    const index = Buffer.from(JSON.stringify({ format: 'browser-ci-evidence/v1', group, part: part.name, payloadBytes: part.bytes, parts: parts.map(p => p.name), reconstruction: 'Group entries by source, concatenate payload bytes in offset order, verify originalBytes and originalSha256.', files: entries }, null, 2) + '\n');
    if (index.length > indexReserve || index.length + part.bytes > partBytes) throw Error(`Evidence index exceeds reserved budget: ${part.name}`);
    await writeFile(resolve(dir, 'INDEX.json'), index);
    part.totalBytes = part.bytes + index.length;
  }
  return { group, sourceFiles: files.length, parts: parts.map(({ name, totalBytes }) => ({ name, bytes: totalBytes })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await collectBrowserEvidence({ group: process.argv[2] }), null, 2));
