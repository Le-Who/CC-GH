import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDefaultPlayer} from '../game-logic/player.js';
import {ensurePersistentPlayerYard,executePersistentYardAction,inspectPlayerYard,publicPersistentYard,yardCommandConflict} from '../game-logic/yard-v2/service.mjs';
import {CANONICAL_LOCATION,CANONICAL_ITEM,CANONICAL_GEOMETRY,CANONICAL_ITEM_PLACEMENT_ENABLED,CANONICAL_MAX_PLACEMENTS,canonicalFootprintValid,canonicalCompositionValid} from '../game-logic/yard-v2/canonical-locations.mjs';
import {createCleanProjection,assertCleanComposition} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import protocol from '../game-logic/yard-v2/canonical-item-protocol.json' with {type:'json'};
import {YARD_GOODIES} from '../game-logic/yard-v2/catalog.mjs';
import {sourceCatalogActionPolicy} from '../game-logic/yard-v2/availability.mjs';
import {NOW,canonicalFixture,canonicalPayload,assertCanonicalIsolation} from './helpers/yard-canonical-item-fixture.mjs';
const act=(p,action,payload,id,options={})=>executePersistentYardAction(p,action,payload,{now:NOW,actionId:`yard-v2:canonical-v1/${id}`,canonicalItemPlacementEnabled:true,...options});

test('registered inactive canonical ground and T2 footprint retain exact fixture and catalog identity',()=>{
  assert.equal(CANONICAL_ITEM_PLACEMENT_ENABLED,false);
  const fixture=JSON.parse(readFileSync(new URL('../src/games/companion-yard-v2/pip-prototype/data/fixture.json',import.meta.url)));
  const descriptor=JSON.parse(readFileSync(new URL('../src/games/companion-yard-v2/pip-prototype/data/location.json',import.meta.url)));
  assert.deepEqual(CANONICAL_GEOMETRY.ground,fixture.location.ground);
  assert.deepEqual(protocol.domain,CANONICAL_GEOMETRY.domain);
  const fixedIds=descriptor.foregroundExclusions.map(o=>o.id);
  assert.deepEqual(CANONICAL_GEOMETRY.exclusions,fixture.location.obstacles.filter(o=>fixedIds.includes(o.id)).map(({id,polygon})=>({id,polygon})));
  assert.deepEqual(CANONICAL_GEOMETRY.composition.foregroundExclusions,descriptor.foregroundExclusions);
  for(const[k,v]of Object.entries(CANONICAL_GEOMETRY.composition.camera))assert.deepEqual(v,descriptor.camera[k]);
  for(const k of ['cost','durability','capacity'])assert.deepEqual(CANONICAL_ITEM[k],YARD_GOODIES.leaf_pot[k]);
  assert.equal(createHash('sha256').update(readFileSync(new URL('../src/games/companion-yard-v2/pip-prototype/assets/planter-t2.glb',import.meta.url))).digest('hex'),CANONICAL_ITEM.assetSha256);
  assert.equal(CANONICAL_ITEM.footprintRadius,fixture.planter.navigationRadiusCanonical);
  assert.equal(canonicalFootprintValid(98,118),true);assert.equal(canonicalFootprintValid(72,145),true);
  assert.equal(canonicalFootprintValid(88,172),true,'Unplaced fixture bench is not an invisible obstacle');
  assert.equal(canonicalFootprintValid(49,120),true,'Unplaced fixture cushion is not an invisible obstacle');
  assert.equal(canonicalFootprintValid(98,118,[{slotId:'other',x:99,y:118}]),false);
  const p=canonicalFixture(),view=publicPersistentYard(p,{now:NOW});
  assert.deepEqual(view.canonicalPlacements,[]);assert.equal(view.itemPlacementCapabilities.enabled,false);
  assert.equal(view.itemPlacementCapabilities.visitAdmission,false);assert.equal(view.itemPlacementCapabilities.maxPlacements,CANONICAL_MAX_PLACEMENTS);
  assert.equal(CANONICAL_MAX_PLACEMENTS,2);assert.equal(CANONICAL_ITEM.capacity,1);
});

test('canonical place/reload/move/pickup changes only shared ownership and durable item records',()=>{
  let p=canonicalFixture();const before=structuredClone(p);
  const placed=act(p,'yard.placeGoodie',canonicalPayload(),'place');assert.equal(placed.status,200);
  assert.equal(p._yardV2.version,2);assert.equal(p.yard.goodieInventory.leaf_pot,1);
  for(const[k,v]of Object.entries(CANONICAL_LOCATION))assert.equal(placed.receipt[k],v);
  assertCanonicalIsolation(before,p);
  p=JSON.parse(JSON.stringify(p));assert.equal(inspectPlayerYard(p,{now:NOW}).status,200);
  assert.deepEqual(publicPersistentYard(p,{now:NOW}).canonicalPlacements,[placed.extras.placement]);
  const moved=act(p,'yard.moveGoodie',canonicalPayload({x:72,y:145}),'move');assert.equal(moved.status,200);
  assert.equal(moved.extras.placement.placedAt,NOW);assertCanonicalIsolation(before,p);
  const removed=act(p,'yard.pickupGoodie',canonicalPayload(),'pickup');assert.equal(removed.status,200);
  assert.equal(p.yard.goodieInventory.leaf_pot,2);assert.deepEqual(p._yardV2.runtime.canonicalPlacements,[]);
  assert.equal(p._yardV2.version,2);assertCanonicalIsolation(before,p);
  const saved=structuredClone(p);assert.equal(act(p,'yard.pickupGoodie',canonicalPayload(),'pickup').replayed,true);assert.deepEqual(p,saved);
});

test('full-height T2 foreground refusal agrees with the existing UI composition at mobile and landscape fits',()=>{
  const descriptor=JSON.parse(readFileSync(new URL('../src/games/companion-yard-v2/pip-prototype/data/location.json',import.meta.url)));
  const placements=[[98,118],[72,145],[88,172],[49,120],[85,195],[65,195],[35,165],[150,85],[185,69],[5,145]];
  for(const [width,height]of [[280,192],[320,568],[390,648],[844,390]]){
    const projection=createCleanProjection(descriptor,width,height);
    for(const [x,y]of placements){
      let renderable=true;try{assertCleanComposition(projection,{x:98,y:118,z:0},[x,y,0]);}catch{renderable=false;}
      assert.equal(canonicalCompositionValid(x,y),renderable,`${x},${y} at ${width}x${height}`);
      if(!renderable)assert.equal(canonicalFootprintValid(x,y),false);
    }
  }
  const p=canonicalFixture(),before=structuredClone(p);
  assert.equal(act(p,'yard.placeGoodie',canonicalPayload({x:85,y:195}),'foreground').error,'CANONICAL_PLACEMENT_INVALID');
  assert.equal(p.yard.goodieInventory.leaf_pot,2);assertCanonicalIsolation(before,p);
});

test('lost committed response and changed-payload retries use one durable nonce without another debit',()=>{
  let p=canonicalFixture();const payload=canonicalPayload();assert.equal(act(p,'yard.placeGoodie',payload,'lost').status,200);
  p=JSON.parse(JSON.stringify(p));const once=structuredClone(p);
  const replay=act(p,'yard.placeGoodie',payload,'lost',{now:NOW+10*86400000,canonicalItemPlacementEnabled:false});
  assert.equal(replay.replayed,true);assert.equal(replay.status,200);assert.deepEqual(p,once);
  assert.equal(act(p,'yard.placeGoodie',{...payload,x:72,y:145},'lost').error,'ACTION_ID_PAYLOAD_CONFLICT');assert.deepEqual(p,once);
  assert.equal(yardCommandConflict(p,'garden.r2','yard-v2:canonical-v1/lost'),'ACTION_ID_PAYLOAD_CONFLICT');
});

test('registry and enablement failures preserve the raw save and leave the same nonce retryable',()=>{
  for(const [extra,options,error]of [
    [{locationId:'other'},{},'CANONICAL_LOCATION_UNKNOWN'],
    [{locationVersion:2},{},'CANONICAL_LOCATION_VERSION_MISMATCH'],
    [{geometryRevision:'other'},{},'CANONICAL_GEOMETRY_REVISION_MISMATCH'],
    [{},{canonicalItemPlacementEnabled:false},'CANONICAL_ITEM_PLACEMENT_DISABLED'],
    [{},{actionId:'yard-v2:old-syntax'},'CANONICAL_NONCE_REQUIRED'],
  ]){const p=canonicalFixture(),before=structuredClone(p),result=act(p,'yard.placeGoodie',canonicalPayload(extra),'gated',options);
    assert.equal(result.status,409);assert.equal(result.error,error);assert.equal(result.receipt,undefined);assert.deepEqual(p,before);
    assert.equal(act(p,'yard.placeGoodie',canonicalPayload(),'gated').status,200);
  }
});

test('full footprint, exclusions, condition, slot and ownership failures never debit or advance the old yard',()=>{
  const cases=[
    [{x:NaN},'CANONICAL_PLACEMENT_INVALID'],[{x:'98'},'CANONICAL_PLACEMENT_INVALID'],
    [{x:201},'CANONICAL_PLACEMENT_INVALID'],[{x:97.37854353207702,y:7.451427617458037},'CANONICAL_PLACEMENT_INVALID'],
    [{x:25,y:182},'CANONICAL_PLACEMENT_INVALID'],[{x:49,y:204},'CANONICAL_PLACEMENT_INVALID'],
    [{slotId:''},'CANONICAL_SLOT_ID_REQUIRED'],[{slotId:'old-cushion'},'CANONICAL_SLOT_ID_REQUIRED'],
    [{goodieId:'snack_table'},'CANONICAL_GOODIE_UNSUPPORTED'],[{condition:'worn'},'CANONICAL_CONDITION_UNSUPPORTED'],
    [{uses:8},'CANONICAL_CONDITION_UNSUPPORTED'],[{z:1},'CANONICAL_TRANSFORM_UNSUPPORTED'],[{rotationZ:1},'CANONICAL_TRANSFORM_UNSUPPORTED'],
  ];
  for(const [extra,error]of cases){const p=canonicalFixture(),before=structuredClone(p),result=act(p,'yard.placeGoodie',canonicalPayload(extra),'invalid');
    assert.equal(result.status,400,JSON.stringify(extra));assert.equal(result.error,error);assert.equal(p.yard.goodieInventory.leaf_pot,2);
    assert.equal(p._yardV2.version,1);assertCanonicalIsolation(before,p);
    assert.equal(act(p,'yard.placeGoodie',canonicalPayload(extra),'invalid').replayed,true);
  }
  const p=canonicalFixture();delete p.yard.goodieInventory.leaf_pot;const before=structuredClone(p);
  assert.equal(act(p,'yard.placeGoodie',canonicalPayload(),'unowned').error,'CANONICAL_GOODIE_NOT_OWNED');assertCanonicalIsolation(before,p);
});

test('exact target identity and old fallback cannot spend or pick up the canonical placement',()=>{
  const p=canonicalFixture();assert.equal(act(p,'yard.placeGoodie',canonicalPayload(),'first').status,200);const before=structuredClone(p);
  for(const[action,payload,error]of [
    ['yard.placeGoodie',canonicalPayload(),'CANONICAL_SLOT_ID_CONFLICT'],
    ['yard.placeGoodie',canonicalPayload({slotId:'canonical:second',x:99,y:118}),'CANONICAL_PLACEMENT_INVALID'],
    ['yard.moveGoodie',canonicalPayload({slotId:'canonical:missing'}),'CANONICAL_SLOT_NOT_FOUND'],
    ['yard.pickupGoodie',canonicalPayload({goodieId:'sun_cushion'}),'CANONICAL_SLOT_GOODIE_MISMATCH'],
  ])assert.equal(act(p,action,payload,error).error,error);
  const oldFallback=executePersistentYardAction(p,'yard.pickupGoodie',{goodieId:'leaf_pot'},{now:NOW,actionId:'yard-v2:old-goodie-fallback'});
  assert.equal(oldFallback.status,400);assert.equal(p.yard.goodieInventory.leaf_pot,1);
  assert.deepEqual(p._yardV2.runtime.canonicalPlacements,before._yardV2.runtime.canonicalPlacements);
  assertCanonicalIsolation(before,p);
  for(const action of ['yard.placeGoodie','yard.moveGoodie','yard.pickupGoodie','yard.fixGoodie'])for(const slotId of ['canonical:owned-leaf',['canonical:owned-leaf']]){
    const raw=structuredClone(p);
    const collision=executePersistentYardAction(p,action,{slotId,goodieId:'sun_cushion',x:60,y:48},{now:NOW+86400000,actionId:`yard-v2:collision-${action}`,actionPolicy:sourceCatalogActionPolicy});
    assert.equal(collision.error,'CANONICAL_LOCATION_REQUIRED');assert.equal(collision.receipt,undefined);assert.deepEqual(p,raw);
  }
});

test('two owned T2 instances persist visibly, reject a third or collision, and move/refund once by exact slot',()=>{
  let p=canonicalFixture();const before=structuredClone(p);
  const first=canonicalPayload(),second=canonicalPayload({slotId:'canonical:blocker',x:72,y:145});
  assert.equal(act(p,'yard.placeGoodie',first,'two-first').status,200);
  assert.equal(act(p,'yard.placeGoodie',second,'two-second').status,200);
  assert.equal(p.yard.goodieInventory.leaf_pot,undefined);assertCanonicalIsolation(before,p);
  p=JSON.parse(JSON.stringify(p));const once=structuredClone(p);
  assert.equal(inspectPlayerYard(p,{now:NOW}).status,200);
  assert.deepEqual(publicPersistentYard(p,{now:NOW}).canonicalPlacements,p._yardV2.runtime.canonicalPlacements);
  assert.deepEqual(p._yardV2.runtime.canonicalPlacements.map(row=>row.slotId),[first.slotId,second.slotId]);
  assert.equal(act(p,'yard.placeGoodie',second,'two-second',{canonicalItemPlacementEnabled:false}).replayed,true);assert.deepEqual(p,once);
  const third=canonicalPayload({slotId:'canonical:third',x:115,y:100});
  assert.equal(canonicalFootprintValid(third.x,third.y,p._yardV2.runtime.canonicalPlacements),true);
  assert.equal(act(p,'yard.placeGoodie',third,'two-third').error,'CANONICAL_LOCATION_CAPACITY_REACHED');
  assert.equal(p.yard.goodieInventory.leaf_pot,undefined);assert.deepEqual(p._yardV2.runtime.canonicalPlacements,once._yardV2.runtime.canonicalPlacements);
  assert.equal(act(p,'yard.moveGoodie',{...first,x:second.x,y:second.y},'two-overlap').error,'CANONICAL_PLACEMENT_INVALID');
  assert.deepEqual(p._yardV2.runtime.canonicalPlacements,once._yardV2.runtime.canonicalPlacements);
  const moved={...first,x:115,y:100};assert.equal(act(p,'yard.moveGoodie',moved,'two-move').status,200);
  const afterMove=structuredClone(p);assert.equal(act(p,'yard.moveGoodie',moved,'two-move').replayed,true);assert.deepEqual(p,afterMove);
  assert.deepEqual(p._yardV2.runtime.canonicalPlacements[1],once._yardV2.runtime.canonicalPlacements[1]);
  assert.equal(act(p,'yard.pickupGoodie',first,'two-pickup-first').status,200);assert.equal(p.yard.goodieInventory.leaf_pot,1);
  assert.deepEqual(p._yardV2.runtime.canonicalPlacements,[once._yardV2.runtime.canonicalPlacements[1]]);
  const afterPickup=structuredClone(p);assert.equal(act(p,'yard.pickupGoodie',first,'two-pickup-first').replayed,true);assert.deepEqual(p,afterPickup);
  assert.equal(act(p,'yard.pickupGoodie',second,'two-pickup-second').status,200);assert.equal(p.yard.goodieInventory.leaf_pot,2);
  assert.deepEqual(p._yardV2.runtime.canonicalPlacements,[]);assert.equal(p._yardV2.version,2);assertCanonicalIsolation(before,p);
});

test('legacy and canonical locations consume and refund the same inventory with existing legacy payload behavior',()=>{
  const p=canonicalFixture();assert.equal(act(p,'yard.placeGoodie',canonicalPayload(),'canonical-place').status,200);
  const legacy=(action,payload,id)=>executePersistentYardAction(p,action,payload,{now:NOW,actionId:`yard-v2:${id}`,actionPolicy:sourceCatalogActionPolicy});
  assert.equal(legacy('yard.placeGoodie',{goodieId:'leaf_pot',slotId:'old-leaf',x:60,y:48},'old-place').status,200);
  assert.equal(p.yard.goodieInventory.leaf_pot,undefined);
  assert.equal(legacy('yard.pickupGoodie',{goodieId:'leaf_pot'},'old-pickup').status,200);
  assert.equal(p.yard.goodieInventory.leaf_pot,1);assert.equal(p._yardV2.runtime.canonicalPlacements.length,1);
  assert.equal(act(p,'yard.pickupGoodie',canonicalPayload(),'canonical-pickup').status,200);assert.equal(p.yard.goodieInventory.leaf_pot,2);
});

test('canonical storage version and invalid rows fail closed without normalization',()=>{
  const base=canonicalFixture();assert.equal(act(base,'yard.placeGoodie',canonicalPayload(),'place').status,200);
  for(const corrupt of [p=>p._yardV2.version=1,p=>p._yardV2.version=3,p=>p._yardV2.runtime.canonicalPlacements[0].x=0,
    p=>p._yardV2.runtime.canonicalPlacements.push(null),
    p=>p._yardV2.runtime.canonicalPlacements[0].slotId=['canonical:owned-leaf'],
    p=>p._yardV2.runtime.canonicalPlacements[0].condition='worn',p=>p._yardV2.runtime.canonicalPlacements.push({...p._yardV2.runtime.canonicalPlacements[0],slotId:'canonical:second'}),
    p=>p._yardV2.runtime.canonicalPlacements[0].locationVersion=2]){
    const p=structuredClone(base);corrupt(p);const before=structuredClone(p);
    assert.equal(ensurePersistentPlayerYard(p,{now:NOW}).status,409);assert.deepEqual(p,before);
  }
});

test('disabled new server exposes saved canonical presence read-only and rejects unsupported envelopes before advancement',()=>{
  const p=canonicalFixture();assert.equal(act(p,'yard.placeGoodie',canonicalPayload(),'place').status,200);
  const before=structuredClone(p),view=publicPersistentYard(p,{now:NOW});
  assert.equal(view.itemPlacementCapabilities.readOnly,true);assert.equal(view.canonicalPlacements.length,1);
  assert.equal(act(p,'yard.moveGoodie',canonicalPayload({x:72,y:145}),'disabled',{canonicalItemPlacementEnabled:false}).error,'CANONICAL_ITEM_PLACEMENT_DISABLED');assert.deepEqual(p,before);
  assert.equal(act(p,'yard.setFood',{foodId:'kibble'},'wrong-action',{now:NOW+86400000}).error,'CANONICAL_ACTION_UNSUPPORTED');assert.deepEqual(p,before);
  assert.equal(act(p,'yard.placeGoodie',{goodieId:'leaf_pot',x:60,y:48,slotId:'old-slot'},'missing-location').error,'CANONICAL_LOCATION_UNKNOWN');assert.deepEqual(p,before);
});

test('malformed secondary-row coordinates and identities quarantine before cross-row geometry without rewriting raw JSON',()=>{
  const valid=canonicalFixture();
  assert.equal(act(valid,'yard.placeGoodie',canonicalPayload(),'secondary-first').status,200);
  assert.equal(act(valid,'yard.placeGoodie',canonicalPayload({slotId:'canonical:blocker',x:72,y:145}),'secondary-second').status,200);
  for(const [field,value]of [
    ['x',{toString:null}],['y',{toString:null}],['x','72'],['y',null],
    ['slotId',['canonical:blocker']],['slotId',{toString:null}],['slotId','canonical:owned-leaf'],
  ]){
    const p=JSON.parse(JSON.stringify(valid));p._yardV2.runtime.canonicalPlacements[1][field]=value;
    const raw=JSON.stringify(p),before=JSON.parse(raw);
    const inspected=inspectPlayerYard(p,{now:NOW});
    assert.equal(inspected.status,409);assert.equal(inspected.error,'MALFORMED_CANONICAL_YARD_STORAGE');
    assert.equal(ensurePersistentPlayerYard(p,{now:NOW,simulate:true}).error,'MALFORMED_CANONICAL_YARD_STORAGE');
    assert.equal(publicPersistentYard(p,{now:NOW}).status,'review-required');
    const mutation=act(p,'yard.pickupGoodie',canonicalPayload(),'secondary-corrupt');
    assert.equal(mutation.error,'MALFORMED_CANONICAL_YARD_STORAGE');assert.equal(mutation.receipt,undefined);
    assert.deepEqual(p,before);assert.equal(JSON.stringify(p),raw);
  }
});

test('two canonical leaves remain ineligible for visits, food consumption, wear, gifts and photos after ordinary clock advancement',()=>{
  const p=createDefaultPlayer('canonical-no-visitor','Fixture',NOW);
  p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.goodieInventory.leaf_pot=2;
  p.yard.bowls[0]={...p.yard.bowls[0],foodId:'kibble',servings:3,placedAt:NOW,expiresAt:NOW+7200000};
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW}).status,200);
  assert.equal(act(p,'yard.placeGoodie',canonicalPayload(),'item-only').status,200);
  assert.equal(act(p,'yard.placeGoodie',canonicalPayload({slotId:'canonical:blocker',x:72,y:145}),'item-only-blocker').status,200);
  const rows=structuredClone(p._yardV2.runtime.canonicalPlacements);
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW+3600000,simulate:true,canonicalItemPlacementEnabled:true}).status,200);
  assert.deepEqual(p._yardV2.runtime.visits,{});assert.deepEqual(p.yard.activeVisitors,[]);assert.deepEqual(p.yard.pendingGifts,[]);
  assert.equal(p.yard.bowls[0].servings,3);assert.deepEqual(p._yardV2.runtime.canonicalPlacements,rows);
  const photo=executePersistentYardAction(p,'yard.capturePhoto',{visitId:rows[0].slotId},{now:NOW+3600000,actionId:'yard-v2:canonical-photo'});
  assert.equal(photo.status,400);assert.deepEqual(p.yard.album.photos,[]);
});

test('exact published old v1 refuses new nonce before migration and new storage after migration, preserving raw layout',async()=>{
  const root=new URL('../',import.meta.url),base='4660ba9d84a0abb40f7c77bed7a702caba18b67b';
  const source=path=>execFileSync('git',['show',`${base}:${path}`],{cwd:root,encoding:'utf8'});
  const url=(path,text)=>'data:text/javascript;base64,'+Buffer.from(text.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,quote,relative)=>`from '${new URL(relative,new URL(path,root)).href}'`)).toString('base64');
  const actions=url('game-logic/yard-v2/actions.mjs',source('game-logic/yard-v2/actions.mjs'));
  const old=await import(url('game-logic/yard-v2/service.mjs',source('game-logic/yard-v2/service.mjs').replace("'./actions.mjs'",`'${actions}'`)));
  // These opaque IDs were legal before the prefix was reserved. Existing exact
  // legacy targets retain old behavior; they never identify canonical storage.
  for(const [action,payload]of [
    ['yard.placeGoodie',{slotId:'canonical:queued-old-slot',goodieId:'leaf_pot',x:60,y:48}],
    ['yard.moveGoodie',{slotId:'canonical:historical-slot',goodieId:'leaf_pot',x:62,y:46}],
    ['yard.pickupGoodie',{slotId:'canonical:historical-slot',goodieId:'leaf_pot'}],
    ['yard.fixGoodie',{slotId:'canonical:historical-slot',goodieId:'leaf_pot'}],
  ]){
    const historical=createDefaultPlayer('old-prefixed-slot','Fixture',NOW);
    historical.yard.placedGoodies=action==='yard.placeGoodie'?[]:[{slotId:'canonical:historical-slot',goodieId:'leaf_pot',x:60,y:48,condition:'worn',uses:8,placedAt:NOW-1000}];
    historical.yard.goodieInventory.leaf_pot=2;
    historical.yard.activeVisitors=[];historical.yard.currencies.treats=1000;
    assert.equal(old.ensurePersistentPlayerYard(historical,{now:NOW}).status,200);
    const previous=structuredClone(historical),current=structuredClone(historical);
    const options={now:NOW,actionId:`yard-v2:historical-${action}`,actionPolicy:sourceCatalogActionPolicy};
    const oldResult=old.executePersistentYardAction(previous,action,payload,options);
    const newResult=executePersistentYardAction(current,action,payload,options);
    assert.equal(oldResult.status,200);assert.deepEqual(newResult,oldResult);assert.deepEqual(current,previous);
    const explicit=structuredClone(historical),raw=structuredClone(explicit);
    assert.equal(executePersistentYardAction(explicit,action,{...payload,...CANONICAL_LOCATION},options).error,'CANONICAL_NONCE_REQUIRED');assert.deepEqual(explicit,raw);
  }
  let p=canonicalFixture(),before=structuredClone(p),payload=canonicalPayload(),options={now:NOW,actionId:'yard-v2:canonical-v1/retry'};
  assert.equal(old.executePersistentYardAction(p,'yard.placeGoodie',payload,options).error,'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT');assert.deepEqual(p,before);
  assert.equal(executePersistentYardAction(p,'yard.placeGoodie',payload,{...options,canonicalItemPlacementEnabled:true}).status,200);
  p=JSON.parse(JSON.stringify(p));before=structuredClone(p);
  assert.equal(old.inspectPlayerYard(p,{now:NOW}).error,'UNSUPPORTED_YARD_STORAGE_VERSION');
  assert.equal(old.ensurePersistentPlayerYard(p,{now:NOW+86400000,simulate:true}).error,'UNSUPPORTED_YARD_STORAGE_VERSION');
  assert.equal(old.executePersistentYardAction(p,'yard.pickupGoodie',{goodieId:'leaf_pot'},{now:NOW,actionId:'yard-v2:old-retry'}).error,'UNSUPPORTED_YARD_STORAGE_VERSION');assert.deepEqual(p,before);
  assert.equal(executePersistentYardAction(p,'yard.placeGoodie',payload,{...options,canonicalItemPlacementEnabled:true}).replayed,true);assert.deepEqual(p,before);
  assert.equal(act(p,'yard.pickupGoodie',payload,'new-pickup').status,200);assert.equal(p.yard.goodieInventory.leaf_pot,2);
});
