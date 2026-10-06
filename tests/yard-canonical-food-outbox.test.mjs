/** Actual client outbox, storage journal and domain services; only transport and
 * IndexedDB are substituted. No API server, database, scheduler or media evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({
 resolve(s,c,next){return s==='idb-keyval'?{shortCircuit:true,url:'food-outbox:idb'}:next(s,c);},
 load(u,c,next){return u==='food-outbox:idb'?{shortCircuit:true,format:'module',source:'export const values=new Map();export async function get(k){return structuredClone(values.get(k));}export async function set(k,v){values.set(k,structuredClone(v));}'}:next(u,c);}
});
const {values}=await import('food-outbox:idb');
const {useGameHub:hub}=await import('../src/game-state/useGameHub.js');
const {createDefaultPlayer}=await import('../game-logic/player.js');
const {executePersistentYardAction,ensurePersistentPlayerYard,publicPersistentYard}=await import('../game-logic/yard-v2/service.mjs');
const {CANONICAL_LOCATION}=await import('../game-logic/yard-v2/canonical-locations.mjs');
const {CANONICAL_FOOD_LOCATION}=await import('../game-logic/yard-v2/canonical-food-contract.mjs');
const {prior:old}=await import('./helpers/yard-food-prior-binary.mjs');
const NOW=1791288000000,response=(body,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(body)}),key=id=>'game_hub_yard_outbox_v2:'+encodeURIComponent(id);
function harness(t){
 t.mock.timers.enable({apis:['setTimeout']});let now=NOW;t.mock.method(Date,'now',()=>now);values.clear();
 const local=new Map();globalThis.localStorage={getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v))};
 const p=createDefaultPlayer('food-outbox-owner','Owner',NOW);p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.goodieInventory.leaf_pot=2;ensurePersistentPlayerYard(p,{now:NOW});
 let saved=JSON.stringify(p),mode='v1',lose=null;const sent=[];
 const opts=()=>({now:NOW,canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:mode==='v2'}),read=()=>JSON.parse(saved);
 const snapshot=()=>{const p=read();return {serverTime:now,player:{id:p.id,syncSeq:0},yard:p.yard,yardRuntime:(mode==='old'?old: {publicPersistentYard}).publicPersistentYard(p,opts())};};
 globalThis.fetch=async(path,options)=>{
  if(path==='/api/config')return response({devAuthEnabled:false});
  if(new URL(path,'https://test.invalid').pathname==='/api/player/snapshot')return response(snapshot());
  assert.equal(path,'/api/player/mutate');const command=JSON.parse(options.body);sent.push(structuredClone(command));
  if(lose==='before'){lose=null;throw Error('lost before');}
  const p=read(),result=(mode==='old'?old:{executePersistentYardAction}).executePersistentYardAction(p,command.action,command.payload,{...opts(),actionId:command.clientActionId});saved=JSON.stringify(p);
  if(lose==='after'){lose=null;throw Error('lost after');}
  return response(result.status===200?{success:true,duplicate:result.replayed,snapshot:snapshot()}:{error:result.error,details:result.details},result.status);
 };
 return {read,snapshot,sent,setMode(v){mode=v;},lose(v){lose=v;},tick(){now+=65000;},reload:async()=>{hub.setState({snapshot:null});hub.getState().applySnapshot(snapshot());await hub.getState().hydrateOutbox();},async refresh(){await hub.getState().loadSnapshot();}};
}
const payload=(v2=false,extra={})=>({...v2?CANONICAL_FOOD_LOCATION:CANONICAL_LOCATION,slotId:'canonical:outbox',goodieId:'leaf_pot',x:98,y:118,...extra});

for(const loss of ['before','after'])test(`v1 ${loss}-commit loss replays unchanged against v2; definitive rejection remains durable and releases a new user decision`,async t=>{
 const h=harness(t);await h.reload();h.lose(loss);
 const intent=payload(),queued=await hub.getState().performReliableAction('yard.placeGoodie',intent,{feedback:false});assert.match(queued.clientActionId,/canonical-v1\//);
 assert.equal((await hub.getState().drainOutbox()).error,'NETWORK_ERROR');const original=structuredClone(h.sent[0]);
 h.setMode('v2');h.tick();await h.refresh();const reply=await hub.getState().drainOutbox();assert.deepEqual(h.sent[1],original);
 if(loss==='after'){
  assert.equal(reply.success,true);assert.equal(reply.duplicate,true);assert.equal(hub.getState().snapshot.yardRuntime.itemPlacementCapabilities.geometryRevision,CANONICAL_FOOD_LOCATION.geometryRevision);assert.equal(h.read().yard.goodieInventory.leaf_pot,1);assert.deepEqual(values.get(key(h.read().id)).items,[]);
 }else{
  assert.equal(reply.error,'CANONICAL_COMMAND_SUPERSEDED');const retained=structuredClone(values.get(key(h.read().id)).items[0]);
  assert.equal(retained.status,'failed');assert.equal(retained.requiresUserDecision,true);assert.equal(retained.clientActionId,original.clientActionId);assert.deepEqual(retained.payload,original.payload);assert.equal(h.read().yard.goodieInventory.leaf_pot,2);
  await h.reload();assert.deepEqual(values.get(key(h.read().id)).items[0],retained);assert.equal(hub.getState().isBusy(retained.entityKey),false);assert.equal(await hub.getState().drainOutbox(),null);assert.equal(h.sent.length,2);
  const next=await hub.getState().performReliableAction('yard.placeGoodie',payload(true),{feedback:false});assert.match(next.clientActionId,/canonical-v2\//);assert.notEqual(next.clientActionId,retained.clientActionId);
  assert.equal((await hub.getState().drainOutbox()).success,true);assert.equal(h.read().yard.goodieInventory.leaf_pot,1);assert.deepEqual(values.get(key(h.read().id)).items,[retained]);
 }
});

for(const loss of ['before','after'])test(`v2 ${loss}-commit loss ${loss==='after'?'settles exact receipt on':'quarantines unchanged on and recovers from'} actual v1 binary`,async t=>{
 const h=harness(t);h.setMode('v2');await h.reload();h.lose(loss);
 const intent=payload(true),queued=await hub.getState().performReliableAction('yard.placeGoodie',intent,{feedback:false});assert.match(queued.clientActionId,/canonical-v2\//);
 assert.equal((await hub.getState().drainOutbox()).error,'NETWORK_ERROR');const original=structuredClone(h.sent[0]);
 h.setMode('old');h.tick();const oldReply=await hub.getState().drainOutbox();
 if(loss==='after'){assert.equal(oldReply.success,true);assert.equal(oldReply.duplicate,true);assert.deepEqual(h.sent[1],original);assert.deepEqual(values.get(key(h.read().id)).items,[]);assert.equal(h.read().yard.goodieInventory.leaf_pot,1);return;}
 assert.equal(oldReply.error,'CANONICAL_NONCE_REQUIRED');const retained=structuredClone(values.get(key(h.read().id)).items[0]);assert.equal(retained.status,'canonical-blocked');assert.deepEqual(retained.payload,intent);assert.equal(retained.clientActionId,queued.clientActionId);
 await h.reload();await hub.getState().drainOutbox();assert.equal(h.sent.length,2);assert.deepEqual(values.get(key(h.read().id)).items[0],retained);
 h.setMode('v2');h.tick();await h.refresh();const reply=await hub.getState().drainOutbox();assert.equal(reply.success,true);assert.equal(reply.duplicate,loss==='after');assert.deepEqual(h.sent[2],original);assert.equal(h.read().yard.goodieInventory.leaf_pot,1);assert.deepEqual(values.get(key(h.read().id)).items,[]);
});

test('malformed claimed terminal rejection stays quarantined and inspectable',async t=>{
 const h=harness(t);await h.reload();await hub.getState().performReliableAction('yard.placeGoodie',payload(),{feedback:false});
 const actual=globalThis.fetch;globalThis.fetch=async(path,options)=>path==='/api/player/mutate'?response({error:'CANONICAL_COMMAND_SUPERSEDED',details:{disposition:'retained-user-decision',actionId:'wrong'}},400):actual(path,options);
 assert.equal((await hub.getState().drainOutbox()).error,'CANONICAL_COMMAND_SUPERSEDED');const retained=values.get(key(h.read().id)).items[0];assert.equal(retained.status,'canonical-blocked');assert.equal(retained.requiresUserDecision,undefined);assert.deepEqual(retained.payload,payload());assert.equal(h.read().yard.goodieInventory.leaf_pot,2);
});
