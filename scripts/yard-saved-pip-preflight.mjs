import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const text=p=>fs.readFileSync(p,'utf8');
assert(text('game-logic/yard-v2/canonical-runtime.mjs').includes('export const CANONICAL_RUNTIME_ENABLED=false;'));
assert(text('game-logic/yard-v2/canonical-visit-reconciliation.mjs').includes('export const CANONICAL_RECONCILIATION_ENABLED=false;'));
assert(text('game-logic/yard-v2/canonical-visit-transaction.mjs').includes('export const CANONICAL_VISIT_ADMISSION_ENABLED=false;'));
assert(text('game-logic/yard-v2/canonical-visit-worker.mjs').includes('export const CANONICAL_VISIT_WORKER_ENABLED=false;'));
for(const path of ['routes/player.js','game-logic/yard-v2/actions.mjs','game-logic/yard-v2/simulation.mjs','game-logic/yard-v2/development-release-policy.mjs']){
 const live=execFileSync('git',['show','9b6b96b4:'+path]);assert(fs.readFileSync(path).equals(live),`Runtime entrypoint changed: ${path}`);
}
assert(!text('.github/workflows/yard-saved-pip-source.yml').includes('packages: write'));
console.log('Default-off normal-runtime integration, unchanged route/actions/simulation/development entrypoints, and no-publish workflow verified.');
