/** Real player routes, ordinary Yard action receipts and durable client outbox.
 * IDB and HTTP transport are replaced; stored JSON is reloaded per request.
 * The canonical capability is enabled only inside this bounded test process. */
import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const capabilityURL=new URL('../game-logic/yard-v2/canonical-locations.mjs',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){return specifier==='idb-keyval'?{shortCircuit:true,url:'acquisition-client:idb'}:next(specifier,context);},
 load(url,context,next){
  if(url==='acquisition-client:idb')return{shortCircuit:true,format:'module',source:'export const values=new Map();export async function get(key){return structuredClone(values.get(key));}export async function set(key,value){values.set(key,structuredClone(value));}'};
  if(url===capabilityURL){const source=readFileSync(new URL(url),'utf8'),closed='export const CANONICAL_ITEM_PLACEMENT_ENABLED = false;';assert.equal(source.split(closed).length,2);return{shortCircuit:true,format:'module',source:source.replace(closed,'export const CANONICAL_ITEM_PLACEMENT_ENABLED = true;')};}
  return next(url,context);
 }
});
const {values}=await import('acquisition-client:idb');
const {useGameHub:hub}=await import('../src/game-state/useGameHub.js');
const {applyActionWithReceipt,buildSnapshot}=await import('../routes/player.js');
const {createDefaultPlayer}=await import('../game-logic/player.js');
const {NOW,canonicalPayload}=await import('./helpers/yard-canonical-item-fixture.mjs');
const {YARD_GOODIES}=await import('../game-logic/yard-catalog.js');
const root=new URL('../',import.meta.url),oldRevision='4660ba9d84a0abb40f7c77bed7a702caba18b67b';
const source=path=>execFileSync('git',['show',`${oldRevision}:${path}`],{cwd:root,encoding:'utf8'});
const moduleURL=(path,text)=>'data:text/javascript;base64,'+Buffer.from(text.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from '${new URL(relative,new URL(path,root)).href}'`)).toString('base64');
const oldActions=moduleURL('game-logic/yard-v2/actions.mjs',source('game-logic/yard-v2/actions.mjs'));
const old=await import(moduleURL('game-logic/yard-v2/service.mjs',source('game-logic/yard-v2/service.mjs').replace("'./actions.mjs'",`'${oldActions}'`)));
const response=(body,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(body)});
const journal=id=>`game_hub_yard_outbox_v2:${encodeURIComponent(id)}`;
const buyPayload={goodieId:'leaf_pot'};
const request=(p,action,payload,clientActionId)=>applyActionWithReceipt(p,action,payload,{clientActionId,serverNow:NOW});
function player(t,treats){t.mock.method(Date,'now',()=>NOW);const p=createDefaultPlayer('acquisition-player','Owner',NOW);if(treats!==undefined)p.yard.currencies.treats=treats;buildSnapshot(p);return p;}

test('real starter wallet cannot acquire a pot; rejection receipt cannot spend after later funding',async t=>{
 const p=player(t),before=structuredClone(p.yard),payload={...buyPayload},nonce='yard-v2:insufficient-pot';
 assert.equal(before.currencies.treats,80);assert.equal(before.goodieInventory.leaf_pot,undefined);assert.deepEqual(YARD_GOODIES.leaf_pot.cost,{treats:140,shinyTreats:0});
 assert.equal(buildSnapshot(p).yardRuntime.supportedBindings.goodies.leaf_pot.buy,true);
 const failed=await request(p,'yard.buyGoodie',payload,nonce);assert.equal(failed.status,400);assert.equal(failed.body.error,'not enough yard currency');assert.deepEqual(p.yard,before);
 const deniedReceipt=structuredClone(p._yardV2.runtime.commandReceipts[nonce]);
 p.yard.currencies.treats=140;const funded=structuredClone(p.yard);const replay=await request(p,'yard.buyGoodie',payload,nonce);assert.equal(replay.status,400);assert.equal(replay.body.error,'not enough yard currency');assert.deepEqual(p.yard,funded);assert.deepEqual(p._yardV2.runtime.commandReceipts[nonce],deniedReceipt);
 const purchased=await request(p,'yard.buyGoodie',payload,'yard-v2:funded-pot');assert.equal(purchased.status,200);assert.equal(p.yard.currencies.treats,0);assert.equal(p.yard.goodieInventory.leaf_pot,1);
 const once=structuredClone(p);assert.equal((await request(p,'yard.buyGoodie',payload,'yard-v2:funded-pot')).body.duplicate,true);assert.deepEqual(p,once);
 const refused=await request(p,'yard.buyGoodie',payload,'yard-v2:canonical-v1/buy-not-a-placement');assert.equal(refused.body.error,'CANONICAL_ACTION_UNSUPPORTED');assert.deepEqual(p,once);
});

test('one purchased pot moves through old and canonical locations without duplicating shared ownership',async t=>{
 let p=player(t,140);const otherResources=structuredClone(p.resources),otherGoods=structuredClone(p.yard.goodieInventory);
 const run=async(action,payload,nonce)=>{p=JSON.parse(JSON.stringify(p));return request(p,action,payload,nonce);};
 const count=()=>Number(p.yard.goodieInventory.leaf_pot||0)+p.yard.placedGoodies.filter(r=>r.goodieId==='leaf_pot').length+(p._yardV2.runtime.canonicalPlacements||[]).filter(r=>r.goodieId==='leaf_pot').length;
 assert.equal((await run('yard.buyGoodie',buyPayload,'yard-v2:shared-pot')).status,200);assert.equal(count(),1);
 assert.equal((await run('yard.placeGoodie',{goodieId:'leaf_pot',slotId:'old-purchased-pot',x:60,y:48},'yard-v2:old-place-purchased')).status,200);assert.equal(count(),1);assert.equal(p.yard.goodieInventory.leaf_pot,undefined);
 assert.equal((await run('yard.placeGoodie',canonicalPayload(),'yard-v2:canonical-v1/not-double-owned')).body.error,'CANONICAL_GOODIE_NOT_OWNED');assert.equal(count(),1);
 assert.equal((await run('yard.pickupGoodie',{slotId:'old-purchased-pot'},'yard-v2:old-pickup-purchased')).status,200);assert.equal(count(),1);
 assert.equal((await run('yard.placeGoodie',canonicalPayload(),'yard-v2:canonical-v1/place-purchased')).status,200);assert.equal(count(),1);assert.equal(p._yardV2.version,2);
 assert.equal((await run('yard.placeGoodie',{goodieId:'leaf_pot',slotId:'old-duplicate-pot',x:60,y:48},'yard-v2:old-double-owned')).status,400);assert.equal(count(),1);
 const pickup='yard-v2:canonical-v1/pickup-purchased';assert.equal((await run('yard.pickupGoodie',canonicalPayload(),pickup)).status,200);assert.equal(count(),1);assert.equal(p.yard.goodieInventory.leaf_pot,1);
 const once=structuredClone(p);assert.equal((await run('yard.pickupGoodie',canonicalPayload(),pickup)).body.duplicate,true);assert.deepEqual(p,once);
 assert.equal(p.yard.currencies.treats,0);assert.deepEqual(p.resources,otherResources);const goods={...p.yard.goodieInventory};delete goods.leaf_pot;assert.deepEqual(goods,otherGoods);
});

for(const committedBeforeLoss of[false,true])test(`ordinary pot ${committedBeforeLoss?'committed':'uncommitted'} loss survives an old server, reload and account switch with the identical nonce`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let now=NOW;t.mock.method(Date,'now',()=>now);values.clear();
 const fallback=new Map();globalThis.localStorage={getItem:k=>fallback.get(k)??null,setItem:(k,v)=>fallback.set(k,String(v))};
 const p=createDefaultPlayer('pot-recovery-owner','Owner',NOW);p.yard.currencies.treats=280;buildSnapshot(p);
 assert.equal((await request(p,'yard.buyGoodie',buyPayload,'yard-v2:prior-pot')).status,200);
 assert.equal((await request(p,'yard.placeGoodie',canonicalPayload(),'yard-v2:canonical-v1/prior-placement')).status,200);
 assert.equal(p._yardV2.version,2);assert.equal(p.yard.goodieInventory.leaf_pot,undefined);assert.equal(p.yard.currencies.treats,140);
 const initial=structuredClone(p),accountId=p.id;let saved=JSON.stringify(p),active=true,loss=true;const outgoing=[];
 const read=()=>JSON.parse(saved),snapshot=()=>{const clientNow=now;now=NOW;try{const s=buildSnapshot(read());if(!active)s.yardRuntime=old.publicPersistentYard(read(),{now:NOW});return s;}finally{now=clientNow;}};
 globalThis.fetch=async(path,options)=>{
  if(path==='/api/config')return response({devAuthEnabled:false});
  if(new URL(path,'https://fixture.invalid').pathname==='/api/player/snapshot')return response(snapshot());
  assert.equal(path,'/api/player/mutate');const command=JSON.parse(options.body);outgoing.push(command);
  assert.equal(command.accountId,accountId);assert.equal(command.action,'yard.buyGoodie');assert.deepEqual(command.payload,buyPayload);assert.equal(command.clientActionId,'yard-v2:recover-pot');
  if(loss&&!committedBeforeLoss){loss=false;throw Error('lost before commit');}
  const current=read();const result=active?await request(current,command.action,command.payload,command.clientActionId):(()=>{const r=old.executePersistentYardAction(current,command.action,command.payload,{actionId:command.clientActionId,now:NOW});return{status:r.status,body:{error:r.error}};})();
  saved=JSON.stringify(current);if(loss){loss=false;throw Error('lost committed reply');}return response(result.body,result.status);
 };
 hub.setState({snapshot:null});hub.getState().applySnapshot(snapshot());await hub.getState().hydrateOutbox();
 const submitted=await hub.getState().performReliableAction('yard.buyGoodie',buyPayload,{durability:'outbox',clientActionId:'yard-v2:recover-pot',feedback:false});assert.equal(submitted.pending,true);
 assert.equal((await hub.getState().drainOutbox()).error,'NETWORK_ERROR');assert.equal(read().yard.currencies.treats,committedBeforeLoss?0:140);
 active=false;now+=4000;assert.equal((await hub.getState().drainOutbox()).error,'UNSUPPORTED_YARD_STORAGE_VERSION');
 const held=structuredClone(values.get(journal(accountId)).items[0]);assert.equal(held.status,'rollout-paused');assert.equal(held.requiresYardResume,true);assert.equal(held.blockedReason,'UNSUPPORTED_YARD_STORAGE_VERSION');assert.equal(held.clientActionId,submitted.clientActionId);assert.deepEqual(held.payload,buyPayload);assert.equal(hub.getState().busy['shop:goodie:leaf_pot'],true);
 assert.equal(hub.getState().snapshot.yardRuntime.mutable,false);assert.equal(outgoing.length,2);
 // A second buy attempt cannot overwrite or replace the unresolved intent.
 const repeated=await hub.getState().performReliableAction('yard.buyGoodie',buyPayload,{durability:'outbox',clientActionId:'yard-v2:must-not-replace',feedback:false});assert.equal(repeated.clientActionId,submitted.clientActionId);assert.deepEqual(values.get(journal(accountId)).items[0],held);
 // A different account must not see, replay, or clear this owner's journal.
 hub.getState().applySnapshot({...snapshot(),player:{id:'other-owner',syncSeq:0}});await hub.getState().hydrateOutbox();await hub.getState().drainOutbox();assert.deepEqual(hub.getState().pendingActions,[]);assert.deepEqual(values.get(journal(accountId)).items[0],held);
 hub.setState({snapshot:null});hub.getState().applySnapshot(snapshot());await hub.getState().hydrateOutbox();await hub.getState().drainOutbox();assert.equal(outgoing.length,2);assert.deepEqual(values.get(journal(accountId)).items[0],held);
 // Socket/cache application alone is not a fresh HTTP resume observation.
 active=true;now+=4000;hub.getState().applySnapshot(snapshot());await hub.getState().drainOutbox();assert.equal(outgoing.length,2);
 await hub.getState().loadSnapshot();const resumed=await hub.getState().drainOutbox();assert.equal(resumed.success,true);assert.equal(resumed.duplicate,committedBeforeLoss);
 assert.deepEqual(outgoing[1],outgoing[0]);assert.deepEqual(outgoing[2],outgoing[0]);assert.equal(read().yard.currencies.treats,0);assert.equal(read().yard.goodieInventory.leaf_pot,1);assert.deepEqual(read()._yardV2.runtime.canonicalPlacements,initial._yardV2.runtime.canonicalPlacements);
 assert.deepEqual(values.get(journal(accountId)).items,[]);assert.equal(hub.getState().busy['shop:goodie:leaf_pot'],undefined);assert.equal(hub.getState().snapshot.yard.goodieInventory.leaf_pot,1);
 const receipts=Object.values(read()._yardV2.runtime.commandReceipts).filter(r=>r.actionId===submitted.clientActionId);assert.equal(receipts.length,1);assert.equal(receipts[0].action,'yard.buyGoodie');assert.equal(receipts[0].status,200);
});
