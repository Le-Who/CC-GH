/** Build-only partition of exact immutable JSON; no actor/source/gate changes. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { ACTIVE_CONTRACT_PATH, SOURCE_PINS, fingerprint, promoteExactBytes, verifyActiveRuntime } from './yard-active-contract.mjs';
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
      const activePath = path.join(root, ACTIVE_CONTRACT_PATH);
      const hasActiveContract = existsSync(activePath);
      const active = hasActiveContract ? JSON.parse(await readFile(activePath, 'utf8')) : null;
      const family = 'game-logic/yard-v2/media/family-actor-profiles.json';
      if (hasActiveContract) {
        assert.ok(active && typeof active === 'object' && !Array.isArray(active), 'ACTIVE contract must be an object');
        assert.equal(active.format, 'yard-active-contract/v1');
        assert.equal(active.mode, 'ACTIVE');
        assert.equal(active.revision, 'yard-player-rollout/active-r1');
        assert.ok(Array.isArray(active.transitions));
      }
      for (const row of contracts.files) {
        if (!row.path.startsWith('game-logic/yard-v2/media/') || !row.path.endsWith('.json')) throw Error('Only explicit Yard JSON may be data-only');
        const bytes = await readFile(path.join(root, row.path));
        if (hasActiveContract && row.path === family) {
          const transitions = active.transitions.filter(item => item.path === family);
          assert.equal(transitions.length, 1, 'Exactly one family readiness transition required');
          const transition = transitions[0];
          const archive = `preview/yard-persistent-candidate/history/pre-activation/promoted-inputs/${family}`;
          assert.equal(transition.archive, archive, 'Exact archived CLOSED family path required');
          assert.equal(row.sha256, SOURCE_PINS[family]);
          const before = await readFile(path.join(root, archive));
          assert.equal(fingerprint(before).sha256, row.sha256, 'Archived family bytes changed');
          assert.deepEqual(transition.before, fingerprint(before));
          assert.deepEqual(transition.after, fingerprint(bytes));
          assert.equal(bytes.toString('utf8'), promoteExactBytes(family, before, active.inputs?.closed), 'Only exact family readiness promotion is buildable');
        } else if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw Error(`Frozen Yard contract changed: ${row.path}`);
        JSON.parse(bytes.toString('utf8'));
      }
      // Docker build has no Git/recovery fixtures; CI separately verifies full
      // provenance and the tree before this filesystem-only readiness check.
      if (hasActiveContract) await verifyActiveRuntime(root);
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
