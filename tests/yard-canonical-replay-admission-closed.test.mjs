import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {withPlayerLock} from '../playerManager.js';
import {CANONICAL_VISIT_ADMISSION_ENABLED} from '../game-logic/yard-v2/canonical-visit-transaction.mjs';
import {createCanonicalVisitReconciler} from '../game-logic/yard-v2/canonical-visit-reconciliation.mjs';

test('closing new admission still replays and settles an already admitted source record',async t=>{
 assert.equal(CANONICAL_VISIT_ADMISSION_ENABLED,false);
 const player=JSON.parse(fs.readFileSync(new URL('../test-results/saved-visit/qualified-player.json',import.meta.url),'utf8'));
 const visit=Object.values(player._yardV2.runtime.canonicalVisits)[0],originalNow=Date.now;Date.now=()=>visit.leavesAt;t.after(()=>{Date.now=originalNow;});
 const observations=[],service=createCanonicalVisitReconciler({onObservation:r=>observations.push(r)});t.after(()=>service.close());
 await withPlayerLock(player.id,p=>{for(const k of Object.keys(p))delete p[k];Object.assign(p,player);});
 assert.equal((await service.recover(player.id)).state,'pending');
 const end=performance.now()+35000;while(!observations.some(r=>r.state==='completed'||r.state==='unavailable')&&performance.now()<end)await delay(20);
 assert.ok(observations.some(r=>r.state==='completed'),JSON.stringify(observations));
 await withPlayerLock(player.id,p=>{assert.equal(p.yard.pendingGifts.filter(g=>g.id===visit.giftId).length,1);assert.equal(p.yard.bowls[0].servings,3);});
});
