/** Real client API serialization/outbox and real player action/snapshot routes.
 * Only the socket boundary and IDB are replaced; each request reloads JSON bytes.
 * PostgreSQL/Express socket/browser acceptance remains a separate qualification. */
import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const capabilityURL=new URL('../game-logic/yard-v2/canonical-locations.mjs',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return specifier==='idb-keyval'?{shortCircuit:true,url:'canonical-client:idb'}:next(specifier,context);},
 load(url,context,next){
  if(url==='canonical-client:idb')return{shortCircuit:true,format:'module',source:'export const values=new Map();export async function get(key){return structuredClone(values.get(key));}export async function set(key,value){values.set(key,structuredClone(value));}'};
  if(url===capabilityURL){const source=readFileSync(new URL(url),'utf8'),literal='export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;';assert.equal(source.split(literal).length,2);return{shortCircuit:true,format:'module',source:source.replace(literal,'export const CANONICAL_ITEM_PLACEMENT_ENABLED = true;')};}
  return next(url,context);
 }
});
const {values}=await import('canonical-client:idb');
const {useGameHub:hub}=await import('../src/game-state/useGameHub.js');
const {applyActionWithReceipt,buildSnapshot}=await import('../routes/player.js');
const {NOW,canonicalFixture,canonicalPayload,assertCanonicalIsolation}=await import('./helpers/yard-canonical-item-fixture.mjs');
const {placementCommand}=await import('../src/games/companion-yard-v2/placement-recovery.mjs');
const root=new URL('../',import.meta.url),base='4660ba9d84a0abb40f7c77bed7a702caba18b67b';
const source=path=>execFileSync('git',['show',`${base}:${path}`],{cwd:root,encoding:'utf8'});
const url=(path,text)=>'data:text/javascript;base64,'+Buffer.from(text.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from '${new URL(relative,new URL(path,root)).href}'`)).toString('base64');
const oldActions=url('game-logic/yard-v2/actions.mjs',source('game-logic/yard-v2/actions.mjs'));
const old=await import(url('game-logic/yard-v2/service.mjs',source('game-logic/yard-v2/service.mjs').replace("'./actions.mjs'",`'${oldActions}'`)));
const response=(body,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(body)});
const journal=id=>`game_hub_yard_outbox_v2:${encodeURIComponent(id)}`;
for(const committedBeforeLoss of[false,true])test(`exact client slash nonce and location survive actual route/reload/old/new (${committedBeforeLoss?'committed':'uncommitted'} loss)`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let now=NOW;t.mock.method(Date,'now',()=>now);values.clear();
 const fallback=new Map();globalThis.localStorage={getItem:k=>fallback.get(k)??null,setItem:(k,v)=>fallback.set(k,String(v))};
 const initial=canonicalFixture();buildSnapshot(initial);const before=structuredClone(initial),accountId=initial.id;let saved=JSON.stringify(initial),active=true,loss=true;const outgoing=[];
 const read=()=>JSON.parse(saved),snapshot=()=>{const clientNow=now;now=NOW;try{const p=read(),s=buildSnapshot(p);if(!active)s.yardRuntime=old.publicPersistentYard(p,{now:NOW});return s;}finally{now=clientNow;}};
 globalThis.fetch=async(path,options)=>{
  if(path==='/api/config')return response({devAuthEnabled:false});
  if(new URL(path,'https://fixture.invalid').pathname==='/api/player/snapshot')return response(snapshot());
  assert.equal(path,'/api/player/mutate');const command=JSON.parse(options.body);outgoing.push(command);
  assert.match(command.clientActionId,/^yard-v2:canonical-v1\/[A-Za-z0-9_.:-]{1,96}$/);
  for(const key of['locationId','locationVersion','geometryRevision'])assert.equal(command.payload[key],canonicalPayload()[key]);
  if(loss&&!committedBeforeLoss){loss=false;throw Error('lost before commit');}
  const p=read(),clientNow=now;now=NOW;let result;
  try{result=active?await applyActionWithReceipt(p,command.action,command.payload,{clientActionId:command.clientActionId,serverNow:NOW})
   :(()=>{const r=old.executePersistentYardAction(p,command.action,command.payload,{actionId:command.clientActionId,now:NOW});return{status:r.status,body:{error:r.error}};})();}finally{now=clientNow;}
  saved=JSON.stringify(p);
  if(loss){loss=false;throw Error('lost committed response');}
  return response(result.body,result.status);
 };
 hub.setState({snapshot:null});hub.getState().applySnapshot(snapshot());await hub.getState().hydrateOutbox();
 const submitted=await hub.getState().performReliableAction('yard.placeGoodie',canonicalPayload(),{feedback:false});assert.match(submitted.clientActionId,/^yard-v2:canonical-v1\//);
 assert.equal((await hub.getState().drainOutbox()).error,'NETWORK_ERROR');assert.equal(read().yard.goodieInventory.leaf_pot,2-Number(committedBeforeLoss));
 active=false;now+=4000;
 assert.equal((await hub.getState().drainOutbox()).error,committedBeforeLoss?'UNSUPPORTED_YARD_STORAGE_VERSION':'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT');
 const held=structuredClone(values.get(journal(accountId)).items[0]);assert.equal(held.status,'canonical-blocked');assert.equal(held.clientActionId,submitted.clientActionId);assert.deepEqual(held.payload,canonicalPayload());
 hub.setState({snapshot:null});hub.getState().applySnapshot(snapshot());await hub.getState().hydrateOutbox();await hub.getState().drainOutbox();assert.equal(outgoing.length,2);
 assert.deepEqual(values.get(journal(accountId)).items[0],held);active=true;now+=4000;await hub.getState().loadSnapshot();
 const resumed=await hub.getState().drainOutbox();assert.equal(resumed.success,true);assert.equal(resumed.duplicate,committedBeforeLoss);
 assert.deepEqual(outgoing[1],outgoing[0]);assert.deepEqual(outgoing[2],outgoing[0]);assert.equal(read().yard.goodieInventory.leaf_pot,1);assert.equal(read()._yardV2.version,2);
 assert.deepEqual(hub.getState().snapshot.yardRuntime.canonicalPlacements,read()._yardV2.runtime.canonicalPlacements);
 hub.setState({snapshot:null});hub.getState().applySnapshot(snapshot());await hub.getState().hydrateOutbox();assert.equal(hub.getState().snapshot.yardRuntime.canonicalPlacements[0].x,98);
 const move=placementCommand({...canonicalPayload(),placing:false,x:72,y:145});assert.equal(Object.hasOwn(move.payload,'goodieId'),false);
 await hub.getState().performReliableAction(move.action,move.payload,{feedback:false});assert.equal((await hub.getState().drainOutbox()).success,true);assert.equal(read()._yardV2.runtime.canonicalPlacements[0].x,72);
 const pickup={...canonicalPayload()};delete pickup.goodieId;delete pickup.x;delete pickup.y;
 await hub.getState().performReliableAction('yard.pickupGoodie',pickup,{feedback:false});assert.equal((await hub.getState().drainOutbox()).success,true);
 assert.deepEqual(read()._yardV2.runtime.canonicalPlacements,[]);assert.equal(read().yard.goodieInventory.leaf_pot,2);assert.deepEqual(values.get(journal(accountId)).items,[]);assertCanonicalIsolation(before,read());
});
