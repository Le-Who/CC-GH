/** Bounded diagnostics even if a later build/contract assertion fails. No payload archive. */
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function summarizeEmittedChunks(root = process.cwd()) {
  const chunks = []; let truncated = false;
  async function walk(relative) {
    let entries;
    try { entries = await readdir(path.join(root, 'dist', relative), { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && /\.(?:js|css)$/.test(name)) {
        if (chunks.length >= 2048) { truncated = true; continue; }
        chunks.push({ file: name, rawBytes: (await stat(path.join(root, 'dist', name))).size });
      }
    }
  }
  await walk('assets');
  chunks.sort((a, b) => b.rawBytes - a.rawBytes || a.file.localeCompare(b.file));
  const report = { format: 'emitted-code-chunks/v1', status: chunks.length ? 'emitted-output-present' : 'no-emitted-code-output', truncated, chunks };
  const dir = path.join(root, 'artifacts/perf'); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'emitted-chunks.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await summarizeEmittedChunks();
  console.log(JSON.stringify({ status: report.status, count: report.chunks.length, truncated: report.truncated, largest: report.chunks.slice(0, 10) }));
}
