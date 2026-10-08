import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeItemCommand,nativeItemLayoutKey} from '../src/games/companion-yard-v2/native-item-command.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture(){
 const pending=[],calls=[],cancellations=[],states=[];
 const renderer={requestMikaItemArrival(slotId,scope){calls.push({slotId,scope});const gate=deferred();pending.push(gate);return gate.promise;},cancelMikaItemArrival(scope){cancellations.push(scope);return true;}};
 const context={renderer,accountId:'account-a',accountSession:{revision:1},slotId:'second-mouse',ownerId:7,layoutKey:'layout-1',native:{available:true,ownerId:7,phase:'parked',actionsStarted:1,presentedAction:1,presentedTime:6,duration:6}};
 const command=createNativeItemCommand({readContext:()=>context,publish:s=>states.push(s)});
 return{command,context,renderer,pending,calls,cancellations,states};
}
test('selected actual slot stays busy through admission and only arrives after its terminal draw',async()=>{
 const f=fixture(),p=f.command.request();assert.equal(f.calls[0].slotId,'second-mouse');assert.equal(f.states.at(-1).phase,'planning');
 assert.equal((await f.command.request()).reason,'NATIVE_ACTOR_NOT_SETTLED');assert.equal(f.calls.length,1);assert.equal(f.states.at(-1).phase,'planning');
 f.pending[0].resolve({ok:true,action:2});assert.equal((await p).ok,true);assert.equal(f.states.at(-1).phase,'moving');
 f.command.observe({...f.context.native,phase:'parked',actionsStarted:2,presentedAction:1,presentedTime:6,duration:11.35});assert.equal(f.command.busy(),true);
 f.command.observe({...f.context.native,phase:'parked',actionsStarted:2,presentedAction:2,presentedTime:11.35,duration:11.35});assert.equal(f.command.busy(),false);assert.equal(f.states.at(-1).phase,'arrived');
 f.command.observe({...f.context.native,phase:'parked',actionsStarted:2,presentedAction:2,presentedTime:11.35,duration:11.35});assert.equal(f.states.filter(x=>x.phase==='arrived').length,1);
 assert.deepEqual(f.cancellations,[]);f.command.dispose();
});
for(const reason of ['ALREADY_ARRIVED','NO_CLEAR_MIKA_CONTINUATION','NATIVE_ITEM_TARGET_UNAVAILABLE'])test(`refusal ${reason} keeps actor ownership and permits another current selection`,async()=>{
 const f=fixture(),p=f.command.request();f.pending[0].resolve({ok:false,reason});assert.equal((await p).reason,reason);assert.equal(f.command.busy(),false);assert.equal(f.states.at(-1).phase,reason==='ALREADY_ARRIVED'?'already':'refused');assert.deepEqual(f.cancellations,[]);
 f.context.slotId='third-mouse';const next=f.command.request();assert.equal(f.calls[1].slotId,'third-mouse');f.pending[1].resolve({ok:false,reason:'NO_CLEAR_MIKA_CONTINUATION'});await next;f.command.dispose();
});
for(const change of ['selection','account','session','owner','renderer','layout'])test(`pending result cannot escape a changed ${change}`,async()=>{
 const f=fixture(),p=f.command.request();
 if(change==='selection')f.context.slotId='other';
 if(change==='account')f.context.accountId='account-b';
 if(change==='session')f.context.accountSession={revision:1};
 if(change==='owner')f.context.ownerId=8;
 if(change==='renderer')f.context.renderer={};
 if(change==='layout')f.context.layoutKey='layout-2';
 f.command.sync();assert.equal(f.cancellations.length,1);assert.equal(f.cancellations[0].ownerId,7);assert.equal(f.cancellations[0].commandToken,f.calls[0].scope.commandToken);assert.equal(f.cancellations[0].actionId,1);
 f.pending[0].resolve({ok:true,action:2});assert.equal((await p).ok,false);assert.equal(f.states.at(-1).phase,'cancelled');assert.equal(f.states.some(x=>x.phase==='moving'),false);f.command.dispose();
});
test('a context change at the admission microtask cancels the admitted action, not its previous number',async()=>{
 const f=fixture(),p=f.command.request();f.context.slotId='other';f.pending[0].resolve({ok:true,action:2});assert.equal((await p).ok,false);assert.equal(f.cancellations[0].actionId,2);assert.equal(f.states.at(-1).phase,'cancelled');f.command.dispose();
});
test('selection A to B to A permanently invalidates the pending intent',async()=>{
 const f=fixture(),p=f.command.request();f.context.slotId='other';f.command.sync();f.context.slotId='second-mouse';f.command.sync();f.pending[0].resolve({ok:true,action:2});assert.equal((await p).ok,false);assert.equal(f.states.some(x=>x.phase==='arrived'||x.phase==='moving'),false);f.command.dispose();
});
test('owner retirement cancels motion and disposal cannot publish a late result',async()=>{
 const f=fixture(),p=f.command.request();f.pending[0].resolve({ok:true,action:2});await p;f.command.observe({...f.context.native,available:false,phase:'aborted'});assert.equal(f.states.at(-1).phase,'cancelled');assert.equal(f.cancellations[0].actionId,2);
 const g=fixture(),late=g.command.request();g.command.dispose();const count=g.states.length;g.pending[0].resolve({ok:true,action:2});assert.equal((await late).ok,false);assert.equal(g.states.length,count);assert.equal(g.cancellations.length,1);f.command.dispose();
});
test('layout fingerprint preserves duplicate item identity and detects relocation without noisy object identity',()=>{
 const snapshot={yard:{remodel:'meadow',placedGoodies:[{slotId:'a',goodieId:'yarn_mouse',x:60,y:45,condition:'new'},{slotId:'b',goodieId:'yarn_mouse',x:87,y:54,condition:'new'}]}};
 const key=nativeItemLayoutKey(snapshot),reordered=structuredClone(snapshot);reordered.yard.placedGoodies.reverse();assert.equal(nativeItemLayoutKey(reordered),key);reordered.yard.placedGoodies[0].x--;assert.notEqual(nativeItemLayoutKey(reordered),key);
});


test('the exact current snapshot reaches the existing renderer authority before dispatch',async()=>{
 const f=fixture(),order=[],snapshot={player:{id:'account-a'},yardRuntime:{status:'blocked'}};f.context.snapshot=snapshot;
 f.renderer.update=(value,context)=>{order.push('update');assert.equal(value,snapshot);assert.equal(context.accountSession,f.context.accountSession);};
 f.renderer.requestMikaItemArrival=()=>{order.push('request');return Promise.resolve({ok:false,reason:'NATIVE_ITEM_RUNTIME_UNSUPPORTED'});};
 assert.equal((await f.command.request()).ok,false);assert.deepEqual(order,['update','request']);assert.equal(f.states.at(-1).phase,'refused');f.command.dispose();
});
