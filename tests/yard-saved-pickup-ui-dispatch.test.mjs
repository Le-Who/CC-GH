import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
import {pathToFileURL} from 'node:url';

const source=await readFile(new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url),'utf8');
const action=source.match(/const act=(async\(action,payload=\{\}\)=>\{[\s\S]*?)\n  const startPlacement=/)[1].trim().replace(/;$/,'');
const pickup=source.match(/<button data-yard-action="pickup"[\s\S]*?<\/button>/)[0];
const scope={locationId:'canonical',locationVersion:1,geometryRevision:'food-v2'};

function fixture(allowed=true) {
  const owner={},snapshot={player:{id:'A'}},calls=[];
  const state={accountSession:owner,snapshot,pendingActions:[],performReliableAction:async(name,payload,options)=>{calls.push({name,payload,options});state.pendingActions.push({action:name,status:'pending'});return {success:true,pending:true};}};
  const context={useGameHub:{getState:()=>state},actionSession:owner,snapshot,savedMode:true,itemMode:true,itemMutable:false,current:{mutable:false},pipPreview:{},
    canonicalSavedPickupCommandAllowed:()=>allowed,canonicalSavedFoodCommandAllowed:()=>false,canonicalSavedInventoryCommandAllowed:()=>false,
    isCanonicalItemIntent:p=>p.locationId==='canonical',canonicalCommandScope:()=>scope,canonicalCapability:()=>false,canBuyGoodie:()=>false,
    canonicalNoncePrefix:()=> 'yard-v2:canonical:food-v2:',uuid:()=> 'one',scene:{current:{setCanonicalActionPending:()=>{}}},hasCanonicalIntent:()=>false,setError:()=>{},
    React:{createElement:(type,props,...children)=>({type,props,children})},busy:false,itemBlocked:true,blocked:true,chosen:{reserved:false},selected:{raw:{slotId:'canonical:one'}},t:key=>key};
  context.act=vm.runInNewContext(`(${action})`,context);
  const render=()=>{vm.runInNewContext(transformSync(`globalThis.button=(${pickup});`,{loader:'jsx'}).code,context);return context.button;};
  return {state,context,calls,render};
}

test('saved pickup is enabled only by the strict predicate and uses the existing durable canonical action',async()=>{
  const f=fixture();assert.equal(f.render().props.disabled,false);
  await f.render().props.onClick();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'yard.pickupGoodie');
  assert.equal(JSON.stringify(f.calls[0].payload),JSON.stringify({slotId:'canonical:one',...scope}));
  assert.equal(f.calls[0].options.durability,'outbox');
  assert.equal(f.calls[0].options.clientActionId,'yard-v2:canonical:food-v2:one');
  await f.context.act('yard.pickupGoodie',{slotId:'canonical:one',...scope});assert.equal(f.calls.length,1,'pending command blocks repeated pickup');
});

test('denied pickup, unfinished place/move and retired accounts cannot dispatch',async()=>{
  const denied=fixture(false);assert.equal(denied.render().props.disabled,true);
  await denied.context.act('yard.pickupGoodie',{slotId:'canonical:one',...scope});assert.equal(denied.calls.length,0);
  const f=fixture(true);
  for(const name of ['yard.placeGoodie','yard.moveGoodie'])await f.context.act(name,{slotId:'canonical:one',...scope});
  assert.equal(f.calls.length,0,'pickup permission cannot enable canonical placement');
  f.state.accountSession={};await f.context.act('yard.pickupGoodie',{slotId:'canonical:one',...scope});assert.equal(f.calls.length,0);
});

test('actual saved-scene predicate governs release-window UI and retains authoritative inventory until settlement',async()=>{
  // The override supports an isolated frontend patch tested against the exact
  // integration owner's source closure. The full repository needs no override.
  const root=process.env.YARD_PICKUP_PROTOCOL_ROOT?pathToFileURL(process.env.YARD_PICKUP_PROTOCOL_ROOT.replace(/\/$/,'')+'/'):new URL('../',import.meta.url);
  const {pickupSnapshot,pickupScene,RELEASE,LEAVES}=await import(new URL('tests/fixtures/saved-pickup-client-snapshot.mjs',root));
  const {canonicalSavedPickupCommandAllowed}=await import(new URL('src/games/companion-yard-v2/canonical-saved-pickup-actions.mjs',root));
  const {canonicalCommandScope,canonicalNoncePrefix,isCanonicalItemIntent,canonicalCapability}=await import(new URL('src/game-state/canonicalYardProtocol.mjs',root));
  for(const [options,hide,expected] of [[{},false,true],[{now:RELEASE-1},false,false],[{removed:true},false,false],[{now:LEAVES,removed:true,departed:true},false,false],[{},true,false]]){
    const f=fixture(),s=pickupSnapshot(options),current=pickupScene(s);
    if(hide)current.visualPrototype.pauseReasons=['hidden'];
    f.state.snapshot=s;
    Object.assign(f.context,{snapshot:s,current,pipPreview:current.visualPrototype,selected:{raw:{slotId:'canonical:a'}},canonicalSavedPickupCommandAllowed,canonicalCommandScope,canonicalNoncePrefix,isCanonicalItemIntent,canonicalCapability});
    const before=JSON.stringify(s),button=f.render();
    assert.equal(button.props.disabled,!expected);
    await button.props.onClick();
    assert.equal(f.calls.length,expected?1:0);
    assert.equal(JSON.stringify(s),before,'pending pickup must not remove an actor or grant inventory client-side');
    if(expected){assert.equal(f.calls[0].options.clientActionId,canonicalNoncePrefix(s)+'one');assert.equal(f.calls[0].payload.slotId,'canonical:a');}
  }
});
