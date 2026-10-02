import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as original from './fixtures/merge-lab-recovery/domain.original.mjs';
import {migrateMergeLabPlayer as originalMigration} from './fixtures/merge-lab-recovery/migration.original.mjs';
import * as recovered from '../game-logic/merge-lab-domain.js';
import {migrateMergeLabPlayer} from '../game-logic/merge-lab-migration.js';
import {MERGE_LAB_CATALOG as catalog,mergeLabName} from '../game-logic/merge-lab-catalog.js';
import {M as originalCatalog,m as originalName} from './fixtures/merge-lab-recovery/catalog.original.mjs';
const now=1790928000000;
const clone=structuredClone;
const make=()=>({id:'test-player',resources:{gold:87,gachaTokens:1000},farm:{harvested:Object.fromEntries(Object.keys(catalog.cropSupplies).map(id=>[id,10]))},yard:{goodieInventory:{existing_prop:2},currencies:{treats:37,shinyTreats:4},visitors:['unchanged'],placed:{one:'unchanged'}},merge:recovered.createMergeLabState(catalog,{now})});
function stocked(){const p=make();p.merge.knowledge.itemIds=catalog.items.map(x=>x.id);p.merge.knowledge.recipeIds=catalog.recipes.map(x=>x.id);p.merge.rewards=clone(p.merge.knowledge);p.merge.stock=Object.fromEntries(catalog.items.map(x=>[x.id,10000]));p.merge.alchemyEssence=10000;p.merge.freeTapCharges=30;return p;}
let comparisons=0;
function same(a,b){comparisons++;assert.deepEqual(a,b);}
function compareOperation(player,type,payload,{quote=true,time=now}={}){
 let parameters=clone(payload);
 if(quote){const q=recovered.createMergeLabQuote(player,type,parameters,catalog,{now:time});same(q,original.createMergeLabQuote(player,type,parameters,catalog,{now:time}));parameters.quote=q;}
 const command=recovered.createMergeLabAction(player,type,parameters,catalog,{actionId:`differential-${comparisons}`});
 same(command,original.createMergeLabAction(player,type,parameters,catalog,{actionId:command.actionId}));
 const before=clone(player);
 const a=recovered.applyMergeLabAction(player,command,catalog,{now:time});
 const b=original.applyMergeLabAction(player,command,catalog,{now:time});same(a,b);same(player,before);
 return a;
}
test('catalog data and all978 name-fallback checks retain exact compiled exports',()=>{
 same(catalog,originalCatalog);
 const values=[null,undefined,{}, {id:'x'}, {name:'n',id:'x'}, {names:{en:'English',ru:'Русский'}}, {names:{ru:'',en:''},name:'fallback'},...catalog.items,...catalog.recipes,...catalog.projects,...catalog.projects.flatMap(p=>p.variants||[])];
 let helperComparisons=0;for(const item of values){same(mergeLabName(item),originalName(item));helperComparisons++;for(const language of ['en','ru','xx','',null]){same(mergeLabName(item,language),originalName(item,language));helperComparisons++;}}
 assert.equal(helperComparisons,978);
});
test('recovered catalog/state/hash are identical to untouched compiled domain',()=>{
 same(recovered.compileMergeLabCatalog(catalog),original.compileMergeLabCatalog(catalog));
 same(recovered.createMergeLabState(catalog,{now}),original.createMergeLabState(catalog,{now}));
 for(const value of [null,true,0,'тест',{z:2,a:[1,'x']},{nested:{b:3,a:4}}]){
  same(recovered.hashCanonical(value),original.hashCanonical(value));
  const canonical=value&&typeof value==='object'&&!Array.isArray(value)?null:JSON.stringify(value);
  if(canonical)same(recovered.hashCanonical(value),crypto.createHash('sha256').update(canonical).digest('hex'));
 }
});
test('every recipe, project variant and supported supply/exchange action matches compiled economics',()=>{
 const p=stocked();
 for(const recipe of catalog.recipes){
  for(const quantity of [1,2,100])compareOperation(p,'craft',{recipeId:recipe.id,quantity});
  compareOperation(p,'researchPair',{leftItemId:recipe.ingredients[0],rightItemId:recipe.ingredients[1]},{quote:false});
 }
 for(const project of catalog.projects)for(const variant of ['base',...(project.variants||[]).map(x=>x.id)])for(const quantity of [1,3])compareOperation(p,'craftProject',{projectId:project.id,variantId:variant,quantity});
 for(const itemId of catalog.supplyItemIds)compareOperation(p,'claimSupply',{itemId,quantity:2});
 for(const item of catalog.items)compareOperation(p,'distillStock',{itemId:item.id,quantity:3});
 for(const pack of catalog.tokenPacks)compareOperation(p,'buySupply',{packId:pack.id});
 for(const cropId of Object.keys(catalog.cropSupplies))compareOperation(p,'useCropSupply',{cropId});
 compareOperation(p,'claimStarterKit',{});compareOperation(p,'claimDailySupply',{});
 for(const offerId of ['yard_treats_small','yard_shiny_treat'])compareOperation(p,'exchange',{offerId});
 compareOperation(p,'claimFreeCharges',{},{quote:false});compareOperation(p,'selectProject',{projectId:catalog.projects[0].id},{quote:false});
});
test('discovery, failed pairs, hints, retry, stale quote and invalid payload retain exact outcomes',()=>{
 let p=make();
 const recipe=catalog.recipes.find(x=>!p.merge.knowledge.recipeIds.includes(x.id)&&!p.merge.knowledge.itemIds.includes(x.result)&&x.ingredients.every(id=>p.merge.knowledge.itemIds.includes(id)));
 for(const stage of [1,2,3])p=compareOperation(p,'requestHint',{recipeId:recipe.id,stage},{quote:false}).player;
 p=compareOperation(p,'researchPair',{leftItemId:recipe.ingredients[0],rightItemId:recipe.ingredients[1]},{quote:false}).player;
 compareOperation(p,'researchPair',{leftItemId:recipe.ingredients[0],rightItemId:recipe.ingredients[1]},{quote:false});
 for(const leftItemId of catalog.starterItemIds)for(const rightItemId of catalog.starterItemIds)compareOperation(p,'researchPair',{leftItemId,rightItemId},{quote:false});
 const command=recovered.createMergeLabAction(p,'claimFreeCharges',{},catalog,{actionId:'retry-same'});
 const once=recovered.applyMergeLabAction(p,command,catalog,{now});
 same(recovered.applyMergeLabAction(once.player,command,catalog,{now:now+999999}),original.applyMergeLabAction(once.player,command,catalog,{now:now+999999}));
 for(const bad of [{...command,payloadHash:'bad'},{...command,actionId:'wrong'},{...command,unexpected:true}])same(recovered.applyMergeLabAction(p,bad,catalog,{now}),original.applyMergeLabAction(p,bad,catalog,{now}));
 const rich=stocked();const q=recovered.createMergeLabQuote(rich,'craft',{recipeId:catalog.recipes[0].id,quantity:1},catalog,{now});
 const c=recovered.createMergeLabAction(rich,'craft',{...q.parameters,quote:q},catalog,{actionId:'expire'});
 same(recovered.applyMergeLabAction(rich,c,catalog,{now:q.expiresAt}),original.applyMergeLabAction(rich,c,catalog,{now:q.expiresAt}));
});
test('legacy migrations reproduce original parsing, mirroring, quarantine, and no bonus replay',()=>{
 const base=make();delete base.merge;
 const fixtures=[
  {},{merge:{board:JSON.stringify(Array.from({length:7},(_,r)=>Array.from({length:9},(_,c)=>({id:'seed',instanceId:`${r}-${c}`}))))}},
  {merge:{board:{0:{0:{id:'thread'},1:{chainId:'wood',level:2}}},inventory:{dew:2},unknownField:{retain:'yes'},discoveredItems:['seed','unknown'],discoveredRecipes:['invalid']}},
  {merge:{board:[[{id:'seed',uid:'same'}]],inventory:[{id:'seed',uid:'same'},{id:'dew',quantity:3}]},mergeInventory:[{id:'seed',uid:'same'},{id:'dew',quantity:3}]},
  {merge:{inventory:{seed:2}},mergeInventory:{dew:5}},
  {merge:{board:'malformed',inventory:[{id:'not_known'},{id:'seed',quantity:-1},{id:'seed',quantity:1.5}],alchemyEssence:11,freeTapCharges:4,lastFreePull:now,lastFreeTaps:now}},
  {merge:{board:[[{id:'seed',quantity:Number.MAX_SAFE_INTEGER},{id:'seed',quantity:1}]]}},
 ];
 for(const f of fixtures){const input={...clone(base),...f};const before=clone(input);const a=migrateMergeLabPlayer(input,catalog,{now});same(a,originalMigration(input,catalog,{now}));same(input,before);same(migrateMergeLabPlayer(a.player,catalog,{now:now+1}),originalMigration(a.player,catalog,{now:now+1}));}
});
test('differential coverage count',()=>{assert.ok(comparisons>1800,`comparisons: ${comparisons}`);console.log(`MERGE_RECOVERY_DIFFERENTIAL_COMPARISONS=${comparisons}`);});

test('minimum-cost early exit preserves fixed-point results for reversed dependency order',()=>{
 const reordered=clone(catalog);
 reordered.recipes.reverse();
 assert.deepEqual(recovered.compileMergeLabCatalog(reordered),original.compileMergeLabCatalog(reordered));
 const disconnected=clone(catalog);
 disconnected.items.push({id:'unreachable',names:{en:'Unreachable',ru:'Недостижимо'}});
 for(const compiler of [original.compileMergeLabCatalog,recovered.compileMergeLabCatalog]){
  assert.throws(()=>compiler(disconnected),{code:'INVALID_CATALOG'});
 }
});
