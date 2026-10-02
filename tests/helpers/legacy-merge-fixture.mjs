/** Explicitly isolated pre-V3 regression fixture. Never imported by production code.
 * Re-evaluates the real route module under a unique URL, disabling ONLY automatic V3
 * snapshot migration in that copy. The source policy, normal route module and V3 tests
 * stay enabled. All old economy assertions continue to exercise retained legacy code.
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const target = new URL('../../routes/player.js?legacy-merge-fixture-v1', import.meta.url).href;
const marker = 'if (MERGE_LAB_RELEASE_POLICY.enabled) ensureMergeLabState(p, { now });';
const hooks = registerHooks({
  load(url, context, next) {
    if (url !== target) return next(url, context);
    const source = readFileSync(new URL('../../routes/player.js', import.meta.url), 'utf8');
    if (source.split(marker).length !== 2) throw new Error('Legacy fixture boundary changed; review migration isolation');
    return { shortCircuit: true, format: 'module', source: source.replace(marker, '// Isolated retained-legacy fixture: no V3 snapshot migration.') };
  },
});
let route;
try { route = await import(target); } finally { hooks.deregister(); }
export const applyLegacyMergeAction = (player, action, ...args) => {
  if (!String(action).startsWith('merge.') || action === 'merge.lab' || player.merge?.schemaVersion === 3) throw new Error('Legacy-only fixture cannot execute production V3 or unrelated actions');
  return route.applyAction(player, action, ...args);
};
export const buildLegacyMergeSnapshot = player => {
  if (player.merge?.schemaVersion === 3) throw new Error('Legacy-only fixture requires pre-V3 state');
  return route.buildSnapshot(player);
};
