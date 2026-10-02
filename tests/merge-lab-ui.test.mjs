import './merge-lab-ui-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {MERGE_LAB_CATALOG as catalog,mergeLabName} from '../game-logic/merge-lab-catalog.js';
import {createMergeLabState} from '../game-logic/merge-lab-domain.js';
const {MergeLabView,calculateLabLayout,quoteShortages,projectDependencyIds,selectReachableHint,laboratoryStatus,supplyChargeStatus}=await import('../src/games/merge/MergeLabView.js');
const raw=fs.readFileSync(new URL('./fixtures/merge-lab-recovery/ui.original.txt',import.meta.url),'utf8');
const original=Function('tt','ft',raw+';return {Mp,Rp,Vu,zp,Dp,qp};')(catalog,mergeLabName);
const player={player:{id:'ui'},resources:{gachaTokens:42},farm:{harvested:{strawberry:4}},yard:{goodieInventory:{alchemy_echo_chimes:7},currencies:{treats:2,shinyTreats:3}},merge:createMergeLabState(catalog,{now:1790928000000})};
player.merge.serverEpoch='render_epoch_123456';player.merge.releasePolicy={yardV3ProjectsEnabled:false};
player.merge.knowledge.itemIds=catalog.items.map(x=>x.id);player.merge.knowledge.recipeIds=catalog.recipes.map(x=>x.id);player.merge.stock=Object.fromEntries(catalog.items.map(x=>[x.id,99]));player.merge.alchemyEssence=999;
function nodes(root){if(root==null||typeof root!=='object')return [];if(Array.isArray(root))return root.flatMap(nodes);return [root,...nodes(root.props?.children)];}

test('layout and pure UI helpers match original compiled semantics across matrix and safe insets',()=>{
 for(const [w,h] of [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]])for(const inset of [{},{top:48,bottom:56,left:0,right:0},{top:48,bottom:56,left:24,right:24}])assert.deepEqual(calculateLabLayout(w,h,inset),original.Mp(w,h,inset));
 for(const project of catalog.projects){assert.deepEqual(projectDependencyIds(catalog,project),original.Vu(catalog,project));assert.deepEqual(selectReachableHint(catalog,player.merge.knowledge,project),original.zp(catalog,player.merge.knowledge,project));}
 for(const slots of [[null,null],['seed',null],['seed','dew']])assert.equal(laboratoryStatus(slots,false,null,{},catalog.version),original.Dp(slots,false,null,{},catalog.version));
 assert.deepEqual(quoteShortages({stockCost:{seed:1000},cropCost:{strawberry:5},essenceCost:1000,tokenCost:50,freeChargeCost:9},player),original.Rp({stockCost:{seed:1000},cropCost:{strawberry:5},essenceCost:1000,tokenCost:50,freeChargeCost:9},player));
 assert.deepEqual(supplyChargeStatus(player.merge,catalog.economy,1790929000000),original.qp(player.merge,catalog.economy,1790929000000));
});
test('recovered view uses existing runtime imports and all major initial panels build a tree',()=>{
 for(const language of ['en','ru'])for(const panel of [null,'projects','supplies','journal','samples','pause']){
  const tree=MergeLabView({player,language,catalog,getQuote:async()=>{},initialViewState:{panel:panel?{type:panel}:null}});
  assert.ok(nodes(tree).some(n=>n.props?.className==='ml-root'));
 }
 const source=fs.readFileSync(new URL('../src/games/merge/MergeLabView.js',import.meta.url),'utf8');assert.ok(source.includes("from 'react'"));assert.ok(source.includes("from 'react/jsx-runtime'"));assert.ok(!source.includes('createRoot('));assert.ok(!source.includes('createMergeLabQuote('));assert.ok(!source.includes('iframe'));
});
test('future Yard projects visibly blocked before a quote while four supported projects stay available',()=>{
 for(const language of ['en','ru']){
  const tree=MergeLabView({player,language,catalog,getQuote:async()=>{},initialViewState:{panel:{type:'projects'}}});const all=nodes(tree);
  for(const project of catalog.projects){const button=all.find(n=>n.props?.['data-testid']===`ml-project-quote-${project.id}`);assert.ok(button);assert.equal(button.props.disabled,project.requiresYardV3===true);}
  const text=JSON.stringify(tree);assert.match(text,language==='ru'?/Откроется с обновлением Двора/:/Unlocks with the Yard update/);
 }
});
test('extracted CSS excludes preview-global root overrides while retaining hf1 fixes',()=>{
 const css=fs.readFileSync(new URL('../src/games/merge/merge-lab.css',import.meta.url),'utf8');assert.ok(!css.includes('html,body,#root'));assert.ok(!css.includes('.preview-state'));assert.ok(!css.includes('@font-face'));assert.ok(css.includes('.ml-root[data-orientation=landscape][data-compact=true]'));assert.ok(css.includes('font-size:10px'));
});

test('an already-selected unavailable goal shows a Yard-update lock and keeps normal goal selection reachable',()=>{
 const existing=structuredClone(player);existing.merge.projects.selectedId='echo_chimes';
 const tree=MergeLabView({player:existing,language:'en',catalog,getQuote:async()=>{}});
 const goal=nodes(tree).find(n=>n.props?.className==='ml-goal');assert.ok(goal);assert.match(JSON.stringify(goal),/Needs the Yard update/);assert.match(goal.props['aria-label'],/Voice of the Wind/);assert.equal(typeof goal.props.onClick,'function');assert.equal(existing.merge.projects.selectedId,'echo_chimes');
});

// Exercise the actual recovered dialog's React effect lifecycle without a renderer.
// This reproduces title replacement and passive cleanup ordering; browser QA remains separate.
async function dialogLifecycle() {
 const {createDialogFocusManager}=await import('../src/app/dialogFocus.js');
 const source=fs.readFileSync(new URL('../src/games/merge/MergeLabView.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function LabDialog('),source.indexOf('function LabSamples('));
 const manager=createDialogFocusManager(),frames=[],refs=[],effects=[],listeners=new Map();
 let refIndex=0,effectIndex=0,controls=[],inert=false;const pending=[];
 const doc={body:null,activeElement:null,querySelectorAll:()=>dialog.isConnected?[dialog]:[],
  addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn)};
 function node(id,workspace=false){const n={id,isConnected:true,hidden:false,closest:selector=>workspace&&inert&&selector.includes('inert')?{}:null,
  focus(){if(!n.isConnected||workspace&&inert)return;doc.activeElement=n;for(const fn of [...listeners.get('focusin')||[]])fn({target:n});}};return n;}
 doc.body=node('body');const opener=node('supplies-opener',true);doc.activeElement=opener;
 const dialog={isConnected:true,contains:n=>n===dialog||controls.includes(n),querySelectorAll:()=>controls,focus:()=>{doc.activeElement=dialog;}};
 const React={useId:()=> 'dialog',useRef:value=>refs[refIndex++]??=( {current:value} ),useEffect:(setup,deps)=>{
  const i=effectIndex++,previous=effects[i];
  if(!previous||deps.some((value,index)=>value!==previous.deps[index]))pending.push(()=>{previous?.cleanup?.();effects[i]={setup,deps,cleanup:setup()};});
 }};
 const jsxRuntime={jsx:(type,props)=>{if(props?.ref)props.ref.current=dialog;return {type,props};}};jsxRuntime.jsxs=jsxRuntime.jsx;
 const LabDialog=Function('React','jsxRuntime','LabButton','ChevronLeft','LabCloseIcon','document','window','mergeDialogFocusManager',`return (${code})`)(React,jsxRuntime,()=>{},()=>{},()=>{},doc,{requestAnimationFrame:fn=>frames.push(fn)},manager);
 const close=()=>{};
 function render(title){
  for(const old of controls)old.isConnected=false;
  if(controls.includes(doc.activeElement))doc.activeElement=doc.body;
  controls=[node(`${title}-first`),node(`${title}-last`)];refIndex=0;effectIndex=0;
  LabDialog({title,onClose:close,t:key=>key,children:null});
  for(const run of pending.splice(0))run();inert=true;
 }
 return {doc,dialog,opener,manager,render,
  active:()=>doc.activeElement?.id,
  key:(key,shiftKey=false)=>{let prevented=false;for(const fn of [...listeners.get('keydown')||[]])fn({key,shiftKey,defaultPrevented:false,isComposing:false,preventDefault:()=>{prevented=true;},stopPropagation(){}});return prevented;},
  focusLast:()=>controls.at(-1).focus(),
  strictReplay(){for(const effect of effects)effect.cleanup?.();for(const effect of effects)effect.cleanup=effect.setup();},
  unmount(){dialog.isConnected=false;for(const old of controls)old.isConnected=false;doc.activeElement=doc.body;for(const effect of effects)effect.cleanup?.();inert=false;},
  flush(){for(const frame of frames.splice(0))frame();},
  listenerCount:()=>[...listeners.values()].reduce((sum,set)=>sum+set.size,0)};
}

test('dialog retains the original opener through repeated Quote/Back title changes and final cleanup',async()=>{
 const ui=await dialogLifecycle();ui.render('Supplies');assert.equal(ui.active(),'Supplies-first');
 ui.focusLast();assert.equal(ui.key('Tab'),true);assert.equal(ui.active(),'Supplies-first');
 for(let i=0;i<2;i++){ui.render('Quote');assert.equal(ui.active(),'Quote-first');ui.render('Supplies');assert.equal(ui.active(),'Supplies-first');}
 ui.unmount();ui.flush();assert.equal(ui.active(),'supplies-opener');assert.equal(ui.listenerCount(),0);
});

test('Strict Mode effect replay preserves the opener and stale restore work cannot steal focus',async()=>{
 const ui=await dialogLifecycle();ui.render('Supplies');ui.strictReplay();ui.flush();assert.equal(ui.active(),'Supplies-first');
 ui.render('Quote');ui.render('Supplies');ui.unmount();ui.flush();assert.equal(ui.active(),'supplies-opener');
 const replaced=await dialogLifecycle();replaced.render('Supplies');replaced.unmount();
 const next=replaced.manager.begin({isConnected:true,contains:()=>false});replaced.flush();assert.equal(replaced.active(),'body');next.end();
});
