/** Real production wiring under one explicit test-only rollout substitution.
 * The SQL-shaped transport models failure/OCC; it is not PostgreSQL evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const modules={
 express:`export function Router(){return {get(){},post(){},use(){}};}`,
 db:`let row, race=null, rejectWrite=false; export const calls={select:0,update:0};
 export function seed(value){row=structuredClone(value);calls.select=0;calls.update=0;race=null;rejectWrite=false;}
 export function onConflict(fn){race=fn;} export function failWrite(){rejectWrite=true;} export function saved(){return structuredClone(row);}
 export function getDb(){return async function sql(strings,...v){const text=strings.join('?');
  if(text.includes('INSERT INTO players')){row??=structuredClone(v[1]);return [];}
  if(text.includes('SELECT data FROM players')){calls.select++;return [{data:structuredClone(row)}];}
  if(text.includes('UPDATE players')){calls.update++;if(rejectWrite)throw Error('fixture write failure');if(race){const fn=race;race=null;fn(row);return [];}
   if((row._version||'0')!==v[2])return [];row=structuredClone(v[0]);return[{id:row.id}];}
  throw Error('Unexpected SQL in bounded test');};}`,
 socket:`export function getIO(){return null;}`,
 redis:`export function isRedisEnabled(){return false;} export async function redisSetPlayer(){throw Error('no network');} export async function redisGetOrLoadPlayer(){throw Error('no network');}`,
};
registerHooks({resolve(s,c,next){const key=s==='express'?'express':s==='yard-wiring:db'?'db':/(^|\/)db\.js$/.test(s)?'db':/(^|\/)socketManager\.js$/.test(s)?'socket':/(^|\/)redisAdapter\.js$/.test(s)?'redis':null;return key?{shortCircuit:true,url:`yard-wiring:${key}`}:next(s,c);},load(url,c,next){const key=url.startsWith('yard-wiring:')?url.slice(12):null;return key?{shortCircuit:true,format:'module',source:modules[key]}:next(url,c);}});
const {withPlayerLock,applyMigrations}=await import('../../playerManager.js');
const {createDefaultPlayer}=await import('../../game-logic/player.js');
const {applyActionWithReceipt,buildSnapshot}=await import('../../routes/player.js');
const {YARD_PLAYER_RELEASE_POLICY}=await import('../../game-logic/yard-v2/release-policy.mjs');
const {YARD_ACTOR_PROFILES}=await import('../../game-logic/yard-v2/released-actor-profiles.mjs');
const {MOCHI_RELEASE_GATE}=await import('../../game-logic/yard-v2/mochi-actor-profile.mjs');
const {PEBBLE_RELEASE_GATE}=await import('../../game-logic/yard-v2/pebble-actor-profile.mjs');
const {PIP_RELEASE_GATE}=await import('../../game-logic/yard-v2/pip-actor-profile.mjs');
const {FAMILY_RELEASE_GATE}=await import('../../game-logic/yard-v2/family-actor-profile.mjs');
const db=await import('yard-wiring:db'),NOW=Date.UTC(2026,9,4,0),H=3600000;
function player(){const p=createDefaultPlayer('yard-player-wiring','Fixture',NOW);p._version='v0';p.yard.lastSimulatedAt=NOW;p.yard.currencies.treats=5000;p.yard.future={keep:'opaque'};return p;}
function history(p){p.yard.pendingGifts=Array.from({length:105},(_,i)=>({id:`gift-${i}`,visitorId:'mika_cat',treats:1,shinyTreats:0,createdAt:NOW,opaque:i}));p.yard.album.photos=Array.from({length:110},(_,i)=>({id:`photo-${i}`,visitorId:'mika_cat',capturedAt:NOW,opaque:i}));}
const buy=p=>applyActionWithReceipt(p,'yard.buyFood',{foodId:'berry_plate'},{serverNow:NOW,clientActionId:'yard-v2:player-wiring-buy'});
test('only player rollout is substituted; every source acceptance gate remains closed',()=>{
 assert.equal(YARD_PLAYER_RELEASE_POLICY.enabled,true);assert.deepEqual(Object.keys(YARD_ACTOR_PROFILES),['mika']);for(const g of [MOCHI_RELEASE_GATE,PEBBLE_RELEASE_GATE,PIP_RELEASE_GATE,FAMILY_RELEASE_GATE])assert.equal(g.accepted,false);
});
test('actual migrations and snapshot initialize once and preserve long histories without SQL schema change',t=>{
 t.mock.method(Date,'now',()=>NOW);const p=player();history(p);const raw=structuredClone(p.yard);applyMigrations(p);assert.deepEqual(p.yard,raw);const receipt=structuredClone(p._yardV2.migration);applyMigrations(p);const s=buildSnapshot(p);assert.equal(s.yardRuntime.actionProtocol,'yard-v2:');assert.equal(s.yardRuntime.mutable,true);assert.deepEqual(p._yardV2.migration,receipt);assert.deepEqual(p.yard,raw);assert.equal(s.yardRuntime.migration,undefined);assert.equal(s.yardRuntime.commandReceipts,undefined);
});
test('all fourteen real action paths use durable receipts and bounded default capability policy',async t=>{
 t.mock.method(Date,'now',()=>NOW);
 const placement={slotId:'cushion',goodieId:'sun_cushion',x:54,y:66,rotationZ:0,uses:0,condition:'new'};
 const cases={buyFood:[{foodId:'berry_plate'}],setFood:[{foodId:'kibble'}],buyGoodie:[{goodieId:'cardboard_cottage'},null,409],placeGoodie:[{...placement}],moveGoodie:[{slotId:'cushion',x:55,y:66},p=>p.yard.placedGoodies.push({...placement})],pickupGoodie:[{slotId:'cushion'},p=>p.yard.placedGoodies.push({...placement})],fixGoodie:[{slotId:'cushion'},p=>p.yard.placedGoodies.push({...placement,condition:'worn',uses:8})],collectGifts:[{},history],capturePhoto:[{visitorId:'mika_cat'},p=>p.yard.petbook.mika_cat={visits:1}],favoritePhoto:[{photoId:'photo-0'},history],setRemodel:[{remodelId:'meadow'}],buyExpansion:[{},null,409],claimDailyLetter:[{}],configureCompanion:[{name:'Fixture'}]};
 for(const [name,[payload,setup,status=200]]of Object.entries(cases)){
  const p=player();p.yard.goodieInventory.sun_cushion=1;setup?.(p);buildSnapshot(p);const adjacent=structuredClone({resources:p.resources,garden:p.garden,merge:p.merge,fence:p._mergeLabFence});
  const id=`yard-v2:wiring-${name}`,first=await applyActionWithReceipt(p,`yard.${name}`,payload,{serverNow:NOW,clientActionId:id});assert.equal(first.status,status,`${name}: ${JSON.stringify(first.body)}`);assert.ok(p._yardV2.runtime.commandReceipts[id]);const once=structuredClone(p);
  const second=await applyActionWithReceipt(p,`yard.${name}`,payload,{serverNow:NOW+H,clientActionId:id});assert.equal(second.status,status,name);assert.deepEqual(p,once,name);assert.deepEqual({resources:p.resources,garden:p.garden,merge:p.merge,fence:p._mergeLabFence},adjacent);
 }
});
test('failed actual commit stores neither migration nor debit nor receipt',async t=>{
 t.mock.method(Date,'now',()=>NOW);const p=player();history(p);db.seed(p);db.failWrite();await assert.rejects(withPlayerLock(p.id,buy),/fixture write failure/);assert.deepEqual(db.saved(),p);assert.equal(db.calls.update,1);
});
test('actual CAS collision reloads neighboring game state and migrates/debits exactly once',async t=>{
 t.mock.method(Date,'now',()=>NOW);const p=player();db.seed(p);db.onConflict(row=>{row.resources.gold=654321;row.garden.totalGoldEarned=999;row._version='concurrent';});const r=await withPlayerLock(p.id,buy);assert.equal(r.status,200);const saved=db.saved();assert.equal(db.calls.select,2);assert.equal(saved.resources.gold,654321);assert.equal(saved.garden.totalGoldEarned,999);assert.equal(saved.yard.currencies.treats,4880);assert.equal(saved.yard.foodInventory.berry_plate,1);assert.equal(Object.keys(saved._yardV2.runtime.commandReceipts).length,1);const archive=structuredClone(saved._yardV2.migration);
 const replay=await withPlayerLock(p.id,buy);assert.equal(replay.body.duplicate,true);assert.equal(db.saved().yard.currencies.treats,4880);assert.deepEqual(db.saved()._yardV2.migration,archive);
});
