import test from 'node:test';import assert from 'node:assert/strict';
import {MERGE_LAB_CATALOG as catalog} from '../game-logic/merge-lab-catalog.js';
import {createMergeLabAction,createMergeLabQuote} from '../game-logic/merge-lab-domain.js';
import {MERGE_LAB_RELEASE_POLICY,MERGE_LAB_INITIAL_PROJECT_ID,ensureMergeLabState,executeMergeLab,planMergeCleanStart} from '../game-logic/merge-lab-service.js';
const now=1790928000000,policy={...MERGE_LAB_RELEASE_POLICY,enabled:true},options={now,policy,newEpoch:()=> 'onboarding_epoch_123456'};
const path=['cloud_ember_spark','glass_spark_lens','v3_lens_spark_light','v3_light_vial_glow_lantern','v3_sprout_dew_herb','vial_herb_elixir','v3_glass_elixir_crystal'];
function player(){return {resources:{gold:123,gachaTokens:0},farm:{harvested:{}},yard:{currencies:{treats:0,shinyTreats:0},goodieInventory:{},activeVisitors:[],placedGoodies:[]},merge:{board:[],inventory:[],alchemyEssence:0,freeTapCharges:0,lastFreeTaps:0,lastFreePull:0}};}
function action(p,type,payload={},quoted=false){const params=quoted?{...payload,quote:createMergeLabQuote(p,type,payload,catalog,{now})}:payload;const command=createMergeLabAction(p,type,params,catalog,{actionId:`onboarding-${p.merge.mergeRevision}`});const result=executeMergeLab(p,{command,expectedMergeEpoch:p.merge.serverEpoch},options);assert.equal(result.ok,true,`${type}: ${JSON.stringify(result.error)}`);return result;}
function prune(plans){const sorted=[...new Map(plans.map(set=>[[...set].sort().join('|'),set])).values()].sort((a,b)=>a.size-b.size);return sorted.filter((set,i)=>!sorted.slice(0,i).some(prior=>[...prior].every(id=>set.has(id))));}
function discoveries(itemId,seen=new Set()){
 if(catalog.starterItemIds.includes(itemId))return [new Set()];if(seen.has(itemId))return [];
 const next=new Set([...seen,itemId]);return prune(catalog.recipes.filter(recipe=>recipe.result===itemId).flatMap(recipe=>discoveries(recipe.ingredients[0],next).flatMap(a=>discoveries(recipe.ingredients[1],next).map(b=>new Set([...a,...b,recipe.id])))));
}
test('Night Beacon has shortest base-recipe discovery path among the four available first goals',()=>{
 const counts={};for(const project of catalog.projects.filter(p=>!p.requiresYardV3)){
  let plans=[new Set()];for(const id of project.inputs)plans=prune(plans.flatMap(a=>discoveries(id).map(b=>new Set([...a,...b]))));counts[project.id]=plans[0].size;
 }
 assert.deepEqual(counts,{night_beacon:7,listening_fountain:8,dream_nest:10,stargazer_nook:9});assert.equal(MERGE_LAB_INITIAL_PROJECT_ID,'night_beacon');
});
test('fresh starter + 6 free supply charges reaches Moon Lamp with no tokens, crops, new kit grant or clock wait',()=>{
 const p=player(),originalResources=structuredClone(p.resources);ensureMergeLabState(p,options);assert.equal(p.merge.projects.selectedId,'night_beacon');
 for(const id of path){const recipe=catalog.recipes.find(r=>r.id===id);action(p,'researchPair',{leftItemId:recipe.ingredients[0],rightItemId:recipe.ingredients[1]});}
 assert.equal(p.merge.alchemyEssence,28);action(p,'claimStarterKit',{},true);assert.deepEqual(p.merge.stock,catalog.starterKit);action(p,'claimFreeCharges');
 for(const [itemId,quantity] of Object.entries({glass:2,vial:1,spark:2,herb:1}))action(p,'claimSupply',{itemId,quantity},true);
 action(p,'distillStock',{itemId:'glass',quantity:1},true);assert.equal(p.merge.alchemyEssence,30);
 for(const recipeId of ['glass_spark_lens','v3_lens_spark_light','v3_light_vial_glow_lantern','vial_herb_elixir','v3_glass_elixir_crystal'])action(p,'craft',{recipeId,quantity:1},true);
 action(p,'craftProject',{projectId:'night_beacon',quantity:1},true);
 assert.equal(p.yard.goodieInventory.moon_lamp,1);assert.equal(p.merge.projects.crafted.night_beacon,1);assert.equal(p.merge.alchemyEssence,0);assert.equal(p.merge.freeTapCharges,24);assert.deepEqual(p.resources,originalResources);assert.deepEqual(p.farm.harvested,{});assert.deepEqual(p.yard.activeVisitors,[]);assert.deepEqual(p.yard.placedGoodies,[]);assert.equal(p.merge.mergeRevision,20);
});
test('existing saved goals remain selected; clean-start review plan explicitly selects the available fresh goal',()=>{
 const p=player();p.merge.projects={selectedId:'echo_chimes'};ensureMergeLabState(p,{...options,policy:{...policy,migrationMode:'preserve'}});assert.equal(p.merge.projects.selectedId,'echo_chimes');ensureMergeLabState(p,options);assert.equal(p.merge.projects.selectedId,'echo_chimes');assert.equal(planMergeCleanStart(p).initialMerge.projects.selectedId,'night_beacon');
 const resetCandidate=player();resetCandidate.merge.projects={selectedId:'echo_chimes'};ensureMergeLabState(resetCandidate,{...options,policy:{...policy,migrationMode:'clean-start'}});assert.equal(resetCandidate.merge.projects.selectedId,'night_beacon');assert.equal(resetCandidate.merge.migration.archive.merge.projects.selectedId,'echo_chimes');
});
