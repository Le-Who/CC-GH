/** Build-only partition of exact immutable JSON; no actor/source/gate changes. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import contracts from './yard-contract-data.json' with { type: 'json' };
import { collectInitialShellFiles } from './sw-shell-precache.mjs';

export const YARD_CONTRACT_DATA_MODULES = new Set(contracts.files.map(row => row.path));
export const YARD_DATA_OUTPUT_PREFIX = 'assets/yard-data/';
const normalize = id => id.split('?')[0].replaceAll('\\', '/');
const local = (id, root) => path.relative(root, normalize(id)).replaceAll('\\', '/');
export function yardContractChunk(id, root) {
  const source = local(id, root);
  return YARD_CONTRACT_DATA_MODULES.has(source)
    ? `yard-data-${source.slice('game-logic/yard-v2/media/'.length, -'.json'.length).replaceAll('/', '-')}` : undefined;
}
export function yardChunkFileNames(chunk) {
  return chunk.name.startsWith('yard-data-') ? `${YARD_DATA_OUTPUT_PREFIX}[name]-[hash].js` : 'assets/[name]-[hash].js';
}

export function yardContractData() {
  let root;
  return {
    name: 'exact-lazy-yard-contract-data', apply: 'build',
    configResolved(config) { root = config.root; },
    async buildStart() {
      for (const row of contracts.files) {
        if (!row.path.startsWith('game-logic/yard-v2/media/') || !row.path.endsWith('.json')) throw Error('Only explicit Yard JSON may be data-only');
        const bytes = await readFile(path.join(root, row.path));
        if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error(`Frozen Yard contract changed: ${row.path}`);
        JSON.parse(bytes.toString('utf8'));
      }
    },
    generateBundle(_options, bundle) {
      const shell = collectInitialShellFiles(bundle);
      for (const chunk of Object.values(bundle).filter(item => item.type === 'chunk')) {
        const sources = Object.entries(chunk.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => local(id, root));
        const data = sources.filter(source => YARD_CONTRACT_DATA_MODULES.has(source));
        const dataPath = chunk.fileName.startsWith(YARD_DATA_OUTPUT_PREFIX);
        if (data.length && (!dataPath || data.length !== sources.length)) throw Error(`Yard JSON mixed into executable chunk: ${chunk.fileName}`);
        if (dataPath && (!data.length || data.length !== sources.length || chunk.imports.length || chunk.dynamicImports.length || chunk.viteMetadata?.importedCss?.size || chunk.viteMetadata?.importedAssets?.size)) throw Error(`Executable code cannot be classified as Yard data: ${chunk.fileName}`);
        if (dataPath && shell.has(chunk.fileName)) throw Error(`Yard contract data entered the startup shell: ${chunk.fileName}`);
      }
    },
  };
}
