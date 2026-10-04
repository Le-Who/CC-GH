import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEightAcceptanceOptions} from './fixtures/yard-eight-canonical/acceptance.mjs';
import {nativePlayer,NOW,H} from './helpers/yard-eight-domain-fixtures.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';

test('legal single-socket Mochi native 110-minute stay preserves admission, completion and collect contracts',()=>{
 const options=createEightAcceptanceOptions(),p=nativePlayer('mochi',{id:'yard-native-mochi110-4382'});
 Object.assign(p.yard.placedGoodies[0],{x:62,y:30});
 const neighbor=structuredClone({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount});
 for(const now of [NOW,NOW+H])assert.equal(ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options}).status,200);
 const records=Object.values(p._yardV2.runtime.visits);assert.equal(records.length,1,JSON.stringify(p._yardV2.runtime.events));
 const record=records[0];assert.equal(record.original.visitorId,'mochi_bunny');assert.equal(record.activityId,'sniff');
 assert.equal(record.leavesAt-record.arrivedAt,110*60000);assert.equal(record.mediaAdmission.plan.clipId,'mochi-mouse-combined-r1');
 assert.equal(p.yard.placedGoodies[0].uses,1);assert.equal(p.yard.bowls[0].servings,0);assert.equal(p.yard.petbook.mochi_bunny.visits,1);
 const restored=JSON.parse(JSON.stringify(p)),bulk=structuredClone(p),balance=structuredClone(p.yard.currencies);
 for(const now of [record.arrivedAt+10*60000,record.arrivedAt+65*60000,record.leavesAt-1]){
  assert.equal(ensurePersistentPlayerYard(restored,{now,simulate:true,...options}).status,200);
  const view=publicPersistentYard(restored,{now,...options});assert.equal(view.visits.length,1);assert.equal(view.visits[0].renderCompatible,true);
  assert.equal(restored.yard.pendingGifts.length,0);assert.equal(restored.yard.placedGoodies[0].uses,1);assert.deepEqual(restored.yard.currencies,balance);
 }
 for(const player of [restored,bulk])assert.equal(ensurePersistentPlayerYard(player,{now:record.leavesAt,simulate:true,...options}).status,200);
 assert.deepEqual(restored,bulk);assert.equal(bulk.yard.pendingGifts.length,1);assert.equal(publicPersistentYard(bulk,{now:record.leavesAt,...options}).visits.length,0);
 const gift=structuredClone(bulk.yard.pendingGifts[0]),actionId='yard-v2:native-mochi110-collect';
 assert.equal(executePersistentYardAction(bulk,'yard.collectGifts',{}, {...options,now:record.leavesAt,actionId}).status,200);
 assert.equal(bulk.yard.pendingGifts.length,0);for(const key of ['treats','shinyTreats'])assert.equal(bulk.yard.currencies[key],balance[key]+gift[key]);
 const claimed=JSON.parse(JSON.stringify(bulk));assert.equal(executePersistentYardAction(claimed,'yard.collectGifts',{}, {...options,now:record.leavesAt+10*H,actionId}).replayed,true);assert.deepEqual(claimed,bulk);
 assert.equal(bulk.yard.placedGoodies[0].uses,1);assert.equal(bulk.yard.petbook.mochi_bunny.visits,1);
 assert.deepEqual({resources:bulk.resources,garden:bulk.garden,merge:bulk.merge,futureAccount:bulk.futureAccount},neighbor);
});
