import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FOOD_BINDINGS,BOWL_BINDINGS,foodVesselExclusion,foodBowlPresentation,YARD_FOOD_MEDIA_REVISION} from '../game-logic/yard-v2/food-media.mjs';
import {YARD_FOODS} from '../game-logic/yard-catalog.js';
import {getMikaServerOptions,MIKA_SCENE,MIKA_PLACEMENT_SUGGESTIONS} from '../game-logic/yard-v2/mika-media.mjs';
import {overlaps} from '../game-logic/yard-v2/geometry.mjs';
import stills from '../public/assets/yard-mika/still-layer-contract.json' with {type:'json'};
import media from '../public/assets/yard-mika/runtime-media.json' with {type:'json'};

test('three authored dish bindings retain source IDs and carry one versioned runtime contract',()=>{
  assert.deepEqual(Object.keys(FOOD_BINDINGS),Object.keys(YARD_FOODS));
  assert.equal(media.foodMediaRevision,YARD_FOOD_MEDIA_REVISION);
  assert.deepEqual(Object.keys(BOWL_BINDINGS),['bowl-1']);
  for(const [id,binding]of Object.entries(FOOD_BINDINGS)){
    assert.equal(binding.presentationReady,true,id);
    assert.equal(binding.cost,undefined,'art cannot override source economy');
    assert.ok(stills[binding.filledStillId]);assert.ok(stills[binding.emptyStillId]);
    assert.deepEqual(stills[binding.filledStillId].pivotPx,stills['kibble-bowl-clean'].pivotPx);
    assert.equal(stills[binding.filledStillId].worldPixelScale,100);
  }
});
test('bowl rendering selects the exact food and never borrows a filled saved second bowl',()=>{
  for(const id of Object.keys(FOOD_BINDINGS)){
    const bowls=[{id:'bowl-1',foodId:id,servings:1},{id:'bowl-2',foodId:'kibble',servings:4}];
    const before=JSON.stringify(bowls),v=foodBowlPresentation(bowls);
    assert.equal(v.length,1);assert.equal(v[0].stillId,FOOD_BINDINGS[id].filledStillId);
    assert.equal(v[0].foodId,id);assert.deepEqual(v[0].anchor,{x:25,y:83});assert.equal(JSON.stringify(bowls),before);
  }
  const empty=foodBowlPresentation([{id:'bowl-1',foodId:null,servings:0},{id:'bowl-2',foodId:'bonito_bowl',servings:6}]);
  assert.equal(empty[0].stillId,'kibble-bowl-empty');assert.equal(empty[0].foodId,null);
  for(const id of ['future_food','__proto__','constructor']){
    const v=foodBowlPresentation([{id:'bowl-1',foodId:id,servings:3}]);
    assert.equal(v[0].preservedUnsupported,true);assert.equal(v[0].foodId,null);
  }
  assert.deepEqual(foodBowlPresentation([{id:'__proto__',foodId:'kibble',servings:3}]),[]);
});
test('vessel exclusion contains every measured food mesh before and after a refill',()=>{
  const e=foodVesselExclusion(),anchor=BOWL_BINDINGS['bowl-1'].anchor;
  assert.deepEqual(MIKA_SCENE.exclusions,[e]);
  for(const {worldBounds:b}of Object.values(FOOD_BINDINGS)){
    assert.ok(e.x<=anchor.x+b.min[0]*8);assert.ok(e.y<=anchor.y+b.min[1]*8);
    assert.ok(e.x+e.width>=anchor.x+b.max[0]*8);assert.ok(e.y+e.height>=anchor.y+b.max[1]*8);
  }
  assert.equal(overlaps(e,{x:28.7,y:82.9,width:.1,height:.2}),true,'berry rim extends beyond the old 28.6 bound');
});
test('actual full-stay preflight supports all three foods with the same safe motion; unknown sockets fail closed',()=>{
  const opts=getMikaServerOptions(),yard={remodel:'meadow',expansion:{level:1},placedGoodies:Object.entries(MIKA_PLACEMENT_SUGGESTIONS).map(([id,p])=>({goodieId:id,slotId:id,...p,condition:'new',uses:0}))};
  const before=JSON.stringify(yard);
  for(const p of yard.placedGoodies){
    const binding=opts.mediaRegistry.bindings.find(b=>b.goodieId===p.goodieId),plans=[];
    const candidate={at:100000,leavesAt:100000+45*60000,slotId:p.slotId,placement:p,yard,active:[],reserved:[]};
    for(const foodId of Object.keys(FOOD_BINDINGS)){
      const result=opts.preflight({...candidate,bowl:{id:'bowl-1',foodId}},binding);
      assert.equal(result.ok,true,`${p.goodieId}/${foodId}/${result.code}`);plans.push(result.plan);
    }
    assert.deepEqual(plans[0],plans[1]);assert.deepEqual(plans[0],plans[2]);
    for(const bowlId of [undefined,'bowl-2','future-bowl','__proto__']){
      assert.equal(opts.preflight({...candidate,bowl:{id:bowlId,foodId:'kibble'}},binding).code,'BOWL_PRESENTATION_UNAVAILABLE');
    }
    assert.equal(opts.preflight({...candidate,bowl:{id:'bowl-1',foodId:'future_food'}},binding).code,'FOOD_PRESENTATION_UNAVAILABLE');
  }
  assert.equal(JSON.stringify(yard),before);
});
test('new runtime dish bytes match their inspected standalone WebP sources',async()=>{
  for(const id of ['berry_plate','bonito_bowl']){
    const key=FOOD_BINDINGS[id].filledStillId,bytes=await readFile(new URL(`../public/assets/yard-mika/${key}.webp`,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),stills[key].webpSha256);
    assert.ok(bytes.length<20000);assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
});
test('food controls send the selected food/bowl pair and retain 44px select targets',async()=>{
  const source=await readFile(new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/games/companion-yard-v2/courtyard.css',import.meta.url),'utf8');
  assert.match(source,/act\('yard\.setFood',\{bowlId:b\.id,foodId\}\)/);
  assert.match(source,/bindings\.bowls\?\.\[b\.id\]\?\.set===true/);
  assert.match(source,/className="cy-food-select" aria-label=/);
  assert.match(css,/\.cy-food-select\{[^}]*min-height:44px/);
});
