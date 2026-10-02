import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ACTION_CONTRACTS,applyYardAction} from '../game-logic/yard-v2/actions.mjs';
import {advancePersistentYard,resolvePersistentDisplay} from '../game-logic/yard-v2/orchestrator.mjs';
import {createDefaultYardState,applyYardActionToState} from '../game-logic/yard.js';
import {migratePlayerSnapshot} from '../game-logic/yard-v2/migration.mjs';
import {YARD_GOODIES,YARD_FOODS,YARD_REMODELS,YARD_EXPANSIONS} from '../game-logic/yard-v2/catalog.mjs';
import {clone,digest,put} from '../game-logic/yard-v2/util.mjs';
import {hexToBase64url} from '../game-logic/yard-v2/sha256.mjs';

const NOW=Date.UTC(2026,9,1),H=3600000,DAY=24*H;
const placed=()=>({slotId:'p',goodieId:'yarn_mouse',x:35,y:45,condition:'new',uses:0,placedAt:NOW});
const book=()=>({visits:2,firstSeenAt:NOW,lastSeenAt:NOW,favoriteGoodies:{yarn_mouse:2},mementoReceived:false});
const photo=id=>({id,visitorId:'mika_cat',goodieId:null,pose:'portrait',remodel:'meadow',capturedAt:NOW,caption:'old',favorite:false});
function snapshot(change=()=>{}) {
 const player={schemaVersion:11,id:'actions-fixture',resources:{gold:777,gachaTokens:13},merge:{alchemyEssence:91},yard:createDefaultYardState(NOW)};
 player.yard.currencies={treats:5000,shinyTreats:100};change(player.yard,player);
 return migratePlayerSnapshot(player,{now:NOW,seed:'catalog-actions'});
}
const fixtures={
 'yard.buyFood':{payload:{foodId:'berry_plate',qty:2.9}},
 'yard.setFood':{payload:{foodId:'kibble'}},
 'yard.buyGoodie':{payload:{goodieId:'cardboard_cottage'}},
 'yard.placeGoodie':{payload:{goodieId:'yarn_mouse',slotId:'p',x:35,y:45}},
 'yard.moveGoodie':{payload:{slotId:'p',x:37,y:45},prepare:y=>y.placedGoodies.push(placed())},
 'yard.pickupGoodie':{payload:{slotId:'p'},prepare:y=>y.placedGoodies.push(placed())},
 'yard.fixGoodie':{payload:{slotId:'p'},prepare:y=>y.placedGoodies.push({...placed(),condition:'worn',uses:YARD_GOODIES.yarn_mouse.durability})},
 'yard.collectGifts':{payload:{},prepare:y=>y.pendingGifts.push({id:'earned',visitorId:'mika_cat',treats:7,shinyTreats:1,mementoId:null,createdAt:NOW})},
 'yard.capturePhoto':{payload:{visitorId:'mika_cat',caption:'  hello  '},prepare:y=>y.petbook.mika_cat=book()},
 'yard.favoritePhoto':{payload:{photoId:'two'},prepare:y=>y.album.photos.push(photo('one'),photo('two'))},
 'yard.setRemodel':{payload:{remodelId:'tea_house'}},
 'yard.buyExpansion':{payload:{}},
 'yard.claimDailyLetter':{payload:{},prepare:y=>y.dailyLetter.stamps=4},
 'yard.configureCompanion':{payload:{name:'  Maple  ',species:'fox',skinId:'maple',helperAutoRefill:true,preferredFoodId:'berry_plate'},prepare:y=>y.helper.unlocked=true},
};
const call=(state,action,payload={},extra={})=>applyYardAction(state,action,payload,{now:NOW,actionId:`yard-v2:${action}`, ...extra});

test('all14 explicit contracts identify source payload, effects, outcomes, guards and preservation deviations',async()=>{
 assert.deepEqual(Object.keys(ACTION_CONTRACTS).sort(),Object.keys(fixtures).sort());
 for(const c of Object.values(ACTION_CONTRACTS)){assert.ok(c.payload&&c.effects.length&&c.extras.length);assert.ok(c.receiptPolicy.includes('yard-v2:'));assert.ok(Array.isArray(c.guards)&&Array.isArray(c.deviations));assert.equal(Object.isFrozen(c),true);}
 assert.ok(ACTION_CONTRACTS['yard.capturePhoto'].deviations.some(s=>s.includes('truncation')));
 assert.ok(ACTION_CONTRACTS['yard.setRemodel'].deviations.some(s=>s.includes('never move')));
 assert.ok(ACTION_CONTRACTS['yard.buyExpansion'].deviations.some(s=>s.includes('preserve')));
 const code=await readFile(new URL('../game-logic/yard-v2/actions.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/normalizeYardState\s*\(/);assert.doesNotMatch(code,/Date\.now\s*\(/);
});

for(const action of ['yard.buyFood','yard.buyGoodie','yard.fixGoodie','yard.capturePhoto','yard.favoritePhoto','yard.setRemodel','yard.buyExpansion','yard.claimDailyLetter','yard.configureCompanion']) {
 test(`source parity on clean valid state: ${action}`,()=>{
  const f=fixtures[action],state=snapshot(f.prepare),before=clone(state),reference=applyYardActionToState(state.player.yard,action,f.payload,{},'catalog-actions',{now:NOW});
  const result=call(state,action,f.payload);assert.equal(result.status,200,JSON.stringify(result));assert.equal(reference.status,200);
  assert.deepEqual(result.state.player.yard,reference.yard);assert.deepEqual(result.extras,reference.extras);
  assert.deepEqual(state,before);assert.deepEqual(result.state.player.resources,state.player.resources);assert.deepEqual(result.state.player.merge,state.player.merge);
 });
}

test('all14 successful actions replay before simulation, survive JSON reload and reject compound payload/action reuse',()=>{
 for(const [action,f]of Object.entries(fixtures)){
  let advances=0;const state=snapshot(f.prepare),advance=(s,n,o)=>{advances++;return advancePersistentYard(s,n,o);};
  const result=call(state,action,f.payload,{advance});assert.equal(result.status,200,`${action}: ${result.error}`);assert.equal(advances,1);
  const restored=JSON.parse(JSON.stringify(result.state)),repeat=call(restored,action,f.payload,{advance,now:NOW+DAY});
  assert.equal(repeat.status,200);assert.equal(repeat.replayed,true);assert.deepEqual(repeat.state,restored);assert.deepEqual(repeat.extras,result.extras);assert.equal(advances,1);
  assert.equal(call(restored,action,{...f.payload,changed:true},{advance}).status,409);
  const other=action==='yard.buyExpansion'?'yard.buyFood':'yard.buyExpansion';
  assert.equal(call(restored,other,{}, {advance,actionId:`yard-v2:${action}`}).status,409);assert.equal(advances,1);
 }
});

test('a failed funded purchase remains failed on replay; only explicit fresh intent can spend later',()=>{
 const state=snapshot(y=>y.currencies.treats=0),first=call(state,'yard.buyFood',{foodId:'berry_plate',qty:2});
 assert.equal(first.status,400);assert.equal(first.error,'not enough yard currency');assert.deepEqual(first.state.player,state.player);
 const funded=clone(first.state);funded.player.yard.currencies.treats=1000;
 const retry=call(funded,'yard.buyFood',{foodId:'berry_plate',qty:2},{now:NOW+H});assert.equal(retry.status,400);assert.equal(retry.replayed,true);assert.equal(retry.state.player.yard.currencies.treats,1000);
 const fresh=call(funded,'yard.buyFood',{foodId:'berry_plate',qty:2},{actionId:'yard-v2:fresh-buy'});assert.equal(fresh.status,200);assert.equal(fresh.state.player.yard.currencies.treats,760);
});

test('source quantity coercion/clamping, exact catalog prices and fresh repair errors are retained',()=>{
 for(const [value,expected]of [[undefined,1],[NaN,1],[-10,1],[0,1],['2.9',2],[100,9]]){
  const r=call(snapshot(),'yard.buyFood',{foodId:'berry_plate',qty:value});assert.equal(r.status,200);assert.equal(r.extras.qty,expected);assert.equal(r.state.player.yard.currencies.treats,5000-YARD_FOODS.berry_plate.cost.treats*expected);
 }
 for(const id of ['__proto__','constructor','absent'])assert.equal(call(snapshot(),'yard.buyGoodie',{goodieId:id}).status,400);
 assert.equal(call(snapshot(y=>y.placedGoodies.push(placed())),'yard.fixGoodie',{slotId:'p'}).error,'goodie is already fresh');
});

test('unknown nested data, separate wallets and large counts survive every supported action',()=>{
 for(const [action,f]of Object.entries(fixtures)){
  const state=snapshot((y,p)=>{f.prepare?.(y,p);p.opaque={future:[1,{keep:true}]};y.future={nested:['keep']};y.currencies.futureCurrency=19;
   y.goodieInventory.alchemy_living_arbor=1001;y.goodieInventory.alchemy_echo_chimes=7;y.foodInventory.future_food=5000;
   y.helper.futureSetting={keep:1};y.companion.futureSkin={keep:2};y.album.futureAlbum={keep:3};y.expansion.futureCapacity=27;y.dailyLetter.futureHistory=['x'];});
  const r=call(state,action,f.payload);assert.equal(r.status,200,action);
  for(const path of ['helper','companion','album','expansion','dailyLetter'])for(const [k,v]of Object.entries(state.player.yard[path]))if(k.startsWith('future'))assert.deepEqual(r.state.player.yard[path][k],v);
  assert.deepEqual(r.state.player.opaque,state.player.opaque);assert.deepEqual(r.state.player.yard.future,state.player.yard.future);
  assert.equal(r.state.player.yard.currencies.futureCurrency,19);assert.equal(r.state.player.yard.goodieInventory.alchemy_living_arbor,1001);assert.equal(r.state.player.yard.goodieInventory.alchemy_echo_chimes,7);assert.equal(r.state.player.yard.foodInventory.future_food,5000);
  assert.deepEqual(r.state.player.resources,state.player.resources);assert.deepEqual(r.state.player.merge,state.player.merge);assert.strictEqual(r.state.migration,state.migration);
 }
});

test('capture appends to110 photos, retains unknown photo fields and never truncates or manufactures a visit',()=>{
 const state=snapshot(y=>{y.petbook.mika_cat=book();y.album.photos=Array.from({length:110},(_,i)=>({...photo(`old-${i}`),future:{i}}));});
 const result=call(state,'yard.capturePhoto',{visitorId:'mika_cat',caption:' x '.repeat(40)});assert.equal(result.status,200);
 assert.equal(result.state.player.yard.album.photos.length,111);assert.deepEqual(result.state.player.yard.album.photos.slice(0,110),state.player.yard.album.photos);
 assert.equal(result.extras.photo.caption.length,48);assert.equal(result.state.player.yard.activeVisitors.length,0);assert.equal(result.state.player.yard.pendingGifts.length,0);
 const favorite=call(result.state,'yard.favoritePhoto',{photoId:'old-1'});assert.equal(favorite.status,200);assert.equal(favorite.state.player.yard.album.photos.length,111);assert.deepEqual(favorite.state.player.yard.album.photos[1].future,{i:1});
 assert.equal(favorite.state.player.yard.album.photos.filter(p=>p.favorite).length,1);
 assert.equal(call(snapshot(),'yard.capturePhoto',{visitorId:'mika_cat'}).error,'visitor not available');
});

test('active photo preserves source visitId OR visitorId selection and exact caption/name rules',()=>{
 const state=snapshot(y=>{y.placedGoodies.push(placed());y.activeVisitors.push({visitId:'seen',visitorId:'mika_cat',goodieId:'yarn_mouse',slotId:'p',pose:'sniff',arrivedAt:NOW,leavesAt:NOW+H});});
 const r=call(state,'yard.capturePhoto',{visitId:'not-this',visitorId:'mika_cat',caption:'  hello  '});assert.equal(r.status,200);assert.equal(r.extras.photo.pose,'sniff');assert.equal(r.extras.photo.goodieId,'yarn_mouse');assert.equal(r.extras.photo.caption,'hello');
 const blank=call(snapshot(),'yard.configureCompanion',{name:'    '});assert.equal(blank.error,'invalid companion name');
 const s=snapshot(),named=call(s,'yard.configureCompanion',{name:' x'.repeat(20),skinId:'q'.repeat(80),species:'unknown',helperAutoRefill:true,preferredFoodId:'bonito_bowl'});
 assert.equal(named.extras.companion.name.length,16);assert.equal(named.extras.companion.skinId.length,40);assert.equal(named.extras.companion.species,s.player.yard.companion.species);assert.equal(named.extras.helper.autoRefill,false);assert.equal(named.extras.helper.preferredFoodId,'bonito_bowl');
});

test('expansion adds only missing bowl2, retains bowl metadata/future bowls and source prices/capacity',()=>{
 const state=snapshot(y=>{y.bowls[0].future={keep:'bowl1'};y.bowls.push({id:'future-bowl',opaque:true});});
 const r=call(state,'yard.buyExpansion');assert.equal(r.status,200);assert.deepEqual(r.state.player.yard.bowls.slice(0,2),state.player.yard.bowls);
 assert.deepEqual(r.state.player.yard.bowls[2],{id:'bowl-2',foodId:null,servings:0,placedAt:null,expiresAt:null});assert.equal(r.state.player.yard.helper.unlocked,true);assert.equal(r.state.player.yard.expansion.level,2);
 assert.equal(r.state.player.yard.currencies.treats,5000-YARD_EXPANSIONS[2].cost.treats);assert.equal(r.state.player.yard.currencies.shinyTreats,100-YARD_EXPANSIONS[2].cost.shinyTreats);
 assert.equal(call(r.state,'yard.buyExpansion',{}, {actionId:'yard-v2:another-expansion'}).error,'yard already expanded');
 const existing=snapshot(y=>y.bowls.push({id:'bowl-2',future:'preserve'}));assert.deepEqual(call(existing,'yard.buyExpansion').state.player.yard.bowls,existing.player.yard.bowls);
});

test('expansion preserves slot-only raw placements and their exact imported display anchors across reload',()=>{
 const state=snapshot(y=>y.placedGoodies.push({slotId:'small-2',goodieId:'yarn_mouse',condition:'new',uses:0,placedAt:NOW,opaque:{keep:true}}));
 const initialized=advancePersistentYard(state,NOW),before=resolvePersistentDisplay(initialized).placements[0];
 assert.deepEqual(before.anchor,{x:42,y:44});
 const expanded=call(initialized,'yard.buyExpansion');assert.equal(expanded.status,200);
 assert.deepEqual(expanded.state.player.yard.placedGoodies,state.player.yard.placedGoodies);assert.equal(Object.hasOwn(expanded.state.player.yard.placedGoodies[0],'x'),false);
 assert.deepEqual(resolvePersistentDisplay(expanded.state).placements[0].anchor,before.anchor);
 const reloaded=advancePersistentYard(JSON.parse(JSON.stringify(expanded.state)),NOW+1);
 assert.deepEqual(resolvePersistentDisplay(reloaded).placements[0].anchor,before.anchor);assert.deepEqual(reloaded.runtime.legacyPlacementAnchors,expanded.state.runtime.legacyPlacementAnchors);
});

test('remodel checks the persistent projected layout, allowing valid slot-only saves without writing coordinates',()=>{
 const state=snapshot(y=>y.placedGoodies.push({slotId:'small-2',goodieId:'yarn_mouse',condition:'new',uses:0,placedAt:NOW,unknown:'keep'}));
 const before=clone(state.player.yard.placedGoodies),r=call(state,'yard.setRemodel',{remodelId:'moon_garden'});
 assert.equal(r.status,200,JSON.stringify({error:r.error,details:r.details}));assert.deepEqual(r.state.player.yard.placedGoodies,before);
 assert.deepEqual(resolvePersistentDisplay(r.state).placements[0].anchor,{x:42,y:44});
});

test('daily letters use UTC and every fifth grants source rewards once across reload and midnight',()=>{
 let s=snapshot();for(let day=0;day<5;day++){
  const r=call(s,'yard.claimDailyLetter',{}, {now:NOW+day*DAY,actionId:`yard-v2:letter-${day}`});assert.equal(r.status,200);s=JSON.parse(JSON.stringify(r.state));
  const retry=call(s,'yard.claimDailyLetter',{}, {now:NOW+(day+1)*DAY,actionId:`yard-v2:letter-${day}`});assert.equal(retry.replayed,true);assert.deepEqual(retry.state,s);
  assert.equal(call(s,'yard.claimDailyLetter',{}, {now:NOW+day*DAY+DAY-1,actionId:`yard-v2:duplicate-date-${day}`}).error,'daily letter already claimed');
 }
 assert.equal(s.player.yard.dailyLetter.stamps,5);assert.equal(s.player.yard.dailyLetter.lastClaimedDate,'2026-10-05');assert.equal(s.player.yard.currencies.treats,5175);assert.equal(s.player.yard.currencies.shinyTreats,101);assert.equal(s.player.yard.foodInventory.berry_plate,1);
});

test('remodel purchases once, preserves saved anchors and rejects incompatible layouts before payment',()=>{
 const s=snapshot(),r=call(s,'yard.setRemodel',{remodelId:'tea_house'});assert.equal(r.status,200);assert.equal(r.state.player.yard.currencies.treats,5000-YARD_REMODELS.tea_house.cost.treats);
 const again=call(r.state,'yard.setRemodel',{remodelId:'tea_house'},{actionId:'yard-v2:same-remodel'});assert.equal(again.status,200);assert.equal(again.state.player.yard.currencies.treats,r.state.player.yard.currencies.treats);
 const invalid=snapshot(y=>y.placedGoodies.push({...placed(),x:2,y:2,unknownAnchor:{keep:true}}));
 const rejected=call(invalid,'yard.setRemodel',{remodelId:'tea_house'});assert.equal(rejected.status,400);assert.equal(rejected.error,'remodel would invalidate placements');
 assert.deepEqual(rejected.state.player.yard.placedGoodies,invalid.player.yard.placedGoodies);assert.deepEqual(rejected.state.player.yard.currencies,invalid.player.yard.currencies);assert.deepEqual(rejected.state.player.yard.ownedRemodels,invalid.player.yard.ownedRemodels);
});

test('imported active visits reserve fixes/moves/pickup/remodel until exact persisted release',()=>{
 const s=snapshot(y=>{y.placedGoodies.push({...placed(),condition:'worn',uses:8});y.activeVisitors.push({visitId:'imported',visitorId:'mika_cat',goodieId:'yarn_mouse',slotId:'p',pose:'sit',arrivedAt:NOW,leavesAt:NOW+H,opaque:'keep'});});
 const release=s.runtime.visits.imported.releaseAt;
 for(const [action,payload]of [['yard.fixGoodie',{slotId:'p'}],['yard.moveGoodie',{slotId:'p',x:37,y:45}],['yard.pickupGoodie',{slotId:'p'}],['yard.setRemodel',{remodelId:'tea_house'}]]){
  const r=call(s,action,payload,{now:release-1});assert.equal(r.status,400);assert.deepEqual(r.state.player.yard.currencies,s.player.yard.currencies);assert.equal(r.state.player.yard.activeVisitors[0].opaque,'keep');
 }
 const fixed=call(s,'yard.fixGoodie',{slotId:'p'},{now:release});assert.equal(fixed.status,200);assert.equal(fixed.state.player.yard.placedGoodies[0].condition,'new');assert.equal(fixed.state.player.yard.placedGoodies[0].uses,0);
 assert.equal(fixed.state.player.yard.activeVisitors.length,1);assert.equal(fixed.state.player.yard.pendingGifts.length,0);
});

test('all five core delegates remain fail-closed for unsupported media and advance exactly once',()=>{
 let calls=0;const s=snapshot(y=>y.placedGoodies.push(placed()));
 const food=call(s,'yard.setFood',{foodId:'kibble'});assert.equal(food.status,200);
 const r=call(food.state,'yard.buyFood',{foodId:'kibble'}, {now:NOW+2*H,advance:(state,now,options)=>{calls++;return advancePersistentYard(state,now,options);}});
 assert.equal(r.status,200);assert.equal(calls,1);assert.equal(r.state.player.yard.activeVisitors.length,0);assert.equal(r.state.player.yard.bowls[0].servings,4);assert.equal(r.state.player.yard.placedGoodies[0].uses,0);assert.deepEqual(r.state.player.yard.petbook,{});
});

test('105 gifts are paid once without truncation; gift receipts stay separate from unified command receipts',()=>{
 const s=snapshot(y=>y.pendingGifts=Array.from({length:105},(_,i)=>({id:`gift-${i}`,visitorId:'mika_cat',treats:1,shinyTreats:0,mementoId:null,createdAt:NOW,opaque:i})));
 const r=call(s,'yard.collectGifts');assert.equal(r.status,200);assert.equal(r.extras.collected.gifts,105);assert.equal(r.extras.collected.treats,105);assert.equal(r.state.player.yard.currencies.treats,5105);
 const id='yard-v2:yard.collectGifts';assert.equal(r.state.runtime.actionReceipts[id].collected.gifts,105);assert.equal(r.state.runtime.commandReceipts[id].format,'yard-action-receipt/v1');
 assert.equal(call(r.state,'yard.collectGifts').replayed,true);assert.equal(Object.keys(r.state.runtime.giftLedger).length,105);
});

test('old player action receipts replay before advance, reject conflicts and do not reinterpret pruned legacy nonces',()=>{
 const action='yard.buyFood',payload={foodId:'berry_plate',qty:2},id='legacy-click';
 const s=snapshot((y,p)=>p._actionReceipts={items:[{clientActionId:id,action,payloadHash:hexToBase64url(digest({action,payload})),extras:{foodId:'berry_plate',qty:2},savedUnknown:true}]});
 const forbiddenAdvance=()=>{throw new Error('must not advance');};
 const r=call(s,action,payload,{actionId:id,now:NOW+DAY,advance:forbiddenAdvance});assert.equal(r.status,200);assert.equal(r.legacyReplay,true);assert.deepEqual(r.state,s);assert.deepEqual(r.extras,{foodId:'berry_plate',qty:2});
 assert.equal(call(s,action,{...payload,qty:3},{actionId:id,advance:forbiddenAdvance}).error,'LEGACY_ACTION_ID_PAYLOAD_CONFLICT');
 assert.equal(call(s,'yard.buyExpansion',{}, {actionId:id,advance:forbiddenAdvance}).status,409);
 assert.equal(call(s,action,payload,{actionId:'unknown-old-click',advance:forbiddenAdvance}).error,'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT');
 const both=clone(s);both.player._actionReceipts.items.push({...both.player._actionReceipts.items[0],payloadHash:'conflict'});assert.equal(call(both,action,payload,{actionId:id}).status,409);
});

test('unknown receipt shapes, missing nonce, legacy gift-only nonce and unsafe arithmetic remain non-destructive',()=>{
 const s=snapshot(),action='yard.buyFood',payload={foodId:'berry_plate'};
 assert.equal(call(s,action,payload,{actionId:null}).error,'ACTION_ID_REQUIRED');
 const malformed=clone(s);malformed.runtime.commandReceipts=null;assert.equal(call(malformed,action,payload).error,'COMMAND_RECEIPTS_REQUIRE_REVIEW');assert.equal(malformed.runtime.commandReceipts,null);
 const future=clone(s);future.runtime.commandReceipts={};put(future.runtime.commandReceipts,'yard-v2:x',{format:'future/v99',keep:true});assert.equal(call(future,action,payload,{actionId:'yard-v2:x'}).error,'COMMAND_RECEIPT_REQUIRES_REVIEW');
 const legacy=clone(s);legacy.runtime.actionReceipts['yard-v2:old']={action:'yard.collectGifts',collected:{gifts:2}};assert.equal(call(legacy,'yard.collectGifts',{}, {actionId:'yard-v2:old'}).error,'LEGACY_CLAIM_RECEIPT_REQUIRES_RECONCILIATION');
 const huge=snapshot(y=>y.foodInventory.berry_plate=Number.MAX_SAFE_INTEGER),r=call(huge,action,payload);assert.equal(r.status,400);assert.deepEqual(r.state.player,huge.player);
 assert.equal(call(s,action,payload,{now:NOW-1}).error,'INVALID_ACTION_TIME');
});

test('unsupported future envelopes are preserved read-only even if they contain a matching historical receipt',()=>{
 const first=call(snapshot(),'yard.buyFood',{foodId:'kibble'});assert.equal(first.status,200);
 for(const change of [s=>s.format='isolated-yard-foundation/v99',s=>s.runtime.version=99,s=>s.player.schemaVersion=99]){
  const future=clone(first.state);change(future);const before=clone(future);
  const r=call(future,'yard.buyFood',{foodId:'kibble'});assert.equal(r.status,409);assert.equal(r.error,'UNSUPPORTED_STORED_VERSION');assert.deepEqual(r.state,before);assert.deepEqual(future,before);
 }
});

test('legacy static slots/free IDs and goodieId fallback retain source-compatible addressing with stronger geometry',()=>{
 const s=snapshot(),placedResult=call(s,'yard.placeGoodie',{goodieId:'yarn_mouse',x:'35',y:'45'});assert.equal(placedResult.status,200);assert.ok(placedResult.extras.slotId.startsWith('free_'));
 const moved=call(placedResult.state,'yard.moveGoodie',{goodieId:'yarn_mouse',x:37,y:45});assert.equal(moved.status,200);assert.equal(moved.extras.x,37);
 assert.equal(call(moved.state,'yard.pickupGoodie',{goodieId:'yarn_mouse'}).status,200);
 const staticResult=call(s,'yard.placeGoodie',{goodieId:'yarn_mouse',slotId:'small-2'});assert.equal(staticResult.status,200);assert.equal(staticResult.extras.x,42);assert.equal(staticResult.extras.y,44);
});

test('unified receipt history has no legacy200-item pruning',()=>{
 let s=snapshot();for(let i=0;i<205;i++){const r=call(s,'yard.buyFood',{foodId:'kibble'}, {actionId:`yard-v2:receipt-${i}`});assert.equal(r.status,200);s=r.state;}
 assert.equal(Object.keys(s.runtime.commandReceipts).length,205);assert.equal(s.player.yard.foodInventory.kibble,208);
 const replay=call(JSON.parse(JSON.stringify(s)),'yard.buyFood',{foodId:'kibble'},{actionId:'yard-v2:receipt-0',now:NOW+DAY});assert.equal(replay.replayed,true);assert.equal(replay.state.player.yard.foodInventory.kibble,208);
});
