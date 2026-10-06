/** Execute the shipped component's event handlers with a small hook/tree adapter.
 * No browser, layout, WebGL or visual acceptance is claimed by these tests. */
import {selectCanonicalFoodState} from '../game-logic/yard-v2/canonical-food-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {createDefaultPlayer} from '../game-logic/player.js';
import {ensurePersistentPlayerYard,publicPersistentYard,executePersistentYardAction} from '../game-logic/yard-v2/service.mjs';
import {courtyardPresentation} from '../src/games/companion-yard-v2/presentation.mjs';
import {MIKA_CLIPS} from '../game-logic/yard-v2/media/mika-clips.mjs';
import {checkCanonicalPlacement} from '../src/game-state/canonicalYardItems.mjs';
import {NOW} from './helpers/yard-canonical-item-fixture.mjs';
const componentURL=new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url).href;
const adapters={
 react:`const h=()=>globalThis.__yardAcquisitionUI;export const useState=v=>h().useState(v),useRef=v=>h().useRef(v),useEffect=(f,d)=>h().useEffect(f,d),useCallback=f=>f;export default {createContext:()=>({Provider:'provider'}),createElement:(type,props,...children)=>h().element(type,props,children),useContext:()=>null};`,
 hub:`export const useGameHub=s=>s(globalThis.__yardAcquisitionUI.state);useGameHub.getState=()=>globalThis.__yardAcquisitionUI.state;`,
 i18n:`export const useAppI18n=()=>({language:'en',t:(key,args)=>key+(args?' '+JSON.stringify(args):'')});export const playerFeedbackText=(language,code)=>code;`,
 hud:`export const HudRegion='hud-region';`,
 scene:`export const createCourtyardScene=(canvas,options)=>globalThis.__yardAcquisitionUI.scene(options);`,
 dismiss:`export const useEscapeDismiss=()=>{};`,
 empty:'export {};',
};
registerHooks({
 resolve(specifier,context,next){
  if(context.parentURL===componentURL){
   const key=specifier==='react'?'react':specifier.endsWith('/useGameHub.js')?'hub':specifier.endsWith('/i18n.jsx')?'i18n':specifier.endsWith('/hud-layout/index.js')?'hud':specifier==='./scene-entry.mjs'?'scene':specifier.endsWith('/useDismissableLayer.js')?'dismiss':specifier.endsWith('.css')||specifier==='./i18n.js'?'empty':null;
   if(key)return{shortCircuit:true,url:'yard-acquisition-ui:'+key};
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.startsWith('yard-acquisition-ui:'))return{shortCircuit:true,format:'module',source:adapters[url.slice('yard-acquisition-ui:'.length)]};
  if(url===componentURL)return{shortCircuit:true,format:'module',source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'jsx',format:'esm'}).code};
  return next(url,context);
 }
});
const {default:CourtyardGame}=await import(componentURL);
function nodes(root){return Array.isArray(root)?root.flatMap(nodes):root&&typeof root==='object'?[root,...nodes(root.props?.children)]:[];}
function snapshot({treats=140,enabled=true,foodEnabled=true}={}){
 const p=createDefaultPlayer('acquisition-owner','Owner',NOW);ensurePersistentPlayerYard(p,{now:NOW});p.yard.currencies.treats=treats;
 return{player:{id:p.id,syncSeq:0},serverTime:NOW,yard:structuredClone(p.yard),yardRuntime:publicPersistentYard(p,{now:NOW,canonicalItemPlacementEnabled:enabled,canonicalFoodLocationEnabled:foodEnabled})};
}
function setup(t,snap=snapshot(),{canonical=true,ready=true,foodPreview=true,foodReady=true,foodLoading=false,reentryRequired=false}={}){
 t.mock.timers.enable({apis:['setInterval']});
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
 const slots=[],effects=[],pendingEffects=[],sent=[],reentries=[];let cursor=0,effectCursor=0,options,tree;
 const harness={state:{snapshot:snap,accountSession:{},pendingActions:[],message:'',outboxStorageError:null,setActiveGameShell(){},loadSnapshot(){},performReliableAction:async(action,payload,opts)=>{
  sent.push({action,payload,options:opts});harness.state.pendingActions.push({accountId:harness.state.snapshot.player.id,action,payload,clientActionId:opts.clientActionId,status:'pending'});return{success:true,pending:true};
 }},
 useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
 useRef(initial){const index=cursor++;return slots[index]??=( {current:initial} );},
 useEffect(fn,deps){const index=effectCursor++,prior=effects[index];if(!prior||!deps||deps.some((d,i)=>d!==prior.deps[i]))pendingEffects.push(()=>{prior?.cleanup?.();effects[index]={deps,cleanup:fn()};});},
 element(type,props,children){if(props?.ref&&!props.ref.current)props.ref.current={open:false,focus(){},showModal(){this.open=true;},close(){this.open=false;}};return{type,props:{...props,children}};},
 scene(o){options=o;return{setCanonicalItemsEnabled:v=>reentries.push(v),update(){},dispose(){},setCanonicalActionPending(){},setGhost(){},endPointer(){},defaultItemAnchor(){return{x:98,y:118};},checkPlacement(ghost){return checkCanonicalPlacement(harness.state.snapshot,ghost);}};},
 render(){cursor=0;effectCursor=0;tree=CourtyardGame({allowPipPrototype:true,allowCanonicalFoodPreview:foodPreview});for(const effect of pendingEffects.splice(0))effect();return tree;},
 find(attribute,value){return nodes(tree).find(n=>n.props?.[attribute]===value);},
 publish({canonical:mode=canonical,ready:media=ready}={}){options.onView({...courtyardPresentation(harness.state.snapshot,NOW,MIKA_CLIPS),mutable:mode?false:media&&harness.state.snapshot.yardRuntime.mutable,canonicalItems:mode,canonicalFood:{...selectCanonicalFoodState(harness.state.snapshot),loading:foodLoading,reentryRequired,render:foodReady?selectCanonicalFoodState(harness.state.snapshot):{available:false,state:null,reason:'CANONICAL_FOOD_UNAVAILABLE'}},mediaReady:media});harness.render();},
 shop(){harness.find('data-nav-item','decor').props.onClick();harness.render();harness.find('data-decor-tab','shop').props.onClick();harness.render();return harness.find('data-yard-action','buy-goodie');},
 sent,reentries,
 };
 globalThis.__yardAcquisitionUI=harness;harness.render();harness.publish();
 t.after(()=>{for(const effect of effects)effect?.cleanup?.();delete globalThis.__yardAcquisitionUI;delete globalThis.window;delete globalThis.document;});
 return harness;
}

const openFood=ui=>{ui.find('data-nav-item','food').props.onClick();ui.render();return ui.find('data-yard-action','set-food');};
test('canonical Food fills only the existing first bowl with the ordinary durable command',async t=>{
 const snap=snapshot();snap.yard.foodInventory.kibble=3;const ui=setup(t,snap),fill=openFood(ui),before=JSON.stringify(ui.state.snapshot.yard);
 assert.equal(fill.props['data-bowl-id'],'bowl-1');assert.equal(fill.props.disabled,false);await fill.props.onClick();await fill.props.onClick();
 assert.equal(ui.sent.length,1);assert.equal(ui.sent[0].action,'yard.setFood');assert.deepEqual(ui.sent[0].payload,{bowlId:'bowl-1',foodId:'kibble'});assert.match(ui.sent[0].options.clientActionId,/^yard-v2:[a-f0-9-]+$/);assert.equal(ui.sent[0].options.durability,'outbox');assert.equal(JSON.stringify(ui.state.snapshot.yard),before);
});
for(const [label,options,change]of[
 ['preview off',{foodPreview:false},()=>{}],['old server',{},s=>s.yardRuntime.foodLocationCapabilities.enabled=false],['missing media',{ready:false},()=>{}],['second bowl only',{},s=>s.yard.bowls=[{id:'bowl-2',foodId:null,servings:0}]],
])test(`canonical Food stays closed for ${label}`,async t=>{
 const snap=snapshot();snap.yard.foodInventory.kibble=3;change(snap);const ui=setup(t,snap,options),fill=openFood(ui);assert.equal(fill.props.disabled,true);await fill.props.onClick();assert.equal(ui.sent.length,0);
});
test('stale Food handler cannot write after session A-B-A or capability loss',async t=>{
 const snap=snapshot();snap.yard.foodInventory.kibble=3;const ui=setup(t,snap),fill=openFood(ui);ui.state.accountSession={};await fill.props.onClick();assert.equal(ui.sent.length,0);
 ui.render();const next=openFood(ui);ui.state.snapshot.yardRuntime.foodLocationCapabilities.enabled=false;await next.props.onClick();assert.equal(ui.sent.length,0);
});
test('occupied socket explains slot and resolution in existing dialogs without a new stage region',t=>{
 const snap=snapshot();snap.yardRuntime.canonicalPlacements=[{locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',slotId:'canonical:old-pot',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:82,condition:'new',uses:0,placedAt:NOW}];
 const ui=setup(t,snap);openFood(ui);const notice=ui.find('data-canonical-food-status','true');assert.match(JSON.stringify(notice),/yard.canonical.food.occupied/);assert.match(JSON.stringify(notice),/canonical:old-pot/);assert.equal(ui.find('data-yard-action','set-food').props.disabled,true);
 const status=ui.find('id','yardVisitStatus');assert.match(JSON.stringify(status.props['aria-label']),/canonical:old-pot/);assert.match(JSON.stringify(status.props.children),/occupiedShort/);
 ui.find('data-nav-item','decor').props.onClick();ui.render();assert.match(JSON.stringify(ui.find('data-canonical-food-conflict','true')),/canonical:old-pot/);
});
test('canonical Food shop keeps the ordinary stock purchase, cost and outbox contract',async t=>{
 const ui=setup(t);openFood(ui);const buy=nodes(ui.render()).find(n=>n.props?.['data-yard-action']==='buy-food'&&n.props?.['data-food-id']==='kibble');assert.equal(buy.props.disabled,false);await buy.props.onClick();await buy.props.onClick();assert.equal(ui.sent.length,1);assert.equal(ui.sent[0].action,'yard.buyFood');assert.deepEqual(ui.sent[0].payload,{foodId:'kibble',qty:1});assert.match(ui.sent[0].options.clientActionId,/^yard-v2:[a-f0-9-]+$/);assert.equal(ui.sent[0].options.durability,'outbox');
});
test('occupied slot move and pickup stay enabled while Food is unavailable',t=>{
 const snap=snapshot();snap.yardRuntime.canonicalPlacements=[{locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',slotId:'canonical:old-pot',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:82,condition:'new',uses:0,placedAt:NOW}];
 const ui=setup(t,snap);ui.find('data-nav-item','decor').props.onClick();ui.render();const buttons=nodes(ui.render()).filter(n=>n.type==='button');
 const pickup=buttons.find(n=>n.props['data-yard-action']==='pickup');
 const move=buttons.find(n=>n.props['data-yard-action']==='move');
 assert.ok(pickup);assert.equal(pickup.props.disabled,false);assert.ok(move);assert.equal(move.props.disabled,false);
});
for(const foodLoading of[true,false])test(`actual bowl ${foodLoading?'loading':'asset failure'} disables food actions and explains the unavailable art`,async t=>{
 const snap=snapshot();snap.yard.foodInventory.kibble=3;const ui=setup(t,snap,{foodReady:false,foodLoading}),fill=openFood(ui);assert.equal(fill.props.disabled,true);await fill.props.onClick();assert.equal(ui.sent.length,0);
 assert.match(JSON.stringify(ui.find('data-canonical-food-status','true')),foodLoading?/yard.canonical.food.loading/:/yard.canonical.food.unavailable/);const buy=nodes(ui.render()).find(n=>n.props?.['data-yard-action']==='buy-food');assert.equal(buy.props.disabled,true);await buy.props.onClick();assert.equal(ui.sent.length,0);
});
test('food version boundary explains explicit re-entry in the existing control slot',async t=>{
 const ui=setup(t,snapshot(),{reentryRequired:true});assert.equal(ui.find('data-pip-control','inventory'),undefined);const reenter=ui.find('data-pip-control','reenter-food');assert.ok(reenter);const status=ui.find('id','yardVisitStatus');assert.match(JSON.stringify(status.props.children),/reentryShort/);assert.match(status.props['aria-label'],/yard.canonical.food.reentry/);
 const fill=openFood(ui);assert.equal(fill.props.disabled,true);await fill.props.onClick();assert.equal(ui.sent.length,0);reenter.props.onClick();assert.deepEqual(ui.reentries,[true]);
});
