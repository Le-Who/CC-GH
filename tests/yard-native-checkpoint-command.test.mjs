import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeCheckpointCommand} from '../src/games/companion-yard-v2/native-checkpoint-command.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=()=>Promise.resolve();
function fixture(){
 const calls=[],prepared=[],gates=[],states=[],updates=[];
 const context={accountId:'account-a',accountSession:{revision:1},ownerId:7,layoutKey:'layout-1',
  native:{available:true,ownerId:7,accountId:'account-a',phase:'parked',actionsStarted:1,presentedAction:1,presentedTime:6,duration:6}};
 context.snapshot={player:{id:'account-a'},yardRuntime:{nativeMikaCheckpoint:null,nativeMikaCheckpointCapabilities:{
  enabled:true,version:1,status:'absent',priorRevision:0,sourceHash:'a'.repeat(64),layoutHash:'b'.repeat(64),
  action:'yard.saveNativeMikaCheckpoint',actionNoncePrefix:'yard-v2:'}}};
 const renderer=context.renderer={
  update(snapshot,scope){updates.push({snapshot,scope});},
  prepareMikaCheckpoint(scope){
   prepared.push(scope);const cap=context.snapshot.yardRuntime.nativeMikaCheckpointCapabilities;
   return{ok:true,actionId:scope.actionId,payload:{version:1,accountId:scope.accountId,layoutHash:cap.layoutHash,
    sourceHash:cap.sourceHash,priorRevision:cap.priorRevision,recipeJson:JSON.stringify({action:scope.actionId})}};
  },
 };
 let count=0;
 const command=createNativeCheckpointCommand({readContext:()=>context,publish:state=>states.push(state),
  createNonce:()=>`test-${++count}`,send(action,payload,options){calls.push({action,payload,options});const gate=deferred();gates.push(gate);return gate.promise;}});
 return{command,context,renderer,calls,prepared,gates,states,updates};
}
function recordFor(f,overrides={}){
 const cap=f.context.snapshot.yardRuntime.nativeMikaCheckpointCapabilities,call=f.calls.at(-1);
 return{format:'native-mika-settled-checkpoint/v1',version:1,revision:(call?.payload.priorRevision??cap.priorRevision)+1,
  accountId:f.context.accountId,layoutHash:cap.layoutHash,sourceHash:cap.sourceHash,checkpointJson:'{"descriptor":{}}',
  savedAt:1700000000000,actionId:call?.options.clientActionId??'yard-v2:restored',...overrides};
}
function applyRecord(f,record=recordFor(f)){
 const snapshot=f.context.snapshot;
 f.context.snapshot={...snapshot,yardRuntime:{...snapshot.yardRuntime,nativeMikaCheckpoint:record,
  nativeMikaCheckpointCapabilities:{...snapshot.yardRuntime.nativeMikaCheckpointCapabilities,status:'ready',priorRevision:record.revision}}};
 return record;
}
function nextEndpoint(f,action){
 f.context.native={...f.context.native,actionsStarted:action,presentedAction:action,presentedTime:8,duration:8};
}

test('no save is prepared before the exact native terminal pose has drawn',async()=>{
 for(const patch of [{phase:'moving'},{presentedAction:0},{presentedTime:5.99},{presentedTime:NaN},{duration:NaN},{available:false},{ownerId:99},{accountId:'other'}]){
  const f=fixture();Object.assign(f.context.native,patch);
  assert.equal((await f.command.observe()).ok,false);assert.equal(f.prepared.length,0);assert.equal(f.calls.length,0);f.command.dispose();
 }
 const f=fixture(),drawn={...f.context.native};f.context.native.presentedTime=0;
 assert.equal((await f.command.observe(drawn)).ok,false);assert.equal(f.calls.length,0);f.command.dispose();
});

test('initial and next terminal endpoints each save once using only a normal silent receipt command',async()=>{
 const f=fixture(),first=f.command.observe();
 assert.equal(f.command.busy(),true);assert.equal(f.command.state().phase,'saving');await flush();
 assert.equal(f.command.state().ownerId,7);
 assert.equal(f.calls.length,1);assert.equal(f.prepared[0].actionId,1);
 assert.deepEqual(f.prepared[0],{ownerId:7,accountId:'account-a',accountSession:f.context.accountSession,clientActionId:'yard-v2:test-1',actionId:1});
 assert.deepEqual(f.calls[0].options,{durability:'receipt',clientActionId:'yard-v2:test-1',feedback:false,silent:true});
 assert.equal(f.calls[0].action,'yard.saveNativeMikaCheckpoint');assert.equal(f.updates[0].snapshot,f.context.snapshot);
 assert.equal(f.updates[0].scope.accountSession,f.context.accountSession);
 await f.command.observe();assert.equal(f.calls.length,1);
 applyRecord(f);f.gates[0].resolve({ok:true});assert.deepEqual(await first,{ok:true,revision:1});
 assert.equal(f.command.state().phase,'saved');assert.equal(f.command.busy(),false);
 assert.equal(f.command.state().ownerId,7);
 for(let i=0;i<5;i++)await f.command.observe();assert.equal(f.calls.length,1);
 nextEndpoint(f,2);const next=f.command.observe();await flush();assert.equal(f.calls.length,2);
 assert.equal(f.calls[1].payload.priorRevision,1);assert.equal(f.calls[1].options.clientActionId,'yard-v2:test-2');
 applyRecord(f);f.gates[1].resolve({ok:true});assert.deepEqual(await next,{ok:true,revision:2});f.command.dispose();
});

for(const response of [{ok:true},{queued:true},{status:200},{nativeMikaCheckpoint:{revision:1}},{error:'HTTP_503'},{error:'OUTBOX_STORAGE_INVALID'},{error:'ACCOUNT_CHANGED'}])test(`response ${JSON.stringify(response)} alone never confirms a save`,async()=>{
 const f=fixture(),pending=f.command.observe();await flush();f.gates[0].resolve(response);
 assert.equal((await pending).ok,false);assert.equal(f.command.state().phase,'unconfirmed');assert.equal(f.command.busy(),true);
 assert.equal(f.states.some(state=>state.phase==='saved'),false);
 for(let i=0;i<5;i++){f.command.sync();await f.command.observe();}assert.equal(f.calls.length,1);f.command.dispose();
});

test('a response snapshot is not authority until the hub adopts it in the current context',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();const record=recordFor(f);
 f.gates[0].resolve({ok:true,snapshot:{yardRuntime:{nativeMikaCheckpoint:record}}});await pending;
 assert.equal(f.command.state().phase,'unconfirmed');applyRecord(f,record);f.command.sync();
 assert.equal(f.command.state().phase,'saved');assert.equal(f.command.busy(),false);f.command.dispose();
});

test('explicit retry preserves the identical nonce and payload without preparing another recipe',async()=>{
 const f=fixture(),first=f.command.observe();await flush();f.gates[0].reject(new Error('network lost'));await first;
 assert.equal(f.command.state().phase,'unconfirmed');const retry=f.command.retry();
 assert.equal(f.command.busy(),true);assert.equal(f.calls.length,2);assert.equal(f.prepared.length,1);
 assert.equal(f.calls[1].payload,f.calls[0].payload);assert.equal(f.calls[1].options,f.calls[0].options);
 assert.equal(Object.isFrozen(f.calls[0].payload),true);assert.equal((await f.command.retry()).ok,false);assert.equal(f.calls.length,2);
 applyRecord(f);f.gates[1].resolve({ok:true});assert.deepEqual(await retry,{ok:true,revision:1});f.command.dispose();
});

test('a later matching authoritative snapshot acknowledges a lost response with no resend',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();f.gates[0].resolve({error:'NETWORK_ERROR'});await pending;
 applyRecord(f);f.command.sync();assert.equal(f.command.state().phase,'saved');assert.equal(f.command.busy(),false);
 await f.command.observe();assert.equal(f.calls.length,1);assert.equal((await f.command.retry()).ok,false);f.command.dispose();
});

test('authoritative acknowledgement during a live request cannot permit overlapping transports',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();applyRecord(f);f.command.sync();
 assert.equal(f.command.state().phase,'saved');assert.equal(f.command.busy(),true);
 assert.equal((await f.command.observe()).ok,false);assert.equal((await f.command.retry()).ok,false);assert.equal(f.calls.length,1);
 f.gates[0].resolve({error:'RESPONSE_LOST'});assert.deepEqual(await pending,{ok:true,revision:1});
 assert.equal(f.command.busy(),false);f.command.dispose();
});

for(const patch of [{actionId:'yard-v2:someone-else'},{revision:2},{revision:0},{accountId:'account-b'},{sourceHash:'c'.repeat(64)},{layoutHash:'d'.repeat(64)},{checkpointJson:'broken json'}])test(`unmatched authoritative record ${JSON.stringify(patch)} cannot acknowledge`,async()=>{
 const f=fixture(),pending=f.command.observe();await flush();applyRecord(f,recordFor(f,patch));f.command.sync();f.gates[0].resolve({ok:true});await pending;
 assert.notEqual(f.command.state().phase,'saved');assert.equal(f.command.busy(),true);assert.equal(f.states.some(state=>state.phase==='saved'),false);f.command.dispose();
});

for(const change of ['account','session','owner','renderer','layout'])test(`${change} change fences a pending response even after A to B to A`,async()=>{
 const f=fixture(),pending=f.command.observe();await flush();const original={...f.context};
 if(change==='account')f.context.accountId='account-b';
 if(change==='session')f.context.accountSession={revision:1};
 if(change==='owner')f.context.ownerId=8;
 if(change==='renderer')f.context.renderer={};
 if(change==='layout')f.context.layoutKey='layout-2';
 f.command.sync();Object.assign(f.context,original);f.command.sync();applyRecord(f);f.gates[0].resolve({ok:true});
 assert.equal((await pending).reason,'NATIVE_MIKA_CHECKPOINT_CANCELLED');assert.equal(f.states.some(state=>state.phase==='saved'),false);f.command.dispose();
});

test('context changes during asynchronous preparation stop dispatch and disposal prevents late publication',async()=>{
 for(const dispose of [false,true]){
  const f=fixture(),gate=deferred(),originalPrepare=f.renderer.prepareMikaCheckpoint;
  f.renderer.prepareMikaCheckpoint=scope=>{const prepared=originalPrepare(scope);gate.prepared=prepared;return gate.promise;};
  const pending=f.command.observe();assert.equal(f.command.busy(),true);
  if(dispose)f.command.dispose();else{f.context.accountSession={revision:2};f.command.sync();}
  const count=f.states.length;gate.resolve(gate.prepared);assert.equal((await pending).reason,'NATIVE_MIKA_CHECKPOINT_CANCELLED');
  assert.equal(f.calls.length,0);assert.equal(f.states.length,count);f.command.dispose();
 }
});

test('an account/session change immediately before resolution is checked without a subscription callback',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();applyRecord(f);f.context.accountSession={revision:2};f.gates[0].resolve({ok:true});
 assert.equal((await pending).reason,'NATIVE_MIKA_CHECKPOINT_CANCELLED');assert.equal(f.states.some(state=>state.phase==='saved'),false);f.command.dispose();
});

test('retired native owner and a different action cannot confirm the old endpoint',async()=>{
 for(const patch of [{available:false},{ownerId:8},{actionsStarted:2}]){
  const f=fixture(),pending=f.command.observe();await flush();Object.assign(f.context.native,patch);applyRecord(f);f.command.sync();f.gates[0].resolve({ok:true});await pending;
  assert.equal(f.states.some(state=>state.phase==='saved'),false);f.command.dispose();
 }
});

test('missing and disabled capability preserve old command availability without preparing or sending',async()=>{
 for(const cap of [undefined,{enabled:false},{enabled:false,status:'blocked'}]){
  const f=fixture();f.context.snapshot.yardRuntime.nativeMikaCheckpointCapabilities=cap;await f.command.observe();
  assert.equal(f.command.busy(),false);assert.equal(f.command.state().enabled,false);assert.equal(f.prepared.length,0);assert.equal(f.calls.length,0);f.command.dispose();
 }
});

test('blocked, future, inconsistent and corrupt checkpoints never bootstrap a new save',async()=>{
 for(const mutate of [
  f=>{f.context.snapshot.yardRuntime.nativeMikaCheckpointCapabilities.status='blocked';},
  f=>{f.context.snapshot.yardRuntime.nativeMikaCheckpointCapabilities.version=2;},
  f=>{f.context.snapshot.yardRuntime.nativeMikaCheckpointCapabilities.priorRevision=1;},
  f=>{f.context.snapshot.yardRuntime.nativeMikaCheckpoint={broken:true};},
  f=>{applyRecord(f,recordFor(f,{checkpointJson:'[]'}));},
  f=>{applyRecord(f,recordFor(f,{version:2}));},
 ]){
  const f=fixture();mutate(f);await f.command.observe();assert.equal(f.command.state().phase,'blocked');
  assert.equal(f.command.busy(),true);assert.equal(f.prepared.length,0);assert.equal(f.calls.length,0);f.command.dispose();
 }
});

test('restored server-confirmed parked endpoint is not saved again, but its next action is',async()=>{
 const f=fixture();applyRecord(f,recordFor(f,{revision:4}));f.context.native.checkpoint={enabled:true,revision:4,savedAction:1,restored:true};
 assert.deepEqual(await f.command.observe(),{ok:true,revision:4});assert.equal(f.command.state().restored,true);assert.equal(f.command.busy(),false);
 assert.equal(f.command.state().ownerId,7);
 assert.equal(f.prepared.length,0);assert.equal(f.calls.length,0);
 nextEndpoint(f,2);const pending=f.command.observe();await flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].payload.priorRevision,4);
 applyRecord(f);f.gates[0].resolve({ok:true});assert.deepEqual(await pending,{ok:true,revision:5});f.command.dispose();
});

test('disabling and re-enabling the capability cannot revive the pending callback',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();const cap=f.context.snapshot.yardRuntime.nativeMikaCheckpointCapabilities;
 cap.enabled=false;f.command.sync();assert.equal(f.command.busy(),false);cap.enabled=true;f.command.sync();applyRecord(f);
 f.gates[0].resolve({ok:true});assert.equal((await pending).reason,'NATIVE_MIKA_CHECKPOINT_CANCELLED');assert.equal(f.states.some(state=>state.phase==='saved'),false);f.command.dispose();
});

test('preparation failures never send, and an explicit retry reuses the reserved nonce',async()=>{
 const f=fixture(),prepare=f.renderer.prepareMikaCheckpoint;f.renderer.prepareMikaCheckpoint=()=>({ok:false,reason:'NATIVE_ACTOR_NOT_SETTLED'});
 assert.equal((await f.command.observe()).ok,false);assert.equal(f.command.state().phase,'unconfirmed');assert.equal(f.command.busy(),true);
 await f.command.observe();assert.equal(f.calls.length,0);f.renderer.prepareMikaCheckpoint=prepare;
 const retry=f.command.retry();await flush();assert.equal(f.calls[0].options.clientActionId,'yard-v2:test-1');
 applyRecord(f);f.gates[0].resolve({ok:true});assert.equal((await retry).ok,true);f.command.dispose();
});

test('invalid prepared scope or payload is refused before any network action',async()=>{
 for(const patch of [{accountId:'other'},{priorRevision:1},{recipeJson:'null'},{extra:'forbidden'}]){
  const f=fixture(),prepare=f.renderer.prepareMikaCheckpoint;f.renderer.prepareMikaCheckpoint=scope=>{const result=prepare(scope);Object.assign(result.payload,patch);return result;};
  assert.equal((await f.command.observe()).reason,'INVALID_NATIVE_MIKA_CHECKPOINT_PAYLOAD');assert.equal(f.calls.length,0);assert.equal(f.command.busy(),true);f.command.dispose();
 }
});

test('dispose neither retries nor publishes a late authoritative response',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();f.command.dispose();const count=f.states.length;applyRecord(f);f.gates[0].resolve({ok:true});
 assert.equal((await pending).reason,'NATIVE_MIKA_CHECKPOINT_CANCELLED');f.command.sync();await f.command.observe();await f.command.retry();
 assert.equal(f.states.length,count);assert.equal(f.calls.length,1);assert.equal(f.command.busy(),false);
});

test('a replaced confirmed record blocks the old owner instead of retaining a saved claim',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();applyRecord(f);f.gates[0].resolve({ok:true});await pending;
 applyRecord(f,recordFor(f,{revision:2,actionId:'yard-v2:other-tab'}));f.command.sync();
 assert.equal(f.command.state().phase,'blocked');assert.equal(f.command.busy(),true);
 for(let i=0;i<3;i++)await f.command.observe();assert.equal(f.calls.length,1);f.command.dispose();
});

test('nonce generation failures do not start automatic attempt loops',async()=>{
 const f=fixture();let count=0;
 const command=createNativeCheckpointCommand({readContext:()=>f.context,send:()=>assert.fail('unexpected dispatch'),
  createNonce:()=>{count++;return undefined;}});
 for(let i=0;i<5;i++)await command.observe();assert.equal(count,1);
 assert.equal(command.state().phase,'blocked');assert.equal(command.busy(),true);command.dispose();f.command.dispose();
});

test('a retired owner cannot revive its unconfirmed attempt by reappearing with the old identity',async()=>{
 const f=fixture(),pending=f.command.observe();await flush();f.context.native.available=false;f.command.sync();
 assert.equal(f.command.state().ownerId,7);assert.equal(f.command.state().retryable,false);
 f.context.native.available=true;f.command.sync();applyRecord(f);f.gates[0].resolve({ok:true});await pending;
 await f.command.observe();assert.equal(f.command.state().phase,'blocked');assert.equal(f.calls.length,1);f.command.dispose();
});
