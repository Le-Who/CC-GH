import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalYardPresentation,canonicalVisibleStatus} from '../src/games/companion-yard-v2/canonical-presentation.mjs';
import {canonicalItemCapabilities,CANONICAL_LOCATION,CANONICAL_ITEM} from '../game-logic/yard-v2/canonical-locations.mjs';
import {canonicalFoodCapabilities} from '../game-logic/yard-v2/canonical-food-protocol.mjs';
import {CANONICAL_VISIT_PRESENTATION_PROTOCOL} from '../game-logic/yard-v2/canonical-visit-placement-contract.mjs';

const placement=()=>({...CANONICAL_LOCATION,slotId:'canonical:real-item',goodieId:'leaf_pot',
  itemGeometryRevision:CANONICAL_ITEM.itemGeometryRevision,x:98,y:118,uses:0,condition:'new',placedAt:1});
function snapshot(){
  return {player:{id:'clean-projection'},serverTime:2000,yard:{
    currencies:{treats:37,shinyTreats:9},goodieInventory:{leaf_pot:2,yarn_mouse:1},foodInventory:{kibble:4},
    placedGoodies:[],activeVisitors:[],bowls:[{id:'bowl-1',foodId:'kibble',servings:3,placedAt:1,expiresAt:7200000}],
    pendingGifts:[{id:'real-gift',treats:7}],dailyLetter:{stamps:5,lastClaimedDate:'2026-10-01'},
    notes:[{id:'saved-note',text:'Keep this note'}],petbook:{pip_hamster:{visits:4}},mementos:{pip_hamster:{id:'saved-memento'}},album:{photos:[{id:'real-photo',visitorId:'pip_hamster'}]},
    futureSaveField:{untouched:true},
  },yardRuntime:{version:1,storageVersion:2,status:'ready',mutable:true,serverNow:1500,actionProtocol:'yard-v2:',
    canonicalPlacements:[placement()],visits:[],canonicalVisits:[],
    itemPlacementCapabilities:canonicalItemCapabilities({canonicalItemPlacementEnabled:true,canonicalFoodLocationEnabled:true}),
    foodLocationCapabilities:canonicalFoodCapabilities({canonicalFoodLocationEnabled:true}),
    supportedActions:['yard.buyFood','yard.collectGifts'],supportedBindings:{foods:{kibble:{buy:true,set:true}}},
  }};
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('clean view projects the actual wallet, stocks, saved notes and canonical coordinates without changing the snapshot',()=>{
  const input=freeze(snapshot()),before=JSON.stringify(input),view=canonicalYardPresentation(input);
  for(const key of ['currencies','goodieInventory','foodInventory','pendingGifts','notes','dailyLetter','petbook','mementos','album','bowls'])assert.deepEqual(view[key],input.yard[key],key);
  assert.deepEqual(view.yard.futureSaveField,input.yard.futureSaveField);
  assert.deepEqual(view.props,input.yardRuntime.canonicalPlacements);
  assert.notEqual(view.props,input.yardRuntime.canonicalPlacements);
  assert.equal(view.canonicalState.available,true);assert.equal(view.canonicalState.status,'ready');
  assert.equal(view.canonicalFood.available,true);assert.equal(view.canonicalFood.state,'kibble');
  assert.equal(view.now,1500);assert.equal(view.mutable,true);
  assert.equal(view.mediaReady,false);assert.equal(view.itemMutable,false);
  assert.deepEqual(view.capabilities.actions,input.yardRuntime.supportedActions);
  assert.deepEqual(view.capabilities.bindings,input.yardRuntime.supportedBindings);
  assert.deepEqual(view.capabilities.itemPlacement,input.yardRuntime.itemPlacementCapabilities);
  assert.equal(view.capabilities.itemPlacement.visitAdmission,false);
  assert.equal(view.capabilities.foodLocation.runtimeActivated,false);
  assert.equal(JSON.stringify(input),before);
});

test('old saved props and apparently render-compatible visits never turn into clean scene geometry or actors',()=>{
  const input=snapshot();
  input.yard.placedGoodies=[{slotId:'old-prop',goodieId:'yarn_mouse',x:50,y:50,condition:'new'}];
  input.yard.activeVisitors=[{visitId:'old-visit',visitorId:'mika_cat'}];
  input.yardRuntime.visits=[{visitId:'old-visit',visitorId:'mika_cat',slotId:'old-prop',renderCompatible:true,
    mediaAdmission:{plan:{schedule:{version:1},clipId:'old-sprite-clip'}}}];
  input.yardRuntime.display={placements:[{slotId:'old-prop',displayPlacement:{x:99,y:99}}],issues:[{code:'PRESERVED_ITEM'}]};
  const before=structuredClone(input),view=canonicalYardPresentation(freeze(input));
  assert.deepEqual(view.props,[placement()]);assert.deepEqual(view.pets,[]);assert.deepEqual(view.plans,{});
  assert.deepEqual(view.yard.placedGoodies,before.yard.placedGoodies);
  assert.deepEqual(view.runtime.visits,before.yardRuntime.visits);
  assert.deepEqual(view.issues,[{code:'PRESERVED_ITEM'}]);assert.deepEqual(input,before);
});

test('saved v3 data retains its own semantics and only the saved renderer can publish a visible visitor',()=>{
  const input=snapshot();Object.assign(input.yardRuntime,{storageVersion:3,canonicalVisitProtocol:CANONICAL_VISIT_PRESENTATION_PROTOCOL,mutable:false,
    itemPlacementCapabilities:canonicalItemCapabilities({canonicalFoodLocationEnabled:true}),
    canonicalVisits:[{visitId:'real-saved-pip',plan:{format:'yard-canonical-stay/v3'}}]});
  input.yardRuntime.canonicalPlacements[0].uses=1;
  const before=structuredClone(input),view=canonicalYardPresentation(freeze(input));
  assert.equal(view.canonicalSavedVisits,true);assert.equal(view.canonicalState.available,true);
  assert.equal(view.canonicalState.status,'read-only');assert.equal(view.mutable,false);assert.equal(view.itemMutable,false);
  assert.equal(view.canonicalFood.state,'kibble');assert.equal(view.props[0].uses,1);
  assert.deepEqual(view.pets,[]);assert.deepEqual(input,before);
});

test('server errors, pending reconciliation and future runtime or storage versions remain read-only and opaque',()=>{
  for(const patch of [
    {status:'review-required',error:'UNSUPPORTED_YARD_STORAGE_VERSION'},
    {status:'reconciliation-pending',error:'SOURCE_REPLAY_REQUIRED'},
    {version:2}, {storageVersion:999},
    {storageVersion:3,canonicalVisitProtocol:'yard-canonical-authoritative/v999'},
  ]){
    const input=snapshot();Object.assign(input.yardRuntime,patch);const before=structuredClone(input);
    const view=canonicalYardPresentation(freeze(input));
    assert.equal(view.mutable,false,JSON.stringify(patch));assert.equal(view.canonicalState.available,false);
    assert.deepEqual(view.props,[]);assert.deepEqual(view.pets,[]);assert.equal(view.canonicalFood.available,false);
    assert.equal(view.runtime.error,patch.error);assert.deepEqual(view.pendingGifts,input.yard.pendingGifts);
    assert.deepEqual(view.currencies,input.yard.currencies);assert.deepEqual(input,before);
  }
});

test('missing and malformed containers are safe to render without inventing data or writable state',()=>{
  const malformed=snapshot();Object.assign(malformed.yard,{bowls:[null,3],pendingGifts:{length:4},goodieInventory:[],petbook:{pip_hamster:null},album:{photos:[null]}});
  malformed.yardRuntime.canonicalPlacements=[null];
  for(const input of [null,undefined,{}, {yard:null,yardRuntime:null}, {yard:[],yardRuntime:[]},malformed]){
    const view=canonicalYardPresentation(input,NaN);
    assert.equal(view.mutable,false);assert.equal(view.canonicalState.available,false);assert.equal(view.itemMutable,false);
    assert.deepEqual(view.props,[]);assert.deepEqual(view.pets,[]);
    for(const key of ['bowls','pendingGifts','notes'])assert.ok(Array.isArray(view[key]));
    assert.ok(Array.isArray(view.album.photos));assert.ok(Object.values(view.petbook).every(value=>value&&typeof value==='object'));
    assert.equal(canonicalVisibleStatus(view),'yard.persistent.status.readOnly');
  }
  for(const field of ['visits','canonicalVisits','canonicalPlacements']){
    const input=snapshot();input.yardRuntime[field]=[null];
    assert.equal(canonicalYardPresentation(input).mutable,false,field);
  }
});

test('time and status come from current data; opening a view does not create an empty bowl or a visitor',()=>{
  const input=snapshot();input.yardRuntime.serverNow=0;
  assert.equal(canonicalYardPresentation(input).now,0);
  assert.equal(canonicalYardPresentation(input,17).now,17);
  const view=canonicalYardPresentation(input),calls=[];
  const t=(key,values)=>{calls.push({key,values});return key;};
  assert.equal(canonicalVisibleStatus(view,t),'yard.persistent.status.gifts');assert.equal(calls[0].values.count,1);
  input.yard.pendingGifts=[];assert.equal(canonicalVisibleStatus(canonicalYardPresentation(input)),'yard.persistent.status.food');
  input.yard.bowls=[];const empty=canonicalYardPresentation(input);
  assert.equal(empty.canonicalFood.available,false);assert.equal(canonicalVisibleStatus(empty),'yard.persistent.status.empty');
});

test('missing or unknown command protocols cannot inherit general mutation permission',()=>{
  for(const actionProtocol of [undefined,null,'yard-v999:']){
    const input=snapshot();input.yardRuntime.actionProtocol=actionProtocol;
    const view=canonicalYardPresentation(input);
    assert.equal(view.mutable,false);assert.equal(view.itemMutable,false);
    assert.equal(view.canonicalState.status,'read-only');
    assert.deepEqual(view.props,input.yardRuntime.canonicalPlacements);
  }
});

test('clean projection dependency closure and scene adapter cannot load old Yard rendering contracts',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),entry=path.join(root,'src/games/companion-yard-v2/canonical-presentation.mjs'),seen=new Set();
  function visit(filename){
    if(seen.has(filename))return;seen.add(filename);
    const source=fs.readFileSync(filename,'utf8');
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g)){
      const target=path.resolve(path.dirname(filename),match[1]);if(!target.endsWith('.json'))visit(target);
    }
  }
  visit(entry);
  for(const filename of seen)assert.doesNotMatch(path.relative(root,filename),/(?:mika-media|mika-clips|released-prop-profiles|actor-media|legacy|atlas|stay-schedule)\./);
  const scene=fs.readFileSync(path.join(root,'src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs'),'utf8');
  assert.doesNotMatch(scene,/courtyardPresentation|MIKA_CLIPS|from\s*['"]\.\.\/presentation\.mjs/);
  assert.match(scene,/canonicalYardPresentation\(snapshot\)/);
});
