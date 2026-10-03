import './yard-inventory-only-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultPlayer} from '../game-logic/player.js';
import {YARD_FOODS,YARD_VISITORS,YARD_GOODIES,getYardGoodieActivities} from '../game-logic/yard-catalog.js';
import {ensurePersistentPlayerYard,executePersistentYardAction,publicPersistentYard,inspectPlayerYard} from '../game-logic/yard-v2/service.mjs';
import {getMikaServerOptions} from '../game-logic/yard-v2/mika-media.mjs';
import {foodBindingReady,bowlBindingReady} from '../game-logic/yard-v2/availability.mjs';
import {advancePersistentChunk} from '../game-logic/yard-v2/orchestrator.mjs';
import {advanceYard} from '../game-logic/yard-v2/simulation.mjs';
const NOW=Date.UTC(2026,9,2,12),H=3600000,copy=structuredClone;
function player(id='food-bindings') {
 const p=createDefaultPlayer(id,'Fixture',NOW);p.yard.currencies={treats:5000,shinyTreats:100,unknown:7};
 p.yard.foodInventory={kibble:10,berry_plate:10,bonito_bowl:10,future_dish:19};
 p.yard.bowls[0].unknown={keep:'first'};p.yard.bowls.push({id:'bowl-2',foodId:null,servings:0,placedAt:null,expiresAt:null,unknown:{keep:'second'}});
 p.yard.helper={...p.yard.helper,unknown:{keep:'helper'}};p.resources.gold=777;p.resources.gachaTokens=11;p.merge.alchemyEssence=333;
 return p;
}
function registry() {return copy(getMikaServerOptions().mediaRegistry);}
const invoke=(p,action,payload,id,extra={})=>executePersistentYardAction(p,action,payload,{now:NOW,actionId:`yard-v2:${id}`,...extra});
const wallets=p=>copy({resources:p.resources,merge:p.merge,garden:p.garden});
const source=[['kibble',0,0,4,4],['berry_plate',120,0,6,5],['bonito_bowl',0,2,8,6]];

for(const [id,treats,shiny,hours,servings] of source)test(`${id} keeps exact source price, quantity, servings and duration with lossless replay`,()=>{
 const p=player(id),outside=wallets(p),before=copy(p.yard),qty=2;
 assert.deepEqual(YARD_FOODS[id].cost,{treats,shinyTreats:shiny});
 const buy=invoke(p,'yard.buyFood',{foodId:id,qty:2.9},`buy-${id}`);assert.equal(buy.status,200);
 assert.equal(p.yard.currencies.treats,before.currencies.treats-treats*qty);assert.equal(p.yard.currencies.shinyTreats,before.currencies.shinyTreats-shiny*qty);
 assert.equal(p.yard.foodInventory[id],before.foodInventory[id]+qty);assert.equal(buy.extras.qty,2);
 const set=invoke(p,'yard.setFood',{foodId:id},`set-${id}`);assert.equal(set.status,200);
 assert.equal(p.yard.foodInventory[id],before.foodInventory[id]+qty-1);
 assert.deepEqual(p.yard.bowls[0],{...before.bowls[0],foodId:id,servings,placedAt:NOW,expiresAt:NOW+hours*H});
 assert.deepEqual(p.yard.bowls[1],before.bowls[1]);assert.deepEqual(wallets(p),outside);assert.equal(p.yard.foodInventory.future_dish,19);
 const after=copy(p),loaded=JSON.parse(JSON.stringify(p));
 for(const [action,payload,key] of [['yard.buyFood',{foodId:id,qty:2.9},`buy-${id}`],['yard.setFood',{foodId:id},`set-${id}`]]){
  const replay=invoke(loaded,action,payload,key,{now:NOW+24*H});assert.equal(replay.replayed,true);assert.deepEqual(loaded,after);
 }
 assert.equal(Object.keys(p._yardV2.runtime.commandReceipts).length,2);
});

test('missing or malformed food metadata rejects spending/refill before advancement, and rejected receipts stay rejected',()=>{
 const variants=[r=>delete r.foodBindings,r=>r.foodBindings={},r=>r.foodBindings.berry_plate=null,
  r=>r.foodBindings.berry_plate.presentationReady='true',r=>delete r.foodBindings.berry_plate.emptyStillId,
  r=>r.foodBindings.berry_plate.filledStillId='   '];
 for(const [index,change] of variants.entries())for(const action of ['yard.buyFood','yard.setFood']){
  const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:'kibble'};
  ensurePersistentPlayerYard(p,{now:NOW});const before=copy(p.yard),cursor=p._yardV2.runtime.cursorMs,r=registry();change(r);
  const payload={foodId:'berry_plate'},id=`missing-${index}-${action}`;
  const first=invoke(p,action,payload,id,{now:NOW+H,mediaRegistry:r});assert.equal(first.status,409);assert.equal(first.details.reason,'FOOD_PRESENTATION_UNAVAILABLE');
  assert.deepEqual(p.yard,before);assert.equal(p._yardV2.runtime.cursorMs,cursor);assert.equal(Object.keys(p._yardV2.runtime.commandReceipts).length,1);
  const after=copy(p),replay=invoke(p,action,payload,id,{now:NOW+2*H});assert.equal(replay.replayed,true);assert.deepEqual(p,after);
 }
});

test('unrendered or malformed bowl rejects manual setFood before helper stock consumption and preserves bowl data',()=>{
 const variants=[r=>delete r.bowlBindings,r=>r.bowlBindings['bowl-1']=null,r=>r.bowlBindings['bowl-1'].presentationReady=false,
  r=>r.bowlBindings['bowl-1'].anchor={x:NaN,y:83},r=>r.bowlBindings['bowl-1'].anchor={x:25,y:101}];
 for(const [index,change] of variants.entries()){
  const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true};ensurePersistentPlayerYard(p,{now:NOW});
  const before=copy(p.yard),r=registry();change(r);
  const result=invoke(p,'yard.setFood',{foodId:'kibble'},`bad-bowl-${index}`,{now:NOW+H,mediaRegistry:r});
  assert.equal(result.status,409);assert.equal(result.details.reason,'BOWL_PRESENTATION_UNAVAILABLE');assert.deepEqual(p.yard,before);assert.equal(p._yardV2.runtime.cursorMs,NOW);
 }
 const p=player(),before=copy(p.yard),result=invoke(p,'yard.setFood',{foodId:'bonito_bowl',bowlId:'bowl-2'},'saved-bowl-two');
 assert.equal(result.status,409);assert.equal(result.details.reason,'BOWL_PRESENTATION_UNAVAILABLE');assert.deepEqual(p.yard,before);
});

for(const [id,,,hours,servings] of source)test(`${id} helper refill is bulk/partition/reload/chunk stable and never fills saved bowl-2`,()=>{
 const initial=player(`helper-${id}`);initial.yard.helper={...initial.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:id};
 const bulk=copy(initial);let parts=copy(initial);const inventory=copy(initial.yard.foodInventory),second=copy(initial.yard.bowls[1]);
 ensurePersistentPlayerYard(bulk,{now:NOW});ensurePersistentPlayerYard(parts,{now:NOW});
 assert.equal(ensurePersistentPlayerYard(bulk,{now:NOW+24*H,simulate:true}).status,200);
 for(let step=1;step<=96;step++){
  assert.equal(ensurePersistentPlayerYard(parts,{now:NOW+step*H/4,simulate:true}).status,200);
  if(step===37)parts=JSON.parse(JSON.stringify(parts));
 }
 assert.deepEqual(parts,JSON.parse(JSON.stringify(bulk)));
 let state=inspectPlayerYard(copy(initial),{now:NOW}).state;
 for(let through=NOW;through<NOW+24*H;){const r=advancePersistentChunk(state,NOW+24*H,{...getMikaServerOptions(),maxHours:5});state=r.state;through=r.through;}
 assert.deepEqual(state.player.yard,bulk.yard);assert.deepEqual(state.runtime,bulk._yardV2.runtime);
 const fills=Math.ceil(24/hours),lastHour=1+(fills-1)*hours;
 assert.equal(bulk.yard.foodInventory[id],inventory[id]-fills);assert.equal(bulk.yard.bowls[0].servings,servings);
 assert.equal(bulk.yard.bowls[0].placedAt,NOW+lastHour*H);assert.equal(bulk.yard.bowls[0].expiresAt,NOW+(lastHour+hours)*H);
 assert.deepEqual(bulk.yard.bowls[1],second);assert.deepEqual(bulk.yard.helper,initial.yard.helper);
 assert.deepEqual(bulk._yardV2.runtime.commandReceipts||{},{});assert.deepEqual(bulk._yardV2.runtime.actionReceipts||{},{});
});

test('unsupported saved preference is never substituted; supported out-of-stock fallback stays in source order among ready foods',()=>{
 for(const preferred of ['berry_plate','future_dish']){
  const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:preferred};
  const r=registry();delete r.foodBindings.berry_plate;const stock=copy(p.yard.foodInventory),helper=copy(p.yard.helper),bowls=copy(p.yard.bowls);
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,mediaRegistry:r,autoRefillPolicy:()=>({ok:true})}).status,200);
  assert.deepEqual(p.yard.foodInventory,stock);assert.deepEqual(p.yard.helper,helper);assert.deepEqual(p.yard.bowls,bowls);
 }
 const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:'berry_plate'};p.yard.foodInventory.berry_plate=0;
 const r=registry();delete r.foodBindings.kibble;
 ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,mediaRegistry:r});
 assert.equal(p.yard.bowls[0].foodId,'bonito_bowl');assert.equal(p.yard.foodInventory.kibble,10);assert.equal(p.yard.foodInventory.bonito_bowl,9);assert.equal(p.yard.helper.preferredFoodId,'berry_plate');
});

test('helper uses effective registry overrides and does not replay an elapsed refill opportunity when capabilities change',()=>{
 const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:'kibble'};
 const r=registry();r.foodBindings={};ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true,mediaRegistry:r});
 assert.equal(p.yard.foodInventory.kibble,10);assert.equal(p.yard.bowls[0].foodId,null);
 ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true});assert.equal(p.yard.foodInventory.kibble,10);
 ensurePersistentPlayerYard(p,{now:NOW+2*H,simulate:true});assert.equal(p.yard.foodInventory.kibble,9);assert.equal(p.yard.bowls[0].placedAt,NOW+2*H);
 const before=copy(p);ensurePersistentPlayerYard(p,{now:NOW+2*H,simulate:true});assert.deepEqual(p,before);
});

function broadFixtureRegistry(){
 const r=registry(),goodie=YARD_GOODIES.yarn_mouse;
 r.bindings=Object.values(YARD_VISITORS).map(v=>({id:`TEST_ONLY:${v.id}`,revision:'test',visitorId:v.id,goodieId:goodie.id,
  activityIds:[...new Set(['new','worn','broken'].flatMap(c=>getYardGoodieActivities(goodie,c).map(a=>a.id)))],
  propMode:'separate',playbackReady:true,requiredPhases:['TEST_ONLY'],validatedPhases:['TEST_ONLY']}));return r;
}
test('already-filled unsupported food/bowl can expire but never consumes visit servings, wear or petbook progress',()=>{
 for(const kind of ['food','bowl']){
  const p=player(`filled-${kind}`);p.yard.placedGoodies=[{slotId:'mouse',goodieId:'yarn_mouse',x:45,y:45,uses:0,condition:'new',placedAt:NOW}];
  p.yard.bowls=[{id:kind==='bowl'?'bowl-2':'bowl-1',foodId:'bonito_bowl',servings:6,placedAt:NOW,expiresAt:NOW+12*H,unknown:{keep:7}}];
  const r=broadFixtureRegistry();if(kind==='food')delete r.foodBindings.bonito_bowl;
  const options={mediaRegistry:r,preflight:()=>({ok:true,plan:null})};
  assert.equal(ensurePersistentPlayerYard(p,{now:NOW+11*H,simulate:true,...options}).status,200);
  assert.equal(p.yard.bowls[0].servings,6);assert.equal(p.yard.placedGoodies[0].uses,0);assert.deepEqual(p.yard.petbook,{});assert.deepEqual(p.yard.activeVisitors,[]);
  assert.ok(p._yardV2.runtime.events.some(e=>e.type==='admission-blocked-media'&&e.reason===(kind==='food'?'FOOD_PRESENTATION_UNAVAILABLE':'BOWL_PRESENTATION_UNAVAILABLE')));
  ensurePersistentPlayerYard(p,{now:NOW+12*H,simulate:true,...options});
  assert.deepEqual(p.yard.bowls[0],{id:kind==='bowl'?'bowl-2':'bowl-1',foodId:null,servings:0,placedAt:null,expiresAt:null,unknown:{keep:7}});
 }
});

test('helper callback absence, rejection, throw or async result cannot consume inventory in the pure kernel',()=>{
 const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:'kibble'};
 const state=inspectPlayerYard(p,{now:NOW}).state;
 for(const policy of [undefined,()=>({ok:false}),()=>{throw Error('unavailable');},()=>Promise.resolve({ok:true})]){
  const result=advanceYard(state,NOW+H,{autoRefillPolicy:policy});assert.deepEqual(result.player.yard.foodInventory,state.player.yard.foodInventory);assert.deepEqual(result.player.yard.bowls,state.player.yard.bowls);
 }
});

test('public food/bowl capabilities mirror validated bindings and never infer support from saved ownership',()=>{
 const p=player(),r=registry();delete r.foodBindings.berry_plate;
 const value=publicPersistentYard(p,{now:NOW,mediaRegistry:r}).supportedBindings;
 assert.equal(value.foods.kibble.buy,true);assert.equal(value.foods.berry_plate.buy,false);assert.equal(value.foods.berry_plate.set,false);
 assert.equal(value.foods.bonito_bowl.set,true);assert.equal(value.bowls['bowl-1'].set,true);assert.equal(value.bowls['bowl-2'].set,false);
 assert.deepEqual(value.bowls['bowl-1'].anchor,{x:25,y:83});assert.equal(value.bowls['bowl-2'].autoRefill,false);
 assert.equal(foodBindingReady('future_dish',r),false);assert.equal(bowlBindingReady('bowl-2',r),false);
});

test('a helper refill during a purchased-food command advances once and never repeats on receipt replay',()=>{
 const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:'bonito_bowl'};
 const before=copy(p.yard.foodInventory),archiveSource=copy(p.yard);
 const result=invoke(p,'yard.buyFood',{foodId:'berry_plate',qty:2},'helper-with-purchase',{now:NOW+H});
 assert.equal(result.status,200);assert.equal(p.yard.foodInventory.bonito_bowl,before.bonito_bowl-1);
 assert.equal(p.yard.foodInventory.berry_plate,before.berry_plate+2);assert.equal(p.yard.currencies.treats,4760);
 assert.equal(p.yard.bowls[0].placedAt,NOW+H);assert.equal(Object.keys(p._yardV2.runtime.commandReceipts).length,1);
 assert.deepEqual(p._yardV2.migration.rawBackup.yard,archiveSource);
 const loaded=JSON.parse(JSON.stringify(p)),once=copy(loaded);
 const replay=invoke(loaded,'yard.buyFood',{foodId:'berry_plate',qty:2},'helper-with-purchase',{now:NOW+48*H});
 assert.equal(replay.replayed,true);assert.deepEqual(loaded,once);
 const conflict=invoke(loaded,'yard.buyFood',{foodId:'berry_plate',qty:3},'helper-with-purchase',{now:NOW+48*H});
 assert.equal(conflict.status,409);assert.deepEqual(loaded,once);
});

test('supported preferred food with zero stock falls back to the first supported stocked catalog food',()=>{
 const p=player();p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:true,preferredFoodId:'berry_plate'};p.yard.foodInventory.berry_plate=0;
 ensurePersistentPlayerYard(p,{now:NOW+H,simulate:true});
 assert.equal(p.yard.bowls[0].foodId,'kibble');assert.equal(p.yard.foodInventory.kibble,9);assert.equal(p.yard.foodInventory.bonito_bowl,10);
 assert.equal(p.yard.helper.preferredFoodId,'berry_plate');
});
