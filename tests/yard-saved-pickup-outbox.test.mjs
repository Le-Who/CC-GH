import test,{beforeEach} from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
import {pickupSnapshot,RELEASE} from './fixtures/saved-pickup-client-snapshot.mjs';
import {CANONICAL_FOOD_LOCATION,CANONICAL_FOOD_NONCE_PREFIX} from '../game-logic/yard-v2/canonical-food-protocol.mjs';
const hooks=registerHooks({resolve(s,c,next){if(s==='idb-keyval')return{shortCircuit:true,url:'saved-pickup:idb'};return next(s,c);},load(u,c,next){if(u==='saved-pickup:idb')return{shortCircuit:true,format:'module',source:'export const values=new Map();export const get=async k=>structuredClone(values.get(k));export const set=async(k,v)=>{values.set(k,structuredClone(v));};'};return next(u,c);}});
const storage=await import('saved-pickup:idb'),{useGameHub:hub}=await import('../src/game-state/useGameHub.js');hooks.deregister();
const key=id=>`game_hub_yard_outbox_v2:${encodeURIComponent(id)}`,ACTION='yard.pickupGoodie';
const payload={...CANONICAL_FOOD_LOCATION,slotId:'canonical:a'},nonce=CANONICAL_FOOD_NONCE_PREFIX+'durable-pickup';
const response=(body,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(body),json:async()=>body});
const item=extra=>({accountId:'pickup-owner',clientActionId:nonce,action:ACTION,payload,entityKey:'slot:canonical:a',status:'pending',attempts:0,createdAt:RELEASE,intentServerTime:RELEASE,nextAttemptAt:0,...extra});
function reset(s=pickupSnapshot()){hub.setState({snapshot:null});hub.getState().applySnapshot(s);hub.setState({status:'ready',message:'',busy:{},pendingActions:[],outboxLoaded:true,outboxAccountId:s.player.id,outboxStorageError:null,lastResult:null});}
beforeEach(t=>{t.mock.timers.enable({apis:['setTimeout']});storage.values.clear();const local=new Map();globalThis.localStorage={getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v))};globalThis.fetch=async p=>{if(p==='/api/config')return response({devAuthEnabled:false});throw Error('Unexpected request '+p);};reset();});

test('pickup pending denial retains its exact journal; only later fresh HTTP scope resumes even after removal',async t=>{
 let posts=0,reads=0;const bodies=[];
 globalThis.fetch=async(p,o)=>{if(p==='/api/config')return response({devAuthEnabled:false});if(new URL(p,'https://fixture.invalid').pathname==='/api/player/snapshot'){reads++;return response(pickupSnapshot({seq:20+reads,now:RELEASE+reads,removed:true}));}bodies.push(JSON.parse(o.body));posts++;return posts===1?response({error:'CANONICAL_ACTION_RECONCILIATION_PENDING'},409):response({success:true,duplicate:true,snapshot:pickupSnapshot({seq:30,now:RELEASE+10,removed:true})});};
 await hub.getState().enqueueYardAction(ACTION,payload,{clientActionId:nonce,feedback:false});await hub.getState().drainOutbox();
 const held=structuredClone(hub.getState().pendingActions[0]);assert.equal(held.status,'canonical-blocked');assert.equal(held.requiresYardResume,true);assert.equal(posts,1);assert.equal(reads,1);
 t.mock.timers.tick(600000);await hub.getState().drainOutbox();assert.equal(posts,1);assert.deepEqual(storage.values.get(key('pickup-owner')).items[0],held);
 hub.getState().applySnapshot(pickupSnapshot({seq:25,now:RELEASE+5,removed:true}));await hub.getState().drainOutbox();assert.equal(posts,1,'realtime cannot grant paused HTTP replay');
 await hub.getState().loadSnapshot();await hub.getState().drainOutbox();assert.equal(posts,1,'an older HTTP response cannot resume');
 globalThis.fetch=async(p,o)=>{if(p==='/api/config')return response({devAuthEnabled:false});if(new URL(p,'https://fixture.invalid').pathname==='/api/player/snapshot')return response(pickupSnapshot({seq:26,now:RELEASE+6,removed:true}));bodies.push(JSON.parse(o.body));posts++;return response({success:true,duplicate:true,snapshot:pickupSnapshot({seq:30,now:RELEASE+10,removed:true})});};
 await hub.getState().loadSnapshot();await hub.getState().drainOutbox();assert.equal(posts,2);assert.deepEqual(bodies[1],bodies[0]);assert.deepEqual(storage.values.get(key('pickup-owner')).items,[]);assert.equal(hub.getState().snapshot.yardRuntime.mutable,false);
});

test('new pickup stays unavailable before release or after removal and never enables place/move',async()=>{
 for(const snapshot of [pickupSnapshot({now:RELEASE-1}),pickupSnapshot({removed:true})]){reset(snapshot);const result=await hub.getState().enqueueYardAction(ACTION,payload,{clientActionId:nonce});assert.equal(result.error,'CANONICAL_PICKUP_NOT_READY');assert.deepEqual(hub.getState().pendingActions,[]);}
 reset();for(const action of ['yard.placeGoodie','yard.moveGoodie'])assert.equal((await hub.getState().enqueueYardAction(action,{...payload,x:98,y:118},{clientActionId:nonce})).error,'CANONICAL_ITEM_PLACEMENT_DISABLED');
});

test('pickup-only authority never resumes legacy or canonical placement journals',async()=>{
 for(const legacy of [false,true]){
  reset();const held=item({action:'yard.placeGoodie',clientActionId:legacy?'yard-v2:retained-legacy':CANONICAL_FOOD_NONCE_PREFIX+'retained-place',payload:legacy?{slotId:'old',goodieId:'leaf_pot',x:40,y:40}:{...payload,goodieId:'leaf_pot',x:98,y:118},status:'canonical-blocked',requiresYardResume:true,attempts:1});
  hub.setState({pendingActions:[held]});let posts=0;
  globalThis.fetch=async p=>{if(p==='/api/config')return response({devAuthEnabled:false});if(new URL(p,'https://fixture.invalid').pathname==='/api/player/snapshot')return response(pickupSnapshot({seq:20,now:RELEASE+10}));posts++;throw Error('Placement must not POST');};
  await hub.getState().loadSnapshot();await hub.getState().drainOutbox();assert.equal(posts,0);assert.equal(hub.getState().pendingActions[0].clientActionId,held.clientActionId);
 }
});

test('hydrated pickup keeps account/nonce fences and can replay without a currently owned slot',async()=>{
 const held=item({status:'canonical-blocked',requiresYardResume:true,attempts:2});storage.values.set(key('pickup-owner'),{version:2,accountId:'pickup-owner',items:[held]});reset(pickupSnapshot({removed:true}));hub.setState({outboxLoaded:false});let posts=0,body;
 globalThis.fetch=async(p,o)=>{if(p==='/api/config')return response({devAuthEnabled:false});if(new URL(p,'https://fixture.invalid').pathname==='/api/player/snapshot')return response(pickupSnapshot({seq:20,now:RELEASE+1,removed:true}));posts++;body=JSON.parse(o.body);return response({success:true,duplicate:true,snapshot:pickupSnapshot({seq:21,now:RELEASE+2,removed:true})});};
 await hub.getState().hydrateOutbox();await hub.getState().drainOutbox();assert.equal(posts,0);await hub.getState().loadSnapshot();await hub.getState().drainOutbox();assert.equal(posts,1);assert.equal(body.clientActionId,held.clientActionId);assert.deepEqual(body.payload,held.payload);
 reset(pickupSnapshot({id:'other-owner'}));hub.setState({pendingActions:[held]});await hub.getState().drainOutbox();assert.equal(posts,1);
});
