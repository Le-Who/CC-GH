import {readCandidateSource} from '../preview/yard-persistent-candidate/source.mjs';
import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_GOODIES,YARD_VISITORS,YARD_SLOT_LAYOUTS,getYardGoodieActivities} from '../game-logic/yard-catalog.js';
import {ensurePersistentPlayerYard,executePersistentYardAction,publicPersistentYard,inspectPlayerYard,YARD_STORAGE_FORMAT} from '../game-logic/yard-v2/service.mjs';
import {sourceCatalogActionPolicy} from '../game-logic/yard-v2/availability.mjs';
import {validPresentationPlan} from '../game-logic/yard-v2/simulation.mjs';
import {digest,clone} from '../game-logic/yard-v2/util.mjs';
import {hexToBase64url} from '../game-logic/yard-v2/sha256.mjs';
const {applyAction,applyActionWithReceipt,buildSnapshot}=await import('../routes/player.js');
const {applyMigrations,withPlayerLock}=await import('../playerManager.js');
import {MERGE_LAB_CATALOG} from '../game-logic/merge-lab-catalog.js';
import {createMergeLabAction} from '../game-logic/merge-lab-domain.js';
import {quoteMergeLab,executeMergeLab,ensureMergeLabState} from '../game-logic/merge-lab-service.js';
const NOW=Date.UTC(2026,9,2,12),H=3600000;
function player(id='persistent-fixture') {
 const p=createDefaultPlayer(id,'Fixture',NOW);p.yard.lastSimulatedAt=NOW;
 p.yard.currencies={treats:5000,shinyTreats:100,unknownWallet:7};
 p.yard.future={retained:['opaque']};p.resources.unrelated=99;p.gardenAccounting={version:1,active:false,opaque:'retained'};
 return p;
}
const placement=(goodieId='yarn_mouse',slotId='mouse',x=35,y=45)=>({goodieId,slotId,x,y,uses:0,condition:'new',placedAt:NOW,opaque:'keep'});
const disabled={scene:{entry:{x:90,y:68},exclusions:[]},mediaRegistry:{revision:'disabled-test',bindings:[]},preflight:()=>{throw Error('no binding');}};
const invoke=(p,action,payload={},options={})=>executePersistentYardAction(p,action,payload,{now:NOW,actionId:`yard-v2:${action}`, ...disabled,actionPolicy:sourceCatalogActionPolicy,...options});
function historical(p) {
 p.yard.pendingGifts=Array.from({length:105},(_,i)=>({id:`gift-${i}`,visitorId:'mika_cat',treats:1,shinyTreats:0,createdAt:NOW,opaque:i}));
 p.yard.album.photos=Array.from({length:110},(_,i)=>({id:`photo-${i}`,visitorId:'mika_cat',capturedAt:NOW,opaque:i}));
 p.yard.goodieInventory.alchemy_living_arbor=1201;p.yard.goodieInventory.alchemy_echo_chimes=2402;
 p.yard.goodieInventory.future_item=1234;
}
function testOptions() {
 return {scene:{entry:{x:90,y:68},exclusions:[]},mediaRegistry:{revision:'TEST-ONLY-full-stay',bindings:
  Object.values(YARD_GOODIES).flatMap(g=>Object.values(YARD_VISITORS).map(v=>({id:`test:${v.id}:${g.id}`,revision:'test',visitorId:v.id,goodieId:g.id,
   activityIds:[...new Set(['new','worn','broken'].flatMap(c=>getYardGoodieActivities(g,c).map(a=>a.id)))],propMode:'separate',playbackReady:true,
   requiredPhases:['TEST_ONLY'],validatedPhases:['TEST_ONLY']})))},
  preflight:c=>({ok:true,plan:{arrivalAt:c.at,departureAt:c.leavesAt-1000,propReleaseAt:c.leavesAt-1000,
   segments:[{kind:'loop',startAt:c.at,endAt:c.leavesAt}],reservationBoxes:[{x:30,y:40,width:18,height:18}],
   propCommits:[{at:c.at+500,slotId:c.slotId,transform:{x:c.placement.x+1,y:c.placement.y,rotationZ:.1,compression:1}}]}})};
}

test('one bounded source backup survives load/snapshot/actions; no unrelated player or wallet is archived or committed',()=>{
 const p=player();historical(p);p.secretForOtherFeature={neverArchive:true};p.yard.placedGoodies=[placement()];
 const source=clone(p.yard),resources=clone(p.resources),garden=clone(p.garden),merge=clone(p.merge),accounting=clone(p.gardenAccounting);
 assert.equal(ensurePersistentPlayerYard(p,{now:NOW,...disabled}).status,200);
 const archive=p._yardV2.migration,hash=digest(archive),before=clone(p._yardV2.migration.rawBackup);
 assert.deepEqual(p.yard,source);assert.equal(p._yardV2.format,YARD_STORAGE_FORMAT);
 for(const key of ['resources','garden','gardenAccounting','merge','purchases','secretForOtherFeature','_yardV2'])assert.equal(Object.hasOwn(before,key),false,key);
 for(let i=0;i<3;i++)assert.equal(ensurePersistentPlayerYard(p,{now:NOW+i,...disabled}).status,200);
 assert.equal(p._yardV2.migration,archive);assert.equal(invoke(p,'yard.buyFood',{foodId:'kibble'}).status,200);
 assert.equal(p._yardV2.migration,archive);assert.equal(digest(archive),hash);
 assert.deepEqual(p.resources,resources);assert.deepEqual(p.garden,garden);assert.deepEqual(p.merge,merge);assert.deepEqual(p.gardenAccounting,accounting);
 const loaded=applyMigrations(JSON.parse(JSON.stringify(p)));assert.deepEqual(loaded._yardV2.migration.rawBackup,before);
 assert.equal(loaded.yard.pendingGifts.length,105);assert.equal(loaded.yard.album.photos.length,110);assert.equal(loaded.yard.goodieInventory.future_item,1234);
});

test('actual all14 route commands either apply supported bindings or persist a no-cost policy rejection; both replay',async t=>{
 t.mock.method(Date,'now',()=>NOW);
 const cases={
  buyFood:[{foodId:'berry_plate',qty:2}],setFood:[{foodId:'kibble'}],buyGoodie:[{goodieId:'cardboard_cottage'}],
  placeGoodie:[{goodieId:'sun_cushion',slotId:'mouse',x:56,y:66}],
  moveGoodie:[{slotId:'mouse',x:37,y:45},p=>p.yard.placedGoodies.push(placement())],
  pickupGoodie:[{slotId:'mouse'},p=>p.yard.placedGoodies.push(placement())],
  fixGoodie:[{slotId:'mouse'},p=>p.yard.placedGoodies.push({...placement('sun_cushion','mouse',56,66),condition:'worn',uses:8})],
  collectGifts:[{},historical],capturePhoto:[{visitorId:'mika_cat'},p=>p.yard.petbook.mika_cat={visits:1}],
  favoritePhoto:[{photoId:'photo-0'},historical],setRemodel:[{remodelId:'meadow'}],buyExpansion:[{}],claimDailyLetter:[{}],
  configureCompanion:[{name:'Mika',species:'cat'}],
 };
 for(const [name,[payload,setup]] of Object.entries(cases)){
  const p=player(`route-${name}`);setup?.(p);buildSnapshot(p);const wallets=clone({resources:p.resources,garden:p.garden,gardenAccounting:p.gardenAccounting,merge:p.merge,_mergeLabFence:p._mergeLabFence});
  const action=`yard.${name}`,id=`yard-v2:route-${name}`,first=await applyActionWithReceipt(p,action,payload,{clientActionId:id,serverNow:NOW});
  const blocked=['buyFood','buyGoodie','buyExpansion'].includes(name);
  if(blocked){
   assert.equal(first.status,409,name);assert.equal(first.body.error,'YARD_BINDING_REQUIRED');
   const once=JSON.parse(JSON.stringify(p)),loaded=JSON.parse(JSON.stringify(p));
   const replay=await applyActionWithReceipt(loaded,action,payload,{clientActionId:id,serverNow:NOW+H});
   assert.equal(replay.status,409);assert.deepEqual(loaded,once);continue;
  }
  assert.equal(first.status,200,`${name}: ${JSON.stringify(first.body)}`);assert.equal(first.body.snapshot.yard.future.retained[0],'opaque');
  assert.equal(first.body.snapshot.yardRuntime.version,1);assert.equal(p._actionReceipts,undefined);
  const once=clone(p),loaded=JSON.parse(JSON.stringify(p));const replay=await applyActionWithReceipt(loaded,action,payload,{clientActionId:id,serverNow:NOW+H});
  assert.equal(replay.status,200,name);assert.equal(replay.body.duplicate,true);assert.deepEqual(loaded,once,name);
  assert.deepEqual({resources:p.resources,garden:p.garden,gardenAccounting:p.gardenAccounting,merge:p.merge,_mergeLabFence:p._mergeLabFence},wallets);
 }
});

test('retained production Yard receipts survive generic TTL pruning; compound conflicts and unknown old nonce reject before advance',async t=>{
 t.mock.method(Date,'now',()=>NOW);
 const p=player(),action='yard.buyFood',payload={foodId:'berry_plate'},id='retained-old-receipt';
 p._actionReceipts={items:[{clientActionId:id,action,payloadHash:hexToBase64url(digest({action,payload})),createdAt:0,extras:{foodId:'berry_plate',qty:1},opaque:'retain'}]};
 ensurePersistentPlayerYard(p,{now:NOW});p._actionReceipts={items:[]};const before=clone(p);
 const r=executePersistentYardAction(p,action,payload,{now:NOW+H,actionId:id});assert.equal(r.legacyReplay,true);assert.deepEqual(p,before);
 assert.equal(invoke(p,action,{...payload,qty:2},{actionId:id}).status,409);assert.deepEqual(p,before);
 assert.equal(invoke(p,action,payload,{actionId:'old-pruned'}).error,'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT');
 const first=await applyActionWithReceipt(p,action,{foodId:'kibble'},{clientActionId:'yard-v2:compound',serverNow:NOW});assert.equal(first.status,200);
 assert.equal((await applyActionWithReceipt(p,'yard.buyExpansion',{}, {clientActionId:'yard-v2:compound',serverNow:NOW})).status,409);
 assert.equal((await applyActionWithReceipt(p,'garden.goldDelta',{amount:1},{clientActionId:'yard-v2:compound',serverNow:NOW})).status,409);
 assert.equal((await applyAction(p,action,payload)).body.error,'YARD_STABLE_INTENT_REQUIRED');
});

test('malformed/future Yard and v2 versions remain byte-identical and cannot be reset on actual load or snapshot',t=>{
 t.mock.method(Date,'now',()=>NOW);
 for(const change of [p=>p.yard=null,p=>p.yard={...p.yard,schemaVersion:99},p=>p._yardV2={format:'future/v3',version:3,raw:'keep'},
  p=>{ensurePersistentPlayerYard(p,{now:NOW});p._yardV2.runtime.version=99;},p=>p.yard.pendingGifts=null]){
  const p=player();change(p);const yard=clone(p.yard),v2=clone(p._yardV2);
  const result=invoke(p,'yard.buyFood',{foodId:'kibble'});assert.notEqual(result.status,200);
  applyMigrations(p);const snapshot=buildSnapshot(p);assert.equal(snapshot.yardRuntime.mutable,false);
  assert.deepEqual(p.yard,yard);assert.deepEqual(p._yardV2,v2);
 }
});

test('public actual snapshots expose active plans/display/reservations, never receipts, archive or completed history',t=>{
 t.mock.method(Date,'now',()=>NOW);
 const p=player();historical(p);p.yard.placedGoodies=[placement()];
 p.yard.activeVisitors=[{visitId:'imported',visitorId:'mika_cat',goodieId:'yarn_mouse',slotId:'mouse',arrivedAt:NOW,leavesAt:NOW+H,opaque:'keep'}];
 ensurePersistentPlayerYard(p,{now:NOW});p._yardV2.runtime.visits.finished={...p._yardV2.runtime.visits.imported,visitId:'finished',status:'completed'};
 const out=buildSnapshot(p).yardRuntime;assert.equal(out.visits.length,1);assert.equal(out.visits[0].original.opaque,'keep');assert.equal(out.reservations.length,1);
 assert.ok(out.display.placements[0]);assert.equal(out.serverNow,NOW);
 for(const forbidden of ['rawBackup','giftLedger','commandReceipts','actionReceipts','migration','finished'])assert.equal(JSON.stringify(out).includes(`"${forbidden}"`),false,forbidden);
});

test('slot-only imported coordinates do not jump when expansion changes the source slot table',()=>{
 const p=player();p.yard.placedGoodies=[{goodieId:'yarn_mouse',slotId:'small-2',placedAt:NOW,condition:'new',uses:0,opaque:7}];
 ensurePersistentPlayerYard(p,{now:NOW});const raw=clone(p.yard.placedGoodies),first=publicPersistentYard(p,{now:NOW}).display.placements[0].anchor;
 assert.equal(invoke(p,'yard.buyExpansion',{}, {actionPolicy:sourceCatalogActionPolicy}).status,200);assert.deepEqual(p.yard.placedGoodies,raw);
 assert.deepEqual(publicPersistentYard(JSON.parse(JSON.stringify(p)),{now:NOW}).display.placements[0].anchor,first);
 assert.deepEqual(first,{x:42,y:44});
});

test('unsupported media is gated before servings/wear/petbook, including full catch-up and request partitions',()=>{
 const make=()=>{const p=player('unsupported');p.yard.placedGoodies=[placement('moon_lamp')];p.yard.bowls[0]={...p.yard.bowls[0],foodId:'kibble',servings:99,placedAt:NOW,expiresAt:NOW+100*H};return p;};
 const bulk=make(),parts=make();ensurePersistentPlayerYard(bulk,{now:NOW,...disabled});ensurePersistentPlayerYard(parts,{now:NOW,...disabled});ensurePersistentPlayerYard(bulk,{now:NOW+3*H,simulate:true,...disabled});
 for(let i=0;i<=180;i++)ensurePersistentPlayerYard(parts,{now:NOW+i*60000,simulate:true,...disabled});
 assert.deepEqual(parts,bulk);assert.equal(bulk.yard.bowls[0].servings,99);assert.equal(bulk.yard.placedGoodies[0].uses,0);assert.deepEqual(bulk.yard.petbook,{});
 assert.equal(bulk.yard.activeVisitors.length,0);
});

test('supported admission, server-time endpoint, real release and gifts are partition/reload stable',()=>{
 const options=testOptions();const make=()=>{const p=player('server-endpoints');p.yard.placedGoodies=[placement()];p.yard.bowls[0]={...p.yard.bowls[0],foodId:'kibble',servings:99,placedAt:NOW,expiresAt:NOW+100*H};return p;};
 const bulk=make();let parts=make();ensurePersistentPlayerYard(bulk,{now:NOW,...options});ensurePersistentPlayerYard(parts,{now:NOW,...options});ensurePersistentPlayerYard(bulk,{now:NOW+12*H,simulate:true,...options});
 for(let i=0;i<=720;i++){ensurePersistentPlayerYard(parts,{now:NOW+i*60000,simulate:true,...options});if(i===277)parts=JSON.parse(JSON.stringify(parts));}
 assert.deepEqual(parts,JSON.parse(JSON.stringify(bulk)));
 const records=Object.values(bulk._yardV2.runtime.visits);assert.ok(records.length>0);assert.equal(Object.keys(bulk._yardV2.runtime.propCommitReceipts).length,records.length);
 assert.equal(bulk.yard.placedGoodies[0].x,35+records.length);
 for(const r of records){assert.equal(r.releaseAt,r.leavesAt-1000);assert.ok((r.leavesAt-r.arrivedAt)/60000>=45);assert.ok((r.leavesAt-r.arrivedAt)/60000<=110);}
 const earned=bulk.yard.pendingGifts.length;assert.ok(earned>0);const paid=invoke(bulk,'yard.collectGifts',{}, {now:NOW+12*H,...options});assert.equal(paid.extras.collected.gifts,earned);
 const once=clone(bulk);assert.equal(invoke(bulk,'yard.collectGifts',{}, {now:NOW+13*H,...options}).replayed,true);assert.deepEqual(bulk,once);
});

test('plan must cover whole stay with ordered same-slot prop commits; invalid plans cannot spend a serving',()=>{
 const plan={arrivalAt:0,propReleaseAt:900,departureAt:900,segments:[{kind:'hidden',startAt:0,endAt:100},{kind:'loop',startAt:100,endAt:1000}],propCommits:[{at:800,slotId:'mouse',transform:{x:36,y:45,compression:1,rotationZ:0}}]};
 const context={at:0,leavesAt:1000,slotId:'mouse'};assert.equal(validPresentationPlan(plan,context),true);
 for(const change of [p=>p.segments[1].startAt=101,p=>p.propReleaseAt=500,p=>p.propCommits[0].slotId='other',p=>p.propCommits[0].transform.x=Infinity,p=>p.departureAt=1001]){const bad=clone(plan);change(bad);assert.equal(validPresentationPlan(bad,context),false);}
});

test('held full-body/exit region rejects other prop placement and remodel until departure',()=>{
 const p=player();ensurePersistentPlayerYard(p,{now:NOW});
 p._yardV2.runtime.visits.held={visitId:'held',status:'active',source:'yard-v2',original:{visitorId:'mika_cat',goodieId:'yarn_mouse'},slotId:'occupied',arrivedAt:NOW,leavesAt:NOW+H,releaseAt:NOW,
  mediaAdmission:{plan:{reservationBoxes:[{x:30,y:40,width:15,height:15}],propCommits:[]}}};
 const placed=invoke(p,'yard.placeGoodie',{goodieId:'yarn_mouse',slotId:'mouse',x:35,y:45});assert.equal(placed.status,400);assert.equal(placed.error,'placement intersects reserved visit path');
 const remodel=invoke(p,'yard.setRemodel',{remodelId:'tea_house'},{actionPolicy:sourceCatalogActionPolicy});assert.equal(remodel.status,400);assert.equal(p.yard.remodel,'meadow');
});

test('current withPlayerLock serializes concurrent duplicate purchases/gifts against fresh player, preserving later Garden state',async t=>{
 t.mock.method(Date,'now',()=>NOW);const id='persistent-lock-test';
 await withPlayerLock(id,p=>Object.assign(p,player(id)));const payload={goodieId:'sun_cushion'},meta={clientActionId:'yard-v2:locked-purchase',serverNow:NOW};
 const outcomes=await Promise.all(Array.from({length:4},()=>withPlayerLock(id,p=>applyActionWithReceipt(p,'yard.buyGoodie',payload,meta))));
 assert.equal(outcomes.filter(r=>!r.body.duplicate).length,1);
 await withPlayerLock(id,p=>{assert.equal(p.yard.goodieInventory.sun_cushion,2);assert.equal(p.yard.currencies.treats,5000-YARD_GOODIES.sun_cushion.cost.treats);p.resources.gold=654321;p.garden.persistentOtherProgress='fresh';p.yard.pendingGifts=[{id:'new-gift',treats:9,shinyTreats:0,createdAt:NOW,visitorId:'mika_cat'}];});
 const claims=await Promise.all(Array.from({length:3},()=>withPlayerLock(id,p=>applyActionWithReceipt(p,'yard.collectGifts',{}, {clientActionId:'yard-v2:locked-gift',serverNow:NOW}))));
 assert.equal(claims.filter(r=>!r.body.duplicate).length,1);
 await withPlayerLock(id,p=>{assert.equal(p.yard.currencies.treats,5000-YARD_GOODIES.sun_cushion.cost.treats+9);assert.equal(p.resources.gold,654321);assert.equal(p.garden.persistentOtherProgress,'fresh');});
});

test('Merge current epoch, additive grants and closed alchemy fence survive Yard storage across reload',()=>{
 const p=player();historical(p);ensurePersistentPlayerYard(p,{now:NOW});ensureMergeLabState(p,{now:NOW,newEpoch:()=> 'fixture_epoch_0123456789'});p.merge.alchemyEssence=1000;
 const archive=digest(p._yardV2.migration),offer=MERGE_LAB_CATALOG.exchangeOffers.find(o=>!o.locked&&o.reward?.treats);
 const quote=quoteMergeLab(p,'exchange',{offerId:offer.id},{now:NOW,expectedMergeEpoch:p.merge.serverEpoch});
 const payload={command:createMergeLabAction(p,'exchange',{offerId:offer.id,quote},MERGE_LAB_CATALOG,{actionId:'merge-yard-grant'}),expectedMergeEpoch:p.merge.serverEpoch};
 const start=p.yard.currencies.treats,first=executeMergeLab(p,payload,{now:NOW});assert.equal(first.ok,true);assert.equal(p.yard.currencies.treats,start+offer.reward.treats);assert.equal(digest(p._yardV2.migration),archive);
 const loaded=JSON.parse(JSON.stringify(p));assert.equal(executeMergeLab(loaded,payload,{now:quote.expiresAt+1}).replayed,true);assert.deepEqual(loaded,p);
 for(const projectId of ['living_arbor','echo_chimes'])assert.throws(()=>quoteMergeLab(p,'craftProject',{projectId,quantity:1},{now:NOW,expectedMergeEpoch:p.merge.serverEpoch}),{code:'YARD_UPDATE_REQUIRED'});
 const broken=clone(p);broken._yardV2.version=99;const before=clone(broken);
 assert.throws(()=>quoteMergeLab(broken,'exchange',{offerId:offer.id},{now:NOW,expectedMergeEpoch:p.merge.serverEpoch}),{code:'UNSUPPORTED_YARD_STORAGE_VERSION'});assert.deepEqual(broken,before);
});

test('actual load/snapshot/mutation/Merge callers have no remaining legacy normalization bypass',async()=>{
 for(const path of ['../routes/player.js','../routes/mergeRoutes.js','../playerManager.js']){
  const source=await readCandidateSource(new URL(path,import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:normalizeYardState|simulateYardState|applyYardActionToState)\s*\(/,path);
 }
});


test('release availability rejects unsupported spending/placement before costs and exposes exact capabilities',()=>{
 const cases=[['yard.buyFood',{foodId:'berry_plate'}],['yard.buyFood',{foodId:'bonito_bowl'}],['yard.setFood',{foodId:'berry_plate'}],
  ['yard.buyGoodie',{goodieId:'moon_lamp'}],['yard.placeGoodie',{goodieId:'moon_lamp',slotId:'lamp',x:50,y:60}],
  ['yard.fixGoodie',{slotId:'lamp'}],['yard.setRemodel',{remodelId:'tea_house'}],['yard.buyExpansion',{}]];
 for(const [i,[action,payload]] of cases.entries()){
  const p=player();p.yard.foodInventory.berry_plate=3;p.yard.goodieInventory.moon_lamp=2;p.yard.placedGoodies=[{...placement('moon_lamp','lamp',50,60),condition:'worn',uses:12}];
  const before=clone(p.yard),r=executePersistentYardAction(p,action,payload,{now:NOW,actionId:`yard-v2:unavailable-${i}`});
  assert.equal(r.status,409,action);assert.equal(r.error,'YARD_BINDING_REQUIRED');assert.deepEqual(p.yard,before);
  assert.equal(invoke(p,action,payload,{actionId:`yard-v2:unavailable-${i}`,actionPolicy:sourceCatalogActionPolicy}).replayed,true,'later capability changes cannot reinterpret an old failed intent');
 }
 const p=player();ensurePersistentPlayerYard(p,{now:NOW});const b=publicPersistentYard(p,{now:NOW}).supportedBindings;
 assert.equal(b.foods.kibble.buy,true);assert.equal(b.foods.berry_plate.set,false);assert.equal(b.goodies.sun_cushion.place,true);assert.equal(b.goodies.moon_lamp.pickup,true);assert.equal(b.expansion.buy,false);
});

test('malformed durable maps and unknown gift states are review-only, never zeroed or paid again',()=>{
 for(const change of [p=>p._yardV2.runtime.commandReceipts=null,p=>p._yardV2.runtime.giftLedger.bad={status:'future-paid'},
  p=>p._yardV2.runtime.visits.bad=null,p=>p._yardV2.runtime.legacyPlacementAnchors=null]){
  const p=player();ensurePersistentPlayerYard(p,{now:NOW});change(p);const before=clone(p);
  assert.notEqual(invoke(p,'yard.collectGifts').status,200);assert.deepEqual(p,before);
  ensurePersistentPlayerYard(p,{now:NOW});assert.deepEqual(p,before);assert.equal(publicPersistentYard(p,{now:NOW}).mutable,false);
 }
});

test('actual calibrated cushion admits a real59-minute stay and keeps reservation through step-off before gift',()=>{
 const p=player('bounded-cushion-0');p.yard.placedGoodies=[placement('sun_cushion','cushion',54,66)];
 p.yard.bowls[0]={...p.yard.bowls[0],foodId:'kibble',servings:99,placedAt:NOW,expiresAt:NOW+24*H};
 ensurePersistentPlayerYard(p,{now:NOW});assert.equal(ensurePersistentPlayerYard(p,{now:NOW+4*H,simulate:true}).status,200);
 const [record]=Object.values(p._yardV2.runtime.visits);assert.ok(record);assert.equal(record.original.visitorId,'mika_cat');
 assert.equal((record.leavesAt-record.arrivedAt)/60000,59);
 assert.ok(record.releaseAt>record.arrivedAt+(record.leavesAt-record.arrivedAt)*.99);
 assert.equal(record.leavesAt-record.releaseAt,1800);
 const plan=record.mediaAdmission.plan;assert.equal(plan.schedule.segments.at(-1).role,'depart');
 const loop=plan.schedule.segments.find(s=>s.kind==='loop');assert.ok(loop.endAt-loop.startAt>50*60000);
 assert.equal(ensurePersistentPlayerYard(p,{now:record.releaseAt-1,simulate:true}).status,200);
 assert.equal(publicPersistentYard(p,{now:record.releaseAt-1}).reservations.length,1);assert.equal(p.yard.pendingGifts.length,0);
 assert.equal(ensurePersistentPlayerYard(p,{now:record.releaseAt,simulate:true}).status,200);
 assert.equal(Object.keys(p._yardV2.runtime.propCommitReceipts).length,1);assert.equal(p.yard.pendingGifts.length,0);
 assert.equal(ensurePersistentPlayerYard(p,{now:record.leavesAt,simulate:true}).status,200);assert.equal(p.yard.pendingGifts.length,1);
 const once=clone(p);assert.equal(ensurePersistentPlayerYard(p,{now:record.leavesAt,simulate:true}).status,200);assert.deepEqual(p,once);
});


test('full-stay registry readiness, not static art membership, gates a supported prop before payment',()=>{
 const p=player();p.yard.placedGoodies=[{...placement(),condition:'worn',uses:8}];const before=clone(p.yard);
 for(const [i,[action,payload]] of [['yard.buyGoodie',{goodieId:'yarn_mouse'}],['yard.placeGoodie',{goodieId:'yarn_mouse',slotId:'new',x:50,y:60}],['yard.fixGoodie',{slotId:'mouse'}]].entries()){
  const r=executePersistentYardAction(p,action,payload,{now:NOW,actionId:`yard-v2:no-full-stay-${i}`,mediaRegistry:{revision:'explicit-not-ready',bindings:[{goodieId:'yarn_mouse',playbackReady:false}]}});
  assert.equal(r.status,409);assert.equal(r.error,'YARD_BINDING_REQUIRED');assert.deepEqual(p.yard,before);
 }
});

test('public placement readiness uses stable projected legacy anchors and never rewrites saved rows',()=>{
 const slot=YARD_SLOT_LAYOUTS[1].find(row=>row.size===YARD_GOODIES.yarn_mouse.size);
 const p=player('readiness-legacy');p.yard.placedGoodies=[{slotId:slot.id,goodieId:'yarn_mouse',uses:0,condition:'new',placedAt:NOW,opaque:'keep'}];
 const imported=ensurePersistentPlayerYard(p,{now:NOW,...disabled});assert.equal(imported.status,200);
 const before=clone(p),seen=[];
 const output=publicPersistentYard(p,{now:NOW,...disabled,placementReadiness:yard=>{seen.push(clone(yard));return yard.placedGoodies.map(row=>({slotId:row.slotId,status:Number.isFinite(row.x)?'ready':'reposition-needed'}));}});
 assert.equal(seen.length,1);assert.equal(seen[0].placedGoodies[0].x,slot.x);assert.equal(seen[0].placedGoodies[0].y,slot.y);
 assert.equal(output.placementReadiness[0].status,'ready');assert.deepEqual(p,before);assert.equal(Object.hasOwn(p.yard.placedGoodies[0],'x'),false);
});

test('invalid future Yard storage exposes no readiness capability and remains untouched',()=>{
 const p=player('readiness-future');p._yardV2={version:99,format:'future-format',opaque:'retain'};const before=clone(p);
 const output=publicPersistentYard(p,{now:NOW,placementReadiness:()=>{throw Error('future storage must not be projected');}});
 assert.equal(output.mutable,false);assert.deepEqual(output.placementReadiness,[]);assert.deepEqual(p,before);
});
