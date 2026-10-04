/** Copy reviewed frozen runtime bytes; never generate art or enable Yard. */
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'recovery-tools/yard-family-frozen';
const MAP = 'scripts/yard-public-media.json';
const MIME = { '.json': 'application/json', '.webp': 'image/webp' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = name => /^assets\/yard-family\/(?:basil|sage|starlit|willow)\/runtime-media\.json$/.test(name)
  || /^assets\/yard-(?:fox|turtles)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.webp$/.test(name);

async function checkedPath(root, name) {
  const target = resolve(root, name);
  if (isAbsolute(name) || target === root || !target.startsWith(root + sep)) throw Error(`Unsafe Yard media path: ${name}`);
  // Do not follow source or output symlinks outside the owned tree.
  let cursor = target;
  while (cursor !== root) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw Error(`Symlink in Yard media path: ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    cursor = dirname(cursor);
  }
  return target;
}

function checkBytes(bytes, row) {
  if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw Error(`Frozen Yard media mismatch: ${row.path}`);
  if (row.contentType !== MIME[extname(row.path)]) throw Error(`Unexpected Yard media MIME: ${row.path}`);
  if (row.contentType === 'image/webp' && (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP'
    || bytes.readUInt32LE(4) + 8 !== bytes.length)) throw Error(`Invalid WebP bytes: ${row.path}`);
  if (row.contentType === 'application/json') JSON.parse(bytes.toString('utf8'));
}

export async function readYardPublicMediaMap(rootDir = process.cwd()) {
  const map = JSON.parse(await readFile(resolve(rootDir, MAP), 'utf8'));
  if (map.format !== 'yard-public-media/v1' || map.runtimeActivated !== false || !Array.isArray(map.files)) throw Error('Invalid frozen Yard delivery map');
  const seen = new Set();
  for (const row of map.files) {
    if (!allowed(row.path) || seen.has(row.path) || !Number.isSafeInteger(row.bytes) || row.bytes <= 0
      || !/^[a-f0-9]{64}$/.test(row.sha256) || row.contentType !== MIME[extname(row.path)]) throw Error(`Invalid Yard delivery row: ${row.path}`);
    seen.add(row.path);
  }
  if (map.files.length !== map.totalFiles || map.files.reduce((sum, row) => sum + row.bytes, 0) !== map.totalBytes) throw Error('Yard delivery totals differ');
  return map;
}

export async function materializeYardPublicMedia({ rootDir = process.cwd(), outputDir = 'public', check = false, verify = false } = {}) {
  const root = await realpath(rootDir), output = await checkedPath(root, outputDir);
  const map = await readYardPublicMediaMap(root), pending = [];
  const expected = new Set(map.files.map(row => row.path));
  async function checkOutputInventory(name) {
    const dir = await checkedPath(output, name);
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const child = `${name}/${entry.name}`;
      if (entry.isDirectory()) await checkOutputInventory(child);
      else if (!entry.isFile() || !expected.has(child)) throw Error(`Unexpected Yard output: ${child}`);
    }
  }
  for (const family of ['family', 'fox', 'turtles']) await checkOutputInventory(`assets/yard-${family}`);
  // Validate all inputs and existing outputs before writing any file.
  for (const row of map.files) {
    const target = await checkedPath(output, row.path);
    if (verify) { checkBytes(await readFile(target), row); continue; }
    const source = await checkedPath(root, `${SOURCE}/${row.path}`);
    checkBytes(await readFile(source), row);
    try { checkBytes(await readFile(target), row); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      pending.push({ row, source, target });
    }
  }
  if (!check && !verify) for (const { row, source, target } of pending) {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    checkBytes(await readFile(target), row);
  }
  return { status: verify ? 'yard-public-media-verified' : check ? 'yard-public-media-preflight' : 'yard-public-media-materialized',
    runtimeActivated: false, files: map.totalFiles, totalBytes: map.totalBytes, newFiles: pending.length,
    newBytes: pending.reduce((sum, item) => sum + item.row.bytes, 0), outputDir: relative(root, output) };
}

/** Vite copies public/ after this hook, for both normal and Docker builds. */
export function yardPublicMedia() {
  return { name: 'yard-frozen-public-media', async configResolved(config) {
    if (!config.publicDir) throw Error('Frozen Yard delivery requires Vite publicDir');
    const result = await materializeYardPublicMedia({ rootDir: config.root, outputDir: relative(config.root, config.publicDir) });
    config.logger.info(`Yard frozen media: ${result.files} files, ${result.totalBytes} bytes (gates unchanged)`);
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), verify = args[0] === '--verify';
  if (args.length && !(args.length === 1 && args[0] === '--check') && !(args.length === 2 && verify)) throw Error('Usage: node scripts/yard-public-media.mjs [--check | --verify dist]');
  console.log(JSON.stringify(await materializeYardPublicMedia({ check: args[0] === '--check', verify, outputDir: verify ? args[1] : 'public' })));
}
