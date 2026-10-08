import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const text=p=>fs.readFileSync(p,'utf8'),base='ec815065f6adb7c36d81f97b41d47ad16e614b07';
for(const [file,gate] of [['canonical-runtime.mjs','CANONICAL_RUNTIME_ENABLED'],['canonical-visit-reconciliation.mjs','CANONICAL_RECONCILIATION_ENABLED'],
 ['canonical-visit-transaction.mjs','CANONICAL_VISIT_ADMISSION_ENABLED'],['canonical-visit-worker.mjs','CANONICAL_VISIT_WORKER_ENABLED'],['canonical-saved-item-actions.mjs','CANONICAL_SAVED_ITEM_ACTIONS_ENABLED']]){
 assert(text('game-logic/yard-v2/'+file).includes(`export const ${gate}=false;`),gate+' must stay source-owned/default-off');
}
for(const file of ['game-logic/yard-v2/actions.mjs','game-logic/yard-v2/simulation.mjs','game-logic/yard-v2/development-release-policy.mjs'])assert(fs.readFileSync(file).equals(execFileSync('git',['show',base+':'+file])),file);
const route=execFileSync('git',['show',base+':routes/player.js'],{encoding:'utf8'}),needle='    snapshot.serverTime = Date.now();';
const addition=`
    // Saved Yard proof is rekeyed by the winning beforeSync hook. Its HTTP
    // projection must observe that same commit, not the pre-commit cache miss.
    // Reproject only this owner's v3 runtime; other games and saves stay intact.
    if (committed?._yardV2?.version === 3 && snapshot.player.id === committed.id
      && snapshot.yardRuntime?.storageVersion === 3) {
      const { yardRuntime } = releasedYardSnapshot(committed, { now: snapshot.serverTime });
      if (yardRuntime?.storageVersion === 3) snapshot.yardRuntime = yardRuntime;
    }`;
assert.equal(route.split(needle).length,2);assert.equal(text('routes/player.js'),route.replace(needle,needle+addition),'Only the reviewed committed-v3 HTTP projection may differ');
const workflow=text('.github/workflows/yard-item-pickup.yml');
assert(workflow.includes('contents: read'));assert(!/packages: write|ssh-action|build-push-action|docker\/login-action/.test(workflow));
console.log('Default-off pickup, exact committed-v3 route delta, unchanged actions/simulation/development policy and no-publish workflow verified.');
