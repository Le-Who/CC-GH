/** Native owned-memory pair fixtures. Seed filtering cannot authorize admission. */
import assert from 'node:assert/strict';
import {nativePlayer,NOW,H,EIGHT_FIXTURE_SPECS} from './yard-eight-domain-fixtures.mjs';
import {nativeDrawContext,drawNativeSeed} from './yard-native-draw.mjs';
import {ensurePersistentPlayerYard,executePersistentYardAction,publicPersistentYard} from '../../game-logic/yard-v2/service.mjs';
import {visitReservations,presentationReservationsConflict} from '../../game-logic/yard-v2/visit-reservations.mjs';
import {YARD_FOODS} from '../../game-logic/yard-v2/catalog.mjs';

export function pairSeedSearch({yard,first,second,firstSlot,secondSlot},options,{prefix='yard-native-pair',limit=500000}={}){
 const placement=id=>yard.placedGoodies.find(p=>p.slotId===id),spec=id=>EIGHT_FIXTURE_SPECS[id];
 const firstContext=nativeDrawContext({yard,placement:placement(firstSlot),foodId:spec(first).foodId,scene:options.scene,at:NOW+H});
 const secondContext=nativeDrawContext({yard,placement:placement(secondSlot),foodId:spec(second).foodId,scene:options.scene,at:NOW+2*H});
 const otherFirst=nativeDrawContext({yard,placement:placement(secondSlot),foodId:spec(first).foodId,scene:options.scene,at:NOW+H});
 assert.equal(firstContext.ok,true,JSON.stringify(firstContext.errors));assert.equal(secondContext.ok,true,JSON.stringify(secondContext.errors));
 // Source media readiness does not make a native activity socket reachable.
 // Reject an impossible draw before trying seeds or alternate slot IDs.
 for(const [role,id,context]of [['first',first,firstContext],['second',second,secondContext]]){
  if(!context.activities.some(a=>a.id===spec(id).activityId))throw Error(`Native pair activity unavailable: ${role} ${id}/${spec(id).activityId} (available: ${context.activities.map(a=>a.id).join(',')})`);
 }
 for(let i=0;i<limit;i++){
  const seed=`${prefix}-${first}-${second}-${i}`,a=drawNativeSeed(seed,firstContext),b=drawNativeSeed(seed,secondContext);
  if(a?.visitorId!==spec(first).visitorId||a.activityId!==spec(first).activityId||a.minutes<75||b?.visitorId!==spec(second).visitorId||b.activityId!==spec(second).activityId)continue;
  // With one initial serving, a later slot is never attempted after the first
  // successful admission clears the bowl. Only an earlier slot can steal it.
  if(secondSlot<firstSlot&&drawNativeSeed(seed,otherFirst))continue;
  return{seed,firstDraw:a,secondDraw:b};
 }
 throw Error(`No native pair seed in documented ${limit}-seed search: ${first}/${second}`);
}

export function runNativePair(spec,options){
 const {yard,first,second,firstSlot,secondSlot,seed}=spec,s=EIGHT_FIXTURE_SPECS;
 const p=nativePlayer(first,{id:seed});p.yard.placedGoodies=structuredClone(yard.placedGoodies);p.yard.expansion=structuredClone(yard.expansion);
 // Explicit pre-existing owned test balance, sufficient for the source Berry
 // price (120). This is fixture input, never a runtime grant or start-money change.
 p.yard.currencies.treats=240;
 const adjacent=structuredClone({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount});
 const initial=structuredClone(p.yard);
 for(const now of [NOW,NOW+H])assert.equal(ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options}).status,200);
 const firstRecords=Object.values(p._yardV2.runtime.visits),firstRecord=firstRecords.find(r=>r.original.visitorId===s[first].visitorId&&r.slotId===firstSlot);
 assert.equal(firstRecords.length,firstRecord?1:0,'Unrequested fixture actor must not consume the first serving');
 const firstSnapshot={yard:structuredClone(p.yard),yardRuntime:publicPersistentYard(p,{now:NOW+H,...options})};
 const commandNow=NOW+H+1,foodId=s[second].foodId,buyBefore=structuredClone(p.yard);
 let buyResult=null;
 if(!(p.yard.foodInventory[foodId]>0)){
  buyResult=executePersistentYardAction(p,'yard.buyFood',{foodId,qty:1},{now:commandNow,actionId:`yard-v2:pair-${first}-${second}-buy`,...options});
  assert.equal(buyResult.status,200,JSON.stringify(buyResult));
  for(const key of ['treats','shinyTreats'])assert.equal(p.yard.currencies[key],buyBefore.currencies[key]-(YARD_FOODS[foodId].cost[key]||0));
 }
 const beforeSet=structuredClone(p.yard),setResult=executePersistentYardAction(p,'yard.setFood',{foodId,bowlId:'bowl-1'},{now:commandNow,actionId:`yard-v2:pair-${first}-${second}-set`,...options});
 assert.equal(setResult.status,200,JSON.stringify(setResult));
 if(beforeSet.foodInventory[foodId]===1)assert.equal(Object.hasOwn(p.yard.foodInventory,foodId),false,'source count contract removes exhausted stock');
 else assert.equal(p.yard.foodInventory[foodId],beforeSet.foodInventory[foodId]-1);
 const beforeSecond=JSON.parse(JSON.stringify(p));
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW+2*H,simulate:true,...options}).status,200);
 const all=Object.values(p._yardV2.runtime.visits),secondRecord=all.find(r=>r.original.visitorId===s[second].visitorId&&r.slotId===secondSlot&&r.arrivedAt===NOW+2*H);
 const expectedCount=Number(Boolean(firstRecord))+Number(Boolean(secondRecord));assert.equal(all.length,expectedCount,'Only requested native identities may be admitted');
 if(firstRecord&&secondRecord){assert.equal(presentationReservationsConflict(visitReservations(secondRecord),firstRecord),false);assert.ok(firstRecord.leavesAt>secondRecord.arrivedAt);}
 for(const row of p.yard.placedGoodies){const initialRow=initial.placedGoodies.find(x=>x.slotId===row.slotId),admissions=all.filter(r=>r.slotId===row.slotId).length;assert.equal(row.uses,initialRow.uses+admissions);}
 if(!secondRecord){assert.deepEqual(p.yard.placedGoodies,beforeSecond.yard.placedGoodies);assert.deepEqual(p.yard.bowls,beforeSecond.yard.bowls);assert.deepEqual(p.yard.petbook,beforeSecond.yard.petbook);}
 const view=publicPersistentYard(p,{now:NOW+2*H,...options});assert.ok(view.visits.every(v=>v.renderCompatible));
 assert.deepEqual({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount},adjacent);
 const rejected=p._yardV2.runtime.events.filter(e=>e.type==='admission-blocked-media'&&((e.at===NOW+H&&e.slotId===firstSlot&&e.visitorId===s[first].visitorId)||(e.at===NOW+2*H&&e.slotId===secondSlot&&e.visitorId===s[second].visitorId)));
 return{scope:'Actual native simulation/service, owned memory fixture; no PostgreSQL or full-gameplay claim.',spec,initial,firstRecord:firstRecord||null,secondRecord:secondRecord||null,rejected,firstSnapshot,snapshot:{yard:structuredClone(p.yard),yardRuntime:view},player:p,buyResult,setResult};
}
