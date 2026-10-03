import {readCandidateSource} from '../preview/yard-persistent-candidate/source.mjs';
import './yard-inventory-only-loader.mjs';
import './yard-shared-store-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';

// Observe the actual playerManager post-commit payload without opening a socket.
registerHooks({
  resolve(s,c,next){return /(^|\/)socketManager\.js$/.test(s) || s === 'yard-sync-capture' ? {shortCircuit:true,url:'yard-sync-capture'} : next(s,c);},
  load(url,c,next){return url === 'yard-sync-capture' ? {shortCircuit:true,format:'module',source:`export const emissions=[];export function getIO(){return {to(userId){return {emit(event,data){emissions.push(structuredClone({userId,event,data}));}};}};}`} : next(url,c);},
});
const { useGameHub } = await import('../src/game-state/useGameHub.js');
const { withPlayerLock } = await import('../playerManager.js');
const { executePersistentYardAction } = await import('../game-logic/yard-v2/service.mjs');
const { buildSnapshot } = await import('../routes/player.js');
const { emissions } = await import('yard-sync-capture');
const NOW = Date.UTC(2026,9,2,12);
const runtime = (cursorMs, visits = [], reservations = []) => ({version:1,revision:'persistent-mika/r1',serverNow:cursorMs,cursorMs,status:200,mutable:true,visits,reservations,display:{placements:[],issues:[]}});
function snapshot() {
  return {player:{id:'rebase-client-account'},resources:{gold:100,gachaTokens:3},garden:{level:4,plants:[]},merge:{alchemyEssence:7},
    inventory:{yardFood:{kibble:1},yardGoodies:{yarn_mouse:1},seeds:{carrot:2}},
    yard:{foodInventory:{kibble:1},goodieInventory:{yarn_mouse:1},placedGoodies:[{slotId:'mouse',goodieId:'yarn_mouse',x:35,y:45}],pendingGifts:[],futureField:'retain'},
    yardRuntime:runtime(NOW)};
}
function reset() {
  useGameHub.setState({snapshot:null,pendingActions:[],outboxLoaded:true,busy:{},status:'ready',message:'',lastResult:null});
  useGameHub.getState().applySnapshot(snapshot());
  useGameHub.setState({outboxLoaded:true,outboxAccountId:'rebase-client-account'});
}
function storage() {const data = new Map();return {getItem:key=>data.get(key) ?? null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
function setupOutbox(t) {
  reset();t.mock.timers.enable({apis:['setTimeout']});
  const previous = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});
  // setupOutbox models a verified hydrated fallback, not a failed IDB read.
  localStorage.setItem('game_hub_yard_outbox_v2:rebase-client-account',JSON.stringify({version:2,accountId:'rebase-client-account',items:[]}));
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
}

test('realtime visit, prop commit and release each notify observers once with matching Yard/runtime',()=>{
  reset(); const observed=[];
  const stop=useGameHub.subscribe(state=>observed.push(structuredClone(state.snapshot)));
  try {
    const plan={propCommits:[{at:NOW+500,slotId:'mouse',transform:{x:37,y:44,rotationZ:.1,compression:1}}]};
    const visit={visitId:'visit',slotId:'mouse',visitorId:'mika_cat',leavesAt:NOW+1000,mediaAdmission:{plan}};
    const active=runtime(NOW+1,[visit],[{visitId:'visit',slotId:'mouse',releaseAt:NOW+1000}]);
    useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yard:{...snapshot().yard,pendingGifts:[]},yardRuntime:active});
    assert.equal(observed.length,1);assert.deepEqual(observed[0].yardRuntime,active);
    const placed=[{...snapshot().yard.placedGoodies[0],...plan.propCommits[0].transform}];
    const committed=runtime(NOW+500,[visit],active.reservations);
    useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yard:{placedGoodies:placed},yardRuntime:committed});
    assert.equal(observed.length,2);assert.deepEqual(observed[1].yard.placedGoodies,placed);assert.deepEqual(observed[1].yardRuntime,committed);
    const gift={id:'gift:visit',visitorId:'mika_cat',treats:12};
    const released=runtime(NOW+1000);
    useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yard:{pendingGifts:[gift]},yardRuntime:released});
    assert.equal(observed.length,3);assert.deepEqual(observed[2].yard.pendingGifts,[gift]);assert.deepEqual(observed[2].yardRuntime.visits,[]);assert.deepEqual(observed[2].yardRuntime.reservations,[]);
    assert.equal(observed[2].yard.futureField,'retain');assert.equal(observed[2].resources.gold,100);assert.equal(observed[2].resources.gachaTokens,3);assert.equal(observed[2].merge.alchemyEssence,7);
  } finally {stop();}
});

test('realtime authoritative Yard inventories replace stale normalized aliases, including empty inventories',()=>{
  reset();useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yard:{foodInventory:{kibble:0},goodieInventory:{yarn_mouse:3,alchemy_living_arbor:11}},yardRuntime:runtime(NOW+100)});
  let result=useGameHub.getState().snapshot;
  assert.deepEqual(result.yard.foodInventory,{kibble:0});assert.deepEqual(result.inventory.yardFood,{kibble:0});
  assert.deepEqual(result.yard.goodieInventory,{yarn_mouse:3,alchemy_living_arbor:11});assert.deepEqual(result.inventory.yardGoodies,result.yard.goodieInventory);
  assert.deepEqual(result.inventory.seeds,{carrot:2});
  useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yard:{foodInventory:{},goodieInventory:{}},yardRuntime:runtime(NOW+200)});
  result=useGameHub.getState().snapshot;assert.deepEqual(result.yard.foodInventory,{});assert.deepEqual(result.inventory.yardGoodies,{});
});

test('unrelated and legacy deltas preserve runtime; explicit runtime replaces removed fields and can clear it',()=>{
  reset(); const prior=useGameHub.getState().snapshot.yardRuntime;
  useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',garden:{level:5}});assert.equal(useGameHub.getState().snapshot.yardRuntime,prior);
  useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yard:{pendingGifts:[]}});assert.equal(useGameHub.getState().snapshot.yardRuntime,prior);
  const readonly={version:2,status:409,mutable:false};
  useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yardRuntime:readonly});assert.deepEqual(useGameHub.getState().snapshot.yardRuntime,readonly);
  useGameHub.getState().applyRealtimePayload({accountId:'rebase-client-account',yardRuntime:null});assert.equal(useGameHub.getState().snapshot.yardRuntime,null);
});

test('actual withPlayerLock emission supplies a sanitized runtime and its newly committed Yard in one store update',async t=>{
  t.mock.method(Date,'now',()=>NOW);reset();emissions.length=0;
  await withPlayerLock('rebase-sync-account',p=>{useGameHub.getState().applySnapshot(buildSnapshot(p));});
  emissions.length=0;let updates=0;const stop=useGameHub.subscribe(()=>updates++);
  try {
    await withPlayerLock('rebase-sync-account',p=>{
      const result=executePersistentYardAction(p,'yard.buyFood',{foodId:'kibble'},{now:NOW+500,actionId:'yard-v2:rebase-sync-buy'});
      assert.equal(result.status,200);
    });
    assert.equal(emissions.length,1);const message=emissions[0];assert.equal(message.event,'player_sync');
    const payload=message.data.payload;assert.equal(payload.yardRuntime.cursorMs,NOW+500);
    assert.ok(!Object.hasOwn(payload.yardRuntime,'migration'));assert.ok(!Object.hasOwn(payload.yardRuntime,'commandReceipts'));
    useGameHub.getState().applyRealtimePayload(payload);assert.equal(updates,1);
    assert.deepEqual(useGameHub.getState().snapshot.yardRuntime,payload.yardRuntime);
    assert.deepEqual(useGameHub.getState().snapshot.yard.foodInventory,payload.yard.foodInventory);
    assert.deepEqual(useGameHub.getState().snapshot.inventory.yardFood,payload.yard.foodInventory);
  } finally {stop();}
});

test('v2 companion intent remains immutable across repeated input, reload, transport and successful retry',async t=>{
  setupOutbox(t); const first={name:'Mika',species:'cat'},other={name:'Luna',species:'fox'};
  const a=await useGameHub.getState().enqueueYardAction('yard.configureCompanion',first,{clientActionId:'yard-v2:companion-first',feedback:false});
  const b=await useGameHub.getState().enqueueYardAction('yard.configureCompanion',other,{clientActionId:'yard-v2:companion-second',feedback:false});
  assert.equal(b.clientActionId,a.clientActionId);assert.deepEqual(useGameHub.getState().pendingActions[0].payload,first);
  useGameHub.setState({pendingActions:[],outboxLoaded:false});await useGameHub.getState().hydrateOutbox();
  assert.deepEqual(useGameHub.getState().pendingActions[0].payload,first);
  await useGameHub.getState().enqueueYardAction('yard.configureCompanion',other,{feedback:false});
  assert.deepEqual(useGameHub.getState().pendingActions[0].payload,first);
  const requests=[];t.mock.method(globalThis,'fetch',async(path,options={})=>{
    const body=path==='/api/config'?{devAuthEnabled:false}:{success:true,snapshot:snapshot()};
    if(path!=='/api/config'){assert.equal(path,'/api/player/mutate');requests.push(JSON.parse(options.body));}
    return {ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body};
  });
  const result=await useGameHub.getState().drainOutbox();assert.equal(result.success,true);assert.equal(requests.length,1);
  assert.equal(requests[0].clientActionId,'yard-v2:companion-first');assert.deepEqual(requests[0].payload,first);assert.equal(useGameHub.getState().pendingActions.length,0);
  const next=await useGameHub.getState().enqueueYardAction('yard.configureCompanion',other,{clientActionId:'yard-v2:companion-second',feedback:false});
  assert.equal(next.clientActionId,'yard-v2:companion-second');assert.deepEqual(useGameHub.getState().pendingActions[0].payload,other);
});

test('a new v2 intent cannot overwrite a retained legacy nonce; legacy-only coalescing remains compatible',async t=>{
  setupOutbox(t);const first={name:'First'},second={name:'Second'};
  await useGameHub.getState().enqueueYardAction('yard.configureCompanion',first,{clientActionId:'legacy-original',feedback:false});
  await useGameHub.getState().enqueueYardAction('yard.configureCompanion',second,{clientActionId:'yard-v2:new',feedback:false});
  assert.equal(useGameHub.getState().pendingActions[0].clientActionId,'legacy-original');assert.deepEqual(useGameHub.getState().pendingActions[0].payload,first);
  await useGameHub.getState().enqueueYardAction('yard.configureCompanion',second,{clientActionId:'legacy-next',feedback:false});
  assert.equal(useGameHub.getState().pendingActions[0].clientActionId,'legacy-original');assert.deepEqual(useGameHub.getState().pendingActions[0].payload,second);
});

test('room uses the persistent client while the current two-tab Pixi preload contract is preserved',async()=>{
  const source=await readCandidateSource(new URL('../src/app/gameChunks.jsx',import.meta.url),'utf8');
  assert.match(source,/room: \(\) => import\("\.\.\/games\/companion-yard-v2\/CourtyardGame.jsx"\)/);
  const tabs=source.match(/export const PIXI_TABS = new Set\((\[[^;]+\])\);/);assert.ok(tabs);assert.deepEqual(JSON.parse(tabs[1]),['blox','match3']);
});
