/** Execute the shipped component's event handlers with a small hook/tree adapter.
 * No browser, layout, WebGL or visual acceptance is claimed by these tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {createDefaultPlayer} from '../game-logic/player.js';
import {ensurePersistentPlayerYard,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
import {courtyardPresentation} from '../src/games/companion-yard-v2/presentation.mjs';
import {MIKA_CLIPS} from '../game-logic/yard-v2/media/mika-clips.mjs';
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
function snapshot({treats=140,enabled=true}={}){
 const p=createDefaultPlayer('acquisition-owner','Owner',NOW);ensurePersistentPlayerYard(p,{now:NOW});p.yard.currencies.treats=treats;
 return{player:{id:p.id,syncSeq:0},serverTime:NOW,yard:structuredClone(p.yard),yardRuntime:publicPersistentYard(p,{now:NOW,canonicalItemPlacementEnabled:enabled})};
}
function setup(t,snap=snapshot(),{canonical=true,ready=true}={}){
 t.mock.timers.enable({apis:['setInterval']});
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
 const slots=[],effects=[],pendingEffects=[],sent=[];let cursor=0,effectCursor=0,options,tree;
 const harness={state:{snapshot:snap,accountSession:{},pendingActions:[],message:'',outboxStorageError:null,setActiveGameShell(){},loadSnapshot(){},performReliableAction:async(action,payload,opts)=>{
  sent.push({action,payload,options:opts});harness.state.pendingActions.push({accountId:harness.state.snapshot.player.id,action,payload,clientActionId:opts.clientActionId,status:'pending'});return{success:true,pending:true};
 }},
 useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
 useRef(initial){const index=cursor++;return slots[index]??=( {current:initial} );},
 useEffect(fn,deps){const index=effectCursor++,prior=effects[index];if(!prior||!deps||deps.some((d,i)=>d!==prior.deps[i]))pendingEffects.push(()=>{prior?.cleanup?.();effects[index]={deps,cleanup:fn()};});},
 element(type,props,children){if(props?.ref&&!props.ref.current)props.ref.current={open:false,focus(){},showModal(){this.open=true;},close(){this.open=false;}};return{type,props:{...props,children}};},
 scene(o){options=o;return{update(){},dispose(){},setCanonicalActionPending(){},setGhost(){},endPointer(){}};},
 render(){cursor=0;effectCursor=0;tree=CourtyardGame({allowPipPrototype:true});for(const effect of pendingEffects.splice(0))effect();return tree;},
 find(attribute,value){return nodes(tree).find(n=>n.props?.[attribute]===value);},
 publish({canonical:mode=canonical,ready:media=ready}={}){options.onView({...courtyardPresentation(harness.state.snapshot,NOW,MIKA_CLIPS),mutable:mode?false:media&&harness.state.snapshot.yardRuntime.mutable,canonicalItems:mode,mediaReady:media});harness.render();},
 shop(){harness.find('data-nav-item','decor').props.onClick();harness.render();harness.find('data-decor-tab','shop').props.onClick();harness.render();return harness.find('data-yard-action','buy-goodie');},
 sent,
 };
 globalThis.__yardAcquisitionUI=harness;harness.render();harness.publish();
 t.after(()=>{for(const effect of effects)effect?.cleanup?.();delete globalThis.__yardAcquisitionUI;delete globalThis.window;delete globalThis.document;});
 return harness;
}

test('new player sees the 140-treat pot but cannot buy at the real 80-treat starter balance',t=>{
 const starter=snapshot({treats:80});assert.equal(starter.yard.goodieInventory.leaf_pot,undefined);
 const ui=setup(t,starter),button=ui.shop();assert.equal(button.props.disabled,true);
 const footer=ui.find('className','cy-selected-actions');assert.match(JSON.stringify(footer),/140/);assert.match(JSON.stringify(footer),/insufficientFunds/);
 return button.props.onClick().then(()=>assert.equal(ui.sent.length,0));
});

test('canonical Shop buys exactly one leaf_pot through the ordinary durable action and blocks repeat clicks',async t=>{
 const ui=setup(t);assert.equal(ui.state.snapshot.yardRuntime.supportedBindings.goodies.leaf_pot.buy,true);
 const button=ui.shop();assert.equal(button.props.disabled,false);assert.deepEqual(nodes(ui.render()).filter(n=>n.props?.['data-goodie-id']).map(n=>n.props['data-goodie-id']),['leaf_pot']);await button.props.onClick();await button.props.onClick();
 assert.equal(ui.sent.length,1);assert.deepEqual(ui.sent[0].payload,{goodieId:'leaf_pot'});assert.equal(ui.sent[0].action,'yard.buyGoodie');assert.match(ui.sent[0].options.clientActionId,/^yard-v2:[a-f0-9-]+$/);assert.equal(ui.sent[0].options.durability,'outbox');
 ui.render();assert.equal(ui.find('data-yard-action','buy-goodie').props.disabled,true);
});

for(const [label,change]of[
 ['default-off',s=>s.yardRuntime.itemPlacementCapabilities.enabled=false],['anonymous',s=>delete s.player.id],['read-only',s=>s.yardRuntime.mutable=false],['not ready',s=>s.yardRuntime.status='review-required'],['old server',s=>s.yardRuntime.error='UNSUPPORTED_YARD_STORAGE_VERSION'],['wrong version',s=>s.yardRuntime.version=2],['wrong protocol',s=>s.yardRuntime.actionProtocol='yard:'],['missing capability',s=>delete s.yardRuntime.itemPlacementCapabilities],['wrong geometry',s=>s.yardRuntime.itemPlacementCapabilities.geometryRevision='other'],['expanded canonical protocol',s=>s.yardRuntime.itemPlacementCapabilities.actions.push('yard.buyGoodie')],['missing buy binding',s=>delete s.yardRuntime.supportedBindings.goodies.leaf_pot.buy],['nonboolean buy binding',s=>s.yardRuntime.supportedBindings.goodies.leaf_pot.buy=1],['insufficient funds',s=>s.yard.currencies.treats=139],
])test(`canonical purchase stays closed for ${label}, including a stale enabled handler`,async t=>{
 const ui=setup(t),old=ui.shop();change(ui.state.snapshot);await old.props.onClick();assert.equal(ui.sent.length,0);ui.render();assert.equal(ui.find('data-yard-action','buy-goodie').props.disabled,true);
});

test('canonical purchase waits for scene media readiness',async t=>{const ui=setup(t,snapshot(),{ready:false}),button=ui.shop();assert.equal(button.props.disabled,true);await button.props.onClick();assert.equal(ui.sent.length,0);});
for(const status of['pending','sending','rollout-paused','canonical-blocked'])test(`any unresolved Yard ${status} intent blocks acquisition`,async t=>{
 const ui=setup(t),button=ui.shop();ui.state.pendingActions=[{action:'yard.placeGoodie',status}];await button.props.onClick();assert.equal(ui.sent.length,0);ui.render();assert.equal(ui.find('data-yard-action','buy-goodie').props.disabled,true);
});
for(const sameAccount of[false,true])test(`stale purchase handler is fenced after account ${sameAccount?'A-B-A':'A-B'}`,async t=>{
 const ui=setup(t),button=ui.shop();ui.state.accountSession={};if(!sameAccount)ui.state.snapshot.player.id='other-account';await button.props.onClick();assert.equal(ui.sent.length,0);
});

test('canonical purchase exception does not enable food, letters or remodel actions',async t=>{
 const ui=setup(t);ui.shop();
 const remodels=nodes(ui.render()).filter(n=>n.type==='button'&&n.props.children?.includes('yard.persistent.select'));assert.ok(remodels.length);
 for(const button of remodels){assert.equal(button.props.disabled,true);await button.props.onClick();}
 // Root-owned gift and letter handlers remain blocked even when called directly.
 ui.find('data-nav-item','guests').props.onClick();ui.render();
 for(const row of nodes(ui.render()).filter(n=>n.type?.name==='Row'))for(const button of nodes(row).filter(n=>n.type==='button')){assert.equal(button.props.disabled,true);await button.props.onClick?.();}
 ui.find('data-nav-item','food').props.onClick();ui.render();
 for(const button of nodes(ui.render()).filter(n=>n.type==='button'&&n.props.children?.includes('yard.persistent.take'))){assert.equal(button.props.disabled,true);await button.props.onClick();}
 assert.equal(ui.sent.length,0);
});

test('legacy scene loading reports loading while actual quarantine still reports read-only',t=>{
 const ui=setup(t,snapshot(),{canonical:false,ready:false});assert.equal(ui.find('id','yardVisitStatus').props.children[0],'yard.persistent.loading');
 ui.state.snapshot.yardRuntime={...ui.state.snapshot.yardRuntime,status:'review-required',mutable:false,error:'UNSUPPORTED_YARD_STORAGE_VERSION'};ui.publish();
 assert.equal(ui.find('id','yardVisitStatus').props.children[0],'yard.persistent.status.readOnly');
});

test('a retained purchase shows pending recovery after reload even after snapshot clears the message',t=>{
 const ui=setup(t);ui.state.pendingActions=[{action:'yard.buyGoodie',payload:{goodieId:'leaf_pot'},status:'rollout-paused',blockedReason:'UNSUPPORTED_YARD_STORAGE_VERSION'}];ui.state.message='';ui.render();
 assert.equal(ui.find('id','yardVisitStatus').props.children[0],'yard.canonical.pending');assert.equal(ui.shop().props.disabled,true);
});

test('ordinary writable Yard shop keeps its existing supported catalog actions',async t=>{
 const ui=setup(t,snapshot(),{canonical:false}),button=ui.shop();assert.equal(button.props.disabled,false);await button.props.onClick();assert.equal(ui.sent.length,1);assert.equal(ui.sent[0].action,'yard.buyGoodie');assert.equal(ui.sent[0].payload.goodieId,'yarn_mouse');
});
