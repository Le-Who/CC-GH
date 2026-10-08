import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDefaultYardState} from '../game-logic/yard.js';
import {ensurePersistentPlayerYard,executePersistentYardAction,publicPersistentYard,inspectPlayerYard} from '../game-logic/yard-v2/service.mjs';
import {applyYardAction} from '../game-logic/yard-v2/actions.mjs';
import {CANONICAL_LOCATION} from '../game-logic/yard-v2/canonical-locations.mjs';
import {bindAuthoritativeMikaCheckpoint,MIKA_NATIVE_CHECKPOINT_ACTION} from '../game-logic/yard-v2/mika-native-checkpoint.mjs';
import {MIKA_NATIVE_SETTLED_SOURCE_HASH,MIKA_NATIVE_RECIPE_MAX_CHARS,createMikaNativeActionRecipe,reconstructMikaNativeSettled} from '../game-logic/yard-v2/mika-native-settled-recipe.mjs';
import {planMikaItemArrival,planMikaItemContinuation} from '../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {sampleMikaYardQaCruise} from '../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type:'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type:'json'};
import {digest} from '../game-logic/yard-v2/util.mjs';

const T=1800000000000,A=MIKA_NATIVE_CHECKPOINT_ACTION;
const options={now:T+7200000,nativeMikaCheckpointEnabled:true,
  advance(){assert.fail('Checkpoint commands must never invoke the economic advance seam');},
  actionPolicy(){assert.fail('Checkpoint commands must not invoke ordinary action policy');}};
let cached;
function fixture(){
  if(!cached){
    const player={id:'native-checkpoint-account',schemaVersion:11,resources:{gold:123},
      yard:createDefaultYardState(T),unrelated:{retain:'exactly'}};
    player.yard.placedGoodies=[{slotId:'first',goodieId:'yarn_mouse',x:60,y:45,condition:'new',uses:0,placedAt:T},
      {slotId:'second',goodieId:'yarn_mouse',x:88,y:62,condition:'new',uses:0,placedAt:T}];
    assert.equal(ensurePersistentPlayerYard(player,{now:T}).status,200);
    const bound=bindAuthoritativeMikaCheckpoint(inspectPlayerYard(player,{now:T}).state);
    assert.equal(bound.ok,true,bound.reason);
    const candidate=planMikaItemArrival(bound,calibration,envelope,{targetSlotId:'first'});
    assert.equal(candidate.ok,true,candidate.reason);
    const recipe=createMikaNativeActionRecipe(candidate.plan,bound,'first');
    assert.equal(recipe.ok,true,recipe.reason);
    const payload={version:1,accountId:player.id,layoutHash:digest(bound.key),sourceHash:MIKA_NATIVE_SETTLED_SOURCE_HASH,
      priorRevision:0,recipeJson:recipe.recipeJson};
    cached={player,payload,bound,sample:sampleMikaYardQaCruise(candidate.plan,bound.binding.layout,candidate.plan.duration).sample};
  }
  return structuredClone(cached);
}
const run=(player,payload,id='save-first',extra={})=>executePersistentYardAction(player,A,payload,{...options,actionId:'yard-v2:'+id,...extra});
function economicSnapshot(player){
  const copy=structuredClone(player);delete copy._yardV2.runtime.commandReceipts;delete copy._yardV2.runtime.nativeMikaCheckpoint;
  return copy;
}
function savedFixture(){const f=fixture(),result=run(f.player,f.payload);assert.equal(result.status,200,result.error);return{...f,result};}

// The positive fixture is a real admitted finite arrival, not fabricated poses.
test('server checkpoint defaults closed and neither payload flags nor failed commands advance economic state',()=>{
  const {player,payload}=fixture(),before=economicSnapshot(player);
  const result=run(player,payload,'closed',{nativeMikaCheckpointEnabled:false});
  assert.equal(result.error,'NATIVE_MIKA_CHECKPOINT_DISABLED');assert(result.receipt);
  assert.equal(player._yardV2.runtime.nativeMikaCheckpoint,undefined);assert.deepEqual(economicSnapshot(player),before);
  const injected=run(player,{...payload,nativeMikaCheckpointEnabled:true},'injected');
  assert.equal(injected.error,'INVALID_NATIVE_MIKA_CHECKPOINT_PAYLOAD');assert.deepEqual(economicSnapshot(player),before);
  assert.equal(publicPersistentYard(player,{now:T,nativeMikaCheckpointEnabled:false}).nativeMikaCheckpointCapabilities.enabled,false);
});

test('one finite terminal endpoint and receipt commit together without visits, economics, or arbitrary pose data',()=>{
  const {player,payload,bound,sample}=fixture(),before=economicSnapshot(player);
  const result=run(player,payload),saved=player._yardV2.runtime.nativeMikaCheckpoint;
  assert.equal(result.status,200,result.error);assert.equal(saved.version,1);assert.equal(saved.revision,1);
  assert.equal(saved.actionId,'yard-v2:save-first');assert.equal(saved.savedAt,options.now);
  assert.deepEqual(result.extras.nativeMikaCheckpoint,saved);
  assert.deepEqual(player._yardV2.runtime.commandReceipts[saved.actionId],result.receipt);
  assert.deepEqual(economicSnapshot(player),before);assert.equal(player._yardV2.runtime.cursorMs,T);
  assert.deepEqual(player.yard.activeVisitors,[]);assert.deepEqual(player._yardV2.runtime.visits,{});
  assert(saved.checkpointJson.length<=MIKA_NATIVE_RECIPE_MAX_CHARS);
  const restored=reconstructMikaNativeSettled(saved.checkpointJson,bound);assert.equal(restored.ok,true,restored.reason);
  assert.deepEqual(restored.sample,sample);
  const reload=JSON.parse(JSON.stringify(player)),publicState=publicPersistentYard(reload,{now:options.now,nativeMikaCheckpointEnabled:true});
  assert.equal(publicState.nativeMikaCheckpointCapabilities.status,'ready');assert.equal(publicState.nativeMikaCheckpointCapabilities.priorRevision,1);
  assert.deepEqual(publicState.nativeMikaCheckpoint,saved);
  assert(!Object.hasOwn(publicState,'commandReceipts'));assert(!Object.hasOwn(publicState,'migration'));
});

test('exact nonce replay precedes changed options, source or prior record; changed payload conflicts without effects',()=>{
  const {player,payload,result}=savedFixture();
  player._yardV2.runtime.nativeMikaCheckpoint={future:100};const before=structuredClone(player);
  const replay=run(player,payload,'save-first',{nativeMikaCheckpointEnabled:false,now:options.now+1000000});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);assert.deepEqual(player,before);
  const changed=run(player,{...payload,priorRevision:1});assert.equal(changed.error,'ACTION_ID_PAYLOAD_CONFLICT');assert.deepEqual(player,before);
});

test('account, source, layout and prior revision fences refuse fresh commands without economic effects',()=>{
  for(const [key,value,error] of [['accountId','another-account','NATIVE_MIKA_ACCOUNT_CHANGED'],
    ['sourceHash','0'.repeat(64),'NATIVE_MIKA_SOURCE_CHANGED'],['layoutHash','0'.repeat(64),'NATIVE_MIKA_LAYOUT_CHANGED'],
    ['priorRevision',1,'NATIVE_MIKA_CHECKPOINT_REVISION_CONFLICT']]){
    const {player,payload}=fixture(),before=economicSnapshot(player),result=run(player,{...payload,[key]:value},'fence-'+key);
    assert.equal(result.error,error);assert.deepEqual(economicSnapshot(player),before);assert.equal(player._yardV2.runtime.nativeMikaCheckpoint,undefined);
  }
  const {player,payload}=fixture();player.id='different-owner';const before=economicSnapshot(player);
  assert.equal(run(player,payload,'different-owner').error,'NATIVE_MIKA_ACCOUNT_CHANGED');assert.deepEqual(economicSnapshot(player),before);
});

test('arbitrary state/pose fields, oversized or malformed recipes and reserved nonce scope cannot become checkpoints',()=>{
  for(const recipeJson of ['null','{}','{"root":{"position":[0,0,0]},"boneMatrices":{}}','x'.repeat(MIKA_NATIVE_RECIPE_MAX_CHARS+1)]){
    const {player,payload}=fixture(),before=economicSnapshot(player);
    assert.notEqual(run(player,{...payload,recipeJson},'bad-recipe').status,200);assert.deepEqual(economicSnapshot(player),before);
    assert.equal(player._yardV2.runtime.nativeMikaCheckpoint,undefined);
  }
  const {player,payload}=fixture(),before=structuredClone(player);
  const result=run(player,payload,'ignored',{actionId:'yard-v2:canonical-v1/foreign'});
  assert.equal(result.error,'NATIVE_MIKA_NONCE_SCOPE_MISMATCH');assert.deepEqual(player,before);
  assert.notEqual(run(player,{...payload,root:{position:[1,2,0]}},'root').status,200);
});

test('present malformed/future/stale checkpoints stay preserved and blocked, never bootstrap as absent',()=>{
  const saved=savedFixture().player._yardV2.runtime.nativeMikaCheckpoint;
  const invalid=[null,{}, {...saved,version:2}, {...saved,revision:0}, {...saved,extra:'future'},
    {...saved,accountId:'foreign'}, {...saved,sourceHash:'0'.repeat(64)}, {...saved,layoutHash:'0'.repeat(64)},
    {...saved,checkpointJson:'{}'}, {...saved,checkpointJson:'x'.repeat(MIKA_NATIVE_RECIPE_MAX_CHARS+1)}];
  for(const record of invalid){
    const {player,payload}=fixture();player._yardV2.runtime.nativeMikaCheckpoint=structuredClone(record);
    const before=economicSnapshot(player),recordBytes=JSON.stringify(record);
    const projection=publicPersistentYard(player,{now:T,nativeMikaCheckpointEnabled:true});
    assert.equal(projection.nativeMikaCheckpointCapabilities.status,'blocked');assert.equal(projection.nativeMikaCheckpointCapabilities.hasCheckpoint,true);
    assert.equal(projection.nativeMikaCheckpoint,null);
    assert.notEqual(run(player,payload,'invalid-existing').status,200);
    assert.equal(JSON.stringify(player._yardV2.runtime.nativeMikaCheckpoint),recordBytes);assert.deepEqual(economicSnapshot(player),before);
  }
});

test('real visitors and canonical v3 storage cannot be checkpointed or economically advanced',()=>{
  const {player,payload}=fixture(),visit={visitId:'real-visit',visitorId:'mika_cat',goodieId:'yarn_mouse',slotId:'first',
    arrivedAt:T-1000,leavesAt:T+2000,activityId:'sniff'};
  player.yard.activeVisitors.push(visit);player._yardV2.runtime.visits[visit.visitId]={source:'legacy',original:structuredClone(visit),
    visitId:visit.visitId,slotId:visit.slotId,arrivedAt:visit.arrivedAt,leavesAt:visit.leavesAt,releaseAt:T+1000,status:'active',timeline:null,route:null};
  const before=economicSnapshot(player);assert.equal(run(player,payload,'real-visitor').error,'NATIVE_ITEM_RUNTIME_UNSUPPORTED');assert.deepEqual(economicSnapshot(player),before);
  const old=fixture();old.player._yardV2.version=3;const v3=structuredClone(old.player);
  assert.equal(run(old.player,old.payload,'v3').error,'NATIVE_MIKA_STORAGE_VERSION_UNSUPPORTED');assert.deepEqual(old.player,v3);
});

test('normal mutation and ensure/clone/save paths retain even unknown optional checkpoint records',()=>{
  for(const checkpoint of [savedFixture().player._yardV2.runtime.nativeMikaCheckpoint,{version:200,future:{preserve:['all','fields']}}]){
    const {player}=fixture();player._yardV2.runtime.nativeMikaCheckpoint=structuredClone(checkpoint);
    const changed=executePersistentYardAction(player,'yard.configureCompanion',{name:'Checkpoint keeper'},
      {now:T,actionId:'yard-v2:ordinary',nativeMikaCheckpointEnabled:true});
    assert.equal(changed.status,200,changed.error);assert.deepEqual(player._yardV2.runtime.nativeMikaCheckpoint,checkpoint);
    assert.equal(ensurePersistentPlayerYard(player,{now:T+3600000,simulate:true}).status,200);
    assert.deepEqual(player._yardV2.runtime.nativeMikaCheckpoint,checkpoint);
    const reloaded=JSON.parse(JSON.stringify(player));assert.equal(ensurePersistentPlayerYard(reloaded,{now:T+3600000}).status,200);
    assert.deepEqual(reloaded._yardV2.runtime.nativeMikaCheckpoint,checkpoint);
    assert.deepEqual(reloaded.resources,{gold:123});assert.deepEqual(reloaded.unrelated,{retain:'exactly'});
  }
});

test('fresh layout changes preserve the old checkpoint and prevent stale restore/replacement',()=>{
  const {player,payload}=savedFixture(),record=structuredClone(player._yardV2.runtime.nativeMikaCheckpoint);
  const move=executePersistentYardAction(player,'yard.moveGoodie',{slotId:'second',x:87,y:62},{now:T,actionId:'yard-v2:move-item'});
  assert.equal(move.status,200,move.error);assert.deepEqual(player._yardV2.runtime.nativeMikaCheckpoint,record);
  const projection=publicPersistentYard(player,{now:T,nativeMikaCheckpointEnabled:true});
  assert.equal(projection.nativeMikaCheckpointCapabilities.blockedReason,'NATIVE_MIKA_LAYOUT_CHANGED');assert.equal(projection.nativeMikaCheckpoint,null);
  const before=economicSnapshot(player);assert.equal(run(player,{...payload,priorRevision:1},'stale-layout').error,'NATIVE_MIKA_LAYOUT_CHANGED');assert.deepEqual(economicSnapshot(player),before);
});

test('a continuation uses the previous server checkpoint and atomically advances its revision only once',()=>{
  const {player,bound,sample}=savedFixture();
  const next=planMikaItemContinuation(bound,calibration,envelope,sample,'second');assert.equal(next.ok,true,next.reason);
  const recipe=createMikaNativeActionRecipe(next.plan,bound,'second');assert.equal(recipe.ok,true,recipe.reason);
  const payload={version:1,accountId:player.id,layoutHash:digest(bound.key),sourceHash:MIKA_NATIVE_SETTLED_SOURCE_HASH,
    priorRevision:1,recipeJson:recipe.recipeJson};
  const before=economicSnapshot(player),result=run(player,payload,'save-second');assert.equal(result.status,200,result.error);
  assert.equal(player._yardV2.runtime.nativeMikaCheckpoint.revision,2);assert.deepEqual(economicSnapshot(player),before);
  const terminal=sampleMikaYardQaCruise(next.plan,bound.binding.layout,next.plan.duration).sample;
  const restored=reconstructMikaNativeSettled(player._yardV2.runtime.nativeMikaCheckpoint.checkpointJson,bound);
  assert.equal(restored.ok,true,restored.reason);assert.deepEqual(restored.sample,terminal);
  assert.equal(run(player,payload,'save-second').replayed,true);
  assert.equal(run(player,payload,'concurrent-old-revision').error,'NATIVE_MIKA_CHECKPOINT_REVISION_CONFLICT');
  const missing=fixture();assert.notEqual(run(missing.player,{...payload,priorRevision:0},'missing-prior').status,200);
});

test('old snapshots without optional checkpoint keep their normal storage version and absent projection',()=>{
  for(const version of [1,2]){
    const {player}=fixture();player._yardV2.version=version;if(version===2)player._yardV2.runtime.canonicalPlacements=[];
    const before=structuredClone(player),projection=publicPersistentYard(player,{now:T,nativeMikaCheckpointEnabled:true});
    assert.equal(projection.status,'ready');assert.equal(projection.nativeMikaCheckpointCapabilities.status,'absent');
    assert.equal(projection.nativeMikaCheckpointCapabilities.priorRevision,0);assert.deepEqual(player,before);
    assert.equal(ensurePersistentPlayerYard(player,{now:T}).status,200);assert.equal(player._yardV2.version,version);
    assert.equal(Object.hasOwn(player._yardV2.runtime,'nativeMikaCheckpoint'),false);
  }
});

test('default server gate is explicit and the native action branches before ordinary advancement',async()=>{
  const service=await readFile(new URL('../game-logic/yard-v2/service.mjs',import.meta.url),'utf8');
  assert.match(service,/YARD_NATIVE_MIKA_CHECKPOINT_QA==='true'/);
  const actions=await readFile(new URL('../game-logic/yard-v2/actions.mjs',import.meta.url),'utf8');
  assert(actions.indexOf('if(action===MIKA_NATIVE_CHECKPOINT_ACTION)')<actions.indexOf('(options.advance||advancePersistentYard)'));
  const {player,payload}=fixture(),input=inspectPlayerYard(player,{now:T}).state;
  const result=applyYardAction(input,A,payload,{...options,actionId:'yard-v2:direct'});
  assert.equal(result.status,200,result.error);assert.equal(input.runtime.nativeMikaCheckpoint,undefined);
});


test('every ordinary action and canonical item receipt preserves the optional record',()=>{
  const cases=[['yard.buyFood',{foodId:'kibble'}],['yard.setFood',{foodId:'kibble'}],
    ['yard.buyGoodie',{goodieId:'yarn_mouse'}],['yard.placeGoodie',{goodieId:'yarn_mouse',slotId:'third',x:45,y:65}],
    ['yard.moveGoodie',{slotId:'second',x:87,y:62}],['yard.pickupGoodie',{slotId:'second'}],
    ['yard.fixGoodie',{slotId:'first'}],['yard.collectGifts',{}],['yard.capturePhoto',{visitorId:'mika_cat'}],
    ['yard.favoritePhoto',{photoId:'saved-photo'}],['yard.setRemodel',{remodelId:'meadow'}],
    ['yard.buyExpansion',{}],['yard.claimDailyLetter',{}],['yard.configureCompanion',{name:'Kept'}]];
  const checkpoint={version:222,preserved:{future:['untouched']}};
  for(const [action,payload]of cases){
    const {player}=fixture();player._yardV2.runtime.nativeMikaCheckpoint=structuredClone(checkpoint);
    player.yard.currencies.treats=5000;player.yard.foodInventory.kibble=5;player.yard.goodieInventory.yarn_mouse=5;
    player.yard.album.photos=[{id:'saved-photo',visitorId:'mika_cat'}];player.yard.petbook.mika_cat={visits:1};
    const result=executePersistentYardAction(player,action,payload,{now:T,actionId:'yard-v2:preserve-'+action});
    assert(result.receipt,action+': '+result.error);assert.deepEqual(player._yardV2.runtime.nativeMikaCheckpoint,checkpoint,action);
  }
  const {player}=fixture();player._yardV2.runtime.nativeMikaCheckpoint=structuredClone(checkpoint);
  const result=executePersistentYardAction(player,'yard.pickupGoodie',{...CANONICAL_LOCATION,slotId:'canonical:missing'},
    {now:T,actionId:'yard-v2:canonical-v1/preserve',canonicalItemPlacementEnabled:true});
  assert(result.receipt,result.error);assert.deepEqual(player._yardV2.runtime.nativeMikaCheckpoint,checkpoint);
});

test('revision exhaustion preserves the last checkpoint and returns a durable refusal',()=>{
  const {player,payload}=savedFixture();player._yardV2.runtime.nativeMikaCheckpoint.revision=Number.MAX_SAFE_INTEGER;
  const record=structuredClone(player._yardV2.runtime.nativeMikaCheckpoint),before=economicSnapshot(player);
  const result=run(player,{...payload,priorRevision:Number.MAX_SAFE_INTEGER},'exhausted');
  assert.equal(result.error,'NATIVE_MIKA_CHECKPOINT_REVISION_EXHAUSTED');assert(result.receipt);
  assert.deepEqual(player._yardV2.runtime.nativeMikaCheckpoint,record);assert.deepEqual(economicSnapshot(player),before);
});

test('only the explicit server environment gate enables the default service entry point',()=>{
  const old=process.env.YARD_NATIVE_MIKA_CHECKPOINT_QA;
  try{
    for(const gate of [undefined,'1','false','true']){
      if(gate===undefined)delete process.env.YARD_NATIVE_MIKA_CHECKPOINT_QA;else process.env.YARD_NATIVE_MIKA_CHECKPOINT_QA=gate;
      const {player,payload}=fixture(),before=economicSnapshot(player);
      const result=executePersistentYardAction(player,A,payload,{now:options.now,actionId:'yard-v2:environment'});
      assert.equal(result.status,gate==='true'?200:409,result.error);assert.deepEqual(economicSnapshot(player),before);
      const projection=publicPersistentYard(player,{now:options.now});
      assert.equal(projection.nativeMikaCheckpointCapabilities.enabled,gate==='true');
    }
  }finally{if(old===undefined)delete process.env.YARD_NATIVE_MIKA_CHECKPOINT_QA;else process.env.YARD_NATIVE_MIKA_CHECKPOINT_QA=old;}
});
