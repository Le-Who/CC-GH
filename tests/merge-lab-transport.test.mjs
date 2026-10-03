import test from 'node:test';import assert from 'node:assert/strict';
import {createMergeLabTransport} from '../src/games/merge/mergeLabTransport.js';
import {MERGE_LAB_RELEASE_POLICY,ensureMergeLabState,executeMergeLab,quoteMergeLab,publicMergeLabState} from '../game-logic/merge-lab-service.js';
import {MERGE_LAB_CATALOG as catalog} from '../game-logic/merge-lab-catalog.js';
const policy={...MERGE_LAB_RELEASE_POLICY,enabled:true},now=1790928000000;
function setup(){
 const player={id:'transport-user',resources:{gachaTokens:50,gold:37},farm:{harvested:{}},yard:{goodieInventory:{},currencies:{treats:1,shinyTreats:2}},merge:{board:[],inventory:[]}};
 ensureMergeLabState(player,{now,policy,newEpoch:()=> 'transport_epoch_12345678'});
 const options={now,policy};const records=new Map();const calls=[];let sequence=0;let drop=false;
 const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
 const serverSnapshot=()=>({player:{id:player.id,syncSeq:sequence},resources:structuredClone(player.resources),farm:structuredClone(player.farm),yard:structuredClone(player.yard),merge:structuredClone(publicMergeLabState(player.merge,policy))});
 let current=serverSnapshot(),accountSession={};
 const api=async(path,body)=>{
  calls.push({path,body:structuredClone(body)});
  if(path.endsWith('/quote')){try{return {quote:quoteMergeLab(player,body.type,body.parameters,{...options,expectedMergeEpoch:body.expectedMergeEpoch})};}catch(error){return{error:error.message,code:error.code};}}
  const outcome=executeMergeLab(player,body.payload,options);sequence++;
  if(drop){drop=false;return{error:'TIMEOUT'};}
  return {mergeLab:outcome,...outcome.ok?{snapshot:serverSnapshot()}: {}};
 };
 const create=(overrides={})=>createMergeLabTransport({api,getSnapshot:()=>current,getAccountSession:()=>accountSession,applySnapshot:s=>{current=s;},refreshSnapshot:async()=>serverSnapshot(),storage,accountId:player.id,...overrides});
 return {player,records,calls,storage,create,api,serverSnapshot,switchAccount:id=>{accountSession={};current={...current,player:{...current.player,id}};},dropNext:()=>{drop=true;},refresh:()=>{current=serverSnapshot();},getSnapshot:()=>current};
}
test('lost reply and reload replay the exact persisted command once without revision rebasing',async()=>{
 const f=setup(),client=f.create();const quote=await client.getQuote('claimStarterKit',{});
 f.dropNext();await assert.rejects(client.onAction('claimStarterKit',{quote},{requestId:'stable-request'}),/confirmed/);
 assert.equal(client.hasPending(),true);assert.equal(f.player.merge.supply.starterKitClaimed,true);const stock=structuredClone(f.player.merge.stock);
 const reloaded=f.create();const result=await reloaded.resumePending();assert.equal(result.ok,true);assert.equal(result.replayed,true);assert.equal(reloaded.hasPending(),false);assert.deepEqual(f.player.merge.stock,stock);
 assert.deepEqual(f.calls[1].body,f.calls[2].body);assert.equal(f.calls[2].body.payload.command.expectedMergeRevision,0);assert.equal(f.records.size,0);
});
test('a pending debit prevents another action/quote and same ID with different payload',async()=>{
 const f=setup(),client=f.create();f.dropNext();await assert.rejects(client.onAction('claimFreeCharges',{}, {requestId:'one'}));const count=f.calls.length;
 await assert.rejects(client.onAction('claimFreeCharges',{}, {requestId:'two'}),/pending/);
 await assert.rejects(client.onAction('selectProject',{projectId:'echo_chimes'}, {requestId:'one'}),/pending/);
 await assert.rejects(client.getQuote('claimStarterKit',{}),/pending/);assert.equal(f.calls.length,count);
});
test('concurrent identical calls reuse in-flight body and settled calls never submit again',async()=>{
 const f=setup(),client=f.create();const [one,two]=await Promise.all([client.onAction('claimFreeCharges',{}, {requestId:'parallel'}),client.onAction('claimFreeCharges',{}, {requestId:'parallel'})]);
 assert.equal(one.ok,true);assert.deepEqual(one,two);assert.equal(f.calls.length,1);
 assert.deepEqual(await client.onAction('claimFreeCharges',{}, {requestId:'parallel'}),one);assert.equal(f.calls.length,1);
 await assert.rejects(client.onAction('selectProject',{projectId:'echo_chimes'}, {requestId:'parallel'}),/different input/);
});
test('no debit is sent if durable retry storage is unavailable',async()=>{
 const f=setup();f.storage.setItem=()=>{throw Error('quota');};const client=f.create();await assert.rejects(client.onAction('claimFreeCharges',{}, {requestId:'storage'}),/quota/);assert.equal(f.calls.length,0);assert.equal(f.player.merge.mergeRevision,0);
});
test('policy rejection is confirmed, clears pending and is never changed to optimistic success',async()=>{
 const f=setup(),client=f.create();await assert.rejects(client.getQuote('craftProject',{projectId:'echo_chimes',quantity:1}),{code:'YARD_UPDATE_REQUIRED'});
 const result=await client.onAction('craftProject',{projectId:'echo_chimes',quantity:1,quote:{quoteId:'irrelevant',expiresAt:now+1000}}, {requestId:'future'});
 assert.equal(result.ok,false);assert.equal(result.error.code,'YARD_UPDATE_REQUIRED');assert.equal(client.hasPending(),false);assert.equal(f.player.merge.mergeRevision,0);
});
test('epoch reset refuses the old pending command after reload without replaying it on new state',async()=>{
 const f=setup(),client=f.create();f.dropNext();await assert.rejects(client.onAction('claimFreeCharges',{}, {requestId:'old-epoch'}));
 f.player.merge.serverEpoch='rotated_epoch_123456789';f.player._mergeLabFence.epoch=f.player.merge.serverEpoch;f.refresh();
 const result=await f.create().resumePending();assert.equal(result.ok,false);assert.equal(result.error.code,'MERGE_EPOCH_CONFLICT');assert.equal(f.player.merge.mergeRevision,1);
});

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
for(const returnToA of [false,true])for(const failure of [false,true])test(`direct Merge reply is fenced after A-B${returnToA?'-A':''}: ${failure?'rejection':'success'}`,async()=>{
 const f=setup(),ready=deferred(),reply=deferred();let applies=0;
 const client=f.create({api:async()=>{ready.resolve();return reply.promise;},applySnapshot:()=>{applies++;}});
 const pending=client.onAction('claimFreeCharges',{}, {requestId:'retired-merge'});await ready.promise;
 const raw=[...f.records.values()][0];f.switchAccount('account-b');if(returnToA)f.switchAccount('transport-user');const current=f.getSnapshot();
 reply.resolve({mergeLab:failure?{ok:false,error:{code:'REJECTED'}}:{ok:true},snapshot:f.serverSnapshot()});
 await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});assert.equal(applies,0);assert.equal(f.getSnapshot(),current);assert.equal(client.hasPending(),true);assert.equal([...f.records.values()][0],raw);
 await assert.rejects(client.resumePending(),{code:'ACCOUNT_CHANGED'});
});

for(const returnToA of [false,true])test(`direct Merge quote is fenced after A-B${returnToA?'-A':''}`,async()=>{
 const f=setup(),ready=deferred(),reply=deferred(),client=f.create({api:async()=>{ready.resolve();return reply.promise;}});
 const pending=client.getQuote('claimStarterKit',{});await ready.promise;
 f.switchAccount('account-b');if(returnToA)f.switchAccount('transport-user');reply.resolve({quote:{serverEpoch:f.player.merge.serverEpoch}});
 await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});assert.equal(f.records.size,0);
});

test('account change during Merge rejection refresh cannot clear its owned pending command',async()=>{
 const f=setup(),ready=deferred(),reply=deferred();let applies=0;
 const client=f.create({api:async()=>({mergeLab:{ok:false,error:{code:'REJECTED'}}}),refreshSnapshot:async()=>{ready.resolve();return reply.promise;},applySnapshot:()=>{applies++;}});
 const pending=client.onAction('claimFreeCharges',{}, {requestId:'refresh-retired'});await ready.promise;
 f.switchAccount('account-b');f.switchAccount('transport-user');reply.resolve(f.serverSnapshot());
 await assert.rejects(pending,{code:'ACCOUNT_CHANGED'});assert.equal(applies,0);assert.equal(f.records.size,1);
});
