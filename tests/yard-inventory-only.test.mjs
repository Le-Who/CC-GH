import './yard-inventory-only-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
const {normalizeYardState,simulateYardState,applyYardActionToState,YARD_INVENTORY_ONLY_GOODIE_IDS}=await import('../game-logic/yard.js');
const {createDefaultPlayer,YARD_GOODIES,YARD_HOUR_MS,MERGE_EXCHANGE_OFFERS}=await import('../game-logic.js');
const {buildSnapshot,applyActionWithReceipt}=await import('../routes/player.js');
const {applyMigrations,withPlayerLock}=await import('../playerManager.js');
const {default:mergeRoutes}=await import('../routes/mergeRoutes.js');
const {MERGE_LAB_CATALOG:catalog}=await import('../game-logic/merge-lab-catalog.js');
const {createMergeLabAction}=await import('../game-logic/merge-lab-domain.js');
const {quoteMergeLab}=await import('../game-logic/merge-lab-service.js');
const now=Date.now();const expected={alchemy_living_arbor:1201,alchemy_echo_chimes:2402};
function fixture(id='preserved'){const p=createDefaultPlayer(id,'Preserved',now);Object.assign(p.yard.goodieInventory,expected);p.yard.lastSimulatedAt=now;return p;}
function assertCounts(yard){for(const[id,n]of Object.entries(expected))assert.equal(yard.goodieInventory[id],n,id);}

test('two inventory-only IDs remain outside playable catalog and preserve exact integer counts above999',()=>{
 assert.deepEqual(YARD_INVENTORY_ONLY_GOODIE_IDS,Object.keys(expected));const p=fixture(),before=structuredClone(p.yard);
 const normalized=normalizeYardState(p.yard,{},now);assertCounts(normalized);assert.deepEqual(p.yard,before);
 for(const id of YARD_INVENTORY_ONLY_GOODIE_IDS)assert.equal(YARD_GOODIES[id],undefined);
 assert.deepEqual(normalizeYardState(normalized,{},now),normalized);
});
test('all positive safe integer counts survive; malformed values do not become grants',()=>{
 for(const n of[1,999,1000,5000000,Number.MAX_SAFE_INTEGER]){const p=fixture();p.yard.goodieInventory.alchemy_living_arbor=n;assert.equal(normalizeYardState(p.yard,{},now).goodieInventory.alchemy_living_arbor,n);}
 for(const n of[0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1201',null]){const p=fixture();p.yard.goodieInventory.alchemy_living_arbor=n;assert.equal(normalizeYardState(p.yard,{},now).goodieInventory.alchemy_living_arbor,undefined);}
 const p=fixture();p.yard.goodieInventory.unrecognized_future_prop=123;assert.equal(normalizeYardState(p.yard,{},now).goodieInventory.unrecognized_future_prop,undefined);
});
test('legacy count normalization/defaults and both other wallets are unchanged',()=>{
 const p=fixture();p.yard.goodieInventory.yarn_mouse=1201;p.yard.foodInventory.kibble=1201;
 const wallets=structuredClone({resources:p.resources,merge:p.merge,currencies:p.yard.currencies});
 const result=normalizeYardState(p.yard,{},now);assert.equal(result.goodieInventory.yarn_mouse,999);assert.equal(result.foodInventory.kibble,999);
 assert.deepEqual({resources:p.resources,merge:p.merge,currencies:result.currencies},wallets);
 const fresh=normalizeYardState(null,{},now);for(const id of YARD_INVENTORY_ONLY_GOODIE_IDS)assert.equal(fresh.goodieInventory[id],undefined);
});
test('offline simulation and harmless/rejected Yard actions preserve inventory without enabling placement',()=>{
 const p=fixture();const simulated=simulateYardState(p.yard,now+4*YARD_HOUR_MS,{},'preserved');assertCounts(simulated);
 const food=applyYardActionToState(simulated,'yard.setFood',{foodId:'kibble'}, {},'preserved',{now:now+4*YARD_HOUR_MS});assert.equal(food.status,200);assertCounts(food.yard);
 for(const id of YARD_INVENTORY_ONLY_GOODIE_IDS){const place=applyYardActionToState(simulated,'yard.placeGoodie',{goodieId:id,x:50,y:65},{},'preserved',{now:now+4*YARD_HOUR_MS});assert.equal(place.status,400);assertCounts(place.yard);assert.equal(place.yard.placedGoodies.length,0);}
});
test('actual buildSnapshot preserves both Yard and inventory projections across repeated snapshots',()=>{
 const p=fixture();for(let i=0;i<3;i++){const snapshot=buildSnapshot(p);assertCounts(snapshot.yard);assertCounts(p.yard);for(const[id,n]of Object.entries(expected))assert.equal(snapshot.inventory.yardGoodies[id],n);}
});
test('actual applyMigrations and JSON load roundtrip preserve previously granted outputs',()=>{
 for(const schemaVersion of[10,11]){const p=fixture();p.schemaVersion=schemaVersion;const loaded=applyMigrations(JSON.parse(JSON.stringify(p)));assert.equal(loaded.schemaVersion,11);assertCounts(loaded.yard);assertCounts(buildSnapshot(loaded).yard);}
});
test('actual mutation receipt replay rebuilds snapshots without erasing or duplicating goods',async()=>{
 const p=fixture();p.yard.currencies.treats=1000;
 const first=await applyActionWithReceipt(p,'yard.buyFood',{foodId:'berry_plate',qty:1},{clientActionId:'preservation:buy-food',serverNow:now});assert.equal(first.status,200);assertCounts(p.yard);
 const paid=p.yard.currencies.treats,receipts=structuredClone(p._actionReceipts);
 const loaded=JSON.parse(JSON.stringify(p));const replay=await applyActionWithReceipt(loaded,'yard.buyFood',{foodId:'berry_plate',qty:1},{clientActionId:'preservation:buy-food',serverNow:now+1});
 assert.equal(replay.status,200);assert.equal(replay.body.duplicate,true);assertCounts(loaded.yard);assert.equal(loaded.yard.currencies.treats,paid);assert.deepEqual(loaded._actionReceipts,receipts);
});
test('V3 exchange and exact receipt replay after JSON load preserve prior Yard counts and both wallets',async()=>{
 const offers=catalog.exchangeOffers.filter(o=>!o.locked&&(o.reward?.treats||o.reward?.shinyTreats));assert.equal(offers.length,2);
 for(const offer of offers){
  const p=fixture(`preservation-v3-${offer.id}`);buildSnapshot(p);assert.equal(p.merge.schemaVersion,3);
  p.merge.alchemyEssence=1000;
  const before={essence:p.merge.alchemyEssence,currencies:structuredClone(p.yard.currencies),gold:p.resources.gold,tokens:p.resources.gachaTokens,placed:structuredClone(p.yard.placedGoodies),visitors:structuredClone(p.yard.activeVisitors)};
  const quote=quoteMergeLab(p,'exchange',{offerId:offer.id},{now,expectedMergeEpoch:p.merge.serverEpoch});
  const payload={command:createMergeLabAction(p,'exchange',{offerId:offer.id,quote},catalog,{actionId:`preservation:${offer.id}`}),expectedMergeEpoch:p.merge.serverEpoch};
  const first=await applyActionWithReceipt(p,'merge.lab',payload,{clientActionId:'outer-first',serverNow:now});
  assert.equal(first.status,200);assert.equal(first.body.mergeLab.ok,true);assert.equal(first.body.mergeLab.replayed,false);
  assert.equal(p.merge.alchemyEssence,before.essence-offer.cost);
  assert.equal(p.yard.currencies.treats,before.currencies.treats+(offer.reward.treats||0));
  assert.equal(p.yard.currencies.shinyTreats,before.currencies.shinyTreats+(offer.reward.shinyTreats||0));
  assert.equal(p.resources.gold,before.gold);assert.equal(p.resources.gachaTokens,before.tokens);
  assertCounts(p.yard);assertCounts(first.body.snapshot.yard);
  for(const[id,n]of Object.entries(expected))assert.equal(first.body.snapshot.inventory.yardGoodies[id],n);
  assert.deepEqual(p.yard.placedGoodies,before.placed);assert.deepEqual(p.yard.activeVisitors,before.visitors);
  assert.equal(p.merge.actionLedger.length,1);assert.equal(p.merge.mergeRevision,1);
  assert.equal(p._actionReceipts?.items?.length||0,0,'V3 must use its epoch/revision ledger, not outer generic receipts');
  const loaded=applyMigrations(JSON.parse(JSON.stringify(p))),once=structuredClone({merge:loaded.merge,yard:loaded.yard});
  // The original command survives reload and quote expiry; a new outer receipt ID cannot debit again.
  const second=await applyActionWithReceipt(loaded,'merge.lab',payload,{clientActionId:'outer-retry',serverNow:quote.expiresAt+1});
  assert.equal(second.status,200);assert.equal(second.body.mergeLab.ok,true);assert.equal(second.body.mergeLab.replayed,true);
  assert.deepEqual(loaded.merge,once.merge);assert.deepEqual(loaded.yard,once.yard);assertCounts(second.body.snapshot.yard);
  for(const[id,n]of Object.entries(expected))assert.equal(second.body.snapshot.inventory.yardGoodies[id],n);
 }
});
test('a legacy exchange receipt cannot bypass V3 retirement after its migration snapshot',async()=>{
 const p=fixture();p.merge.alchemyEssence=100000;const offer=MERGE_EXCHANGE_OFFERS.find(o=>!o.locked&&o.reward?.treats);
 assert.ok(offer);const payload={offerId:offer.id},meta={clientActionId:'preservation:legacy-exchange',serverNow:now};
 const first=await applyActionWithReceipt(p,'merge.exchange',payload,meta);assert.equal(first.status,200);assertCounts(p.yard);
 assert.equal(p.merge.schemaVersion,3);assert.equal(p.merge.migration.mode,'clean-start');
 assert.ok(p._actionReceipts.items.some(receipt=>receipt.clientActionId===meta.clientActionId));
 const once=structuredClone(p),second=await applyActionWithReceipt(p,'merge.exchange',payload,{...meta,serverNow:now+1});
 assert.equal(second.status,410);assert.equal(second.body.code,'LEGACY_MERGE_RETIRED');assert.deepEqual(p,once);assertCounts(p.yard);
});
test('actual dedicated Merge route and playerManager memory load/save retain the two IDs',async()=>{
 const id='preservation-route';await withPlayerLock(id,p=>Object.assign(p,fixture(id)));const offer=MERGE_EXCHANGE_OFFERS.find(o=>!o.locked&&o.reward?.treats);
 await withPlayerLock(id,p=>{p.merge.alchemyEssence=100000;});
 const router=mergeRoutes(()=>{},()=>({userId:id}));const route=router.stack.find(r=>r.path==='/api/merge/exchange');assert.ok(route);
 let response;const res={statusCode:200,status(n){this.statusCode=n;return this;},json(body){response={status:this.statusCode,body};return this;}};
 await route.handlers.at(-1)({body:{offerId:offer.id}},res);assert.equal(response.status,200);assertCounts(response.body.yard);
 await withPlayerLock(id,p=>{assertCounts(p.yard);assertCounts(buildSnapshot(p).yard);});
});
