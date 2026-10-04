import test from 'node:test';
import assert from 'node:assert/strict';
import {groundCoverageAllowed} from '../game-logic/yard-v2/ground-coverage.mjs';
import {deepFreeze} from '../game-logic/yard-v2/util.mjs';
import {getYardPlayzoneRows} from '../game-logic/yard-playzones.js';
import {FAMILY_ASSETS} from '../game-logic/yard-v2/media/family-assets.mjs';
import {createAuthoredMotionGround} from '../game-logic/yard-v2/media/authored-motion-ground.mjs';
const box=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const compare=(source,origin={x:0,y:0},remodel='meadow',options={unitsPerWorld:1})=>{
 const mutable=structuredClone(source),frozen=deepFreeze(structuredClone(source));
 const exact=groundCoverageAllowed(mutable,origin,remodel,options);
 assert.equal(groundCoverageAllowed(frozen,origin,remodel,options),exact);
 assert.equal(groundCoverageAllowed(frozen,origin,remodel,options),exact,'repeat immutable-index use');
 return exact;
};
test('whole-source bounds cannot hide a tiny forbidden sole or obstacle in a large bound',()=>{
 const polygons=[box(15,60,1,1),box(85,60,1,1),box(50,60,.002,.002)];
 assert.equal(compare(polygons),true);
 assert.equal(compare(polygons,{x:0,y:0},'meadow',{unitsPerWorld:1,obstacles:[{x:50.0005,y:60.0005,width:.001,height:.001}]}),false);
 const forbidden=[box(15,60,1,1),box(85,60,1,1),box(10.2,68,.002,.002)];
 assert.equal(compare(forbidden),false);
});
test('concave strip steps and holes always retain exact polygon coverage',()=>{
 // Each triangle vertex is in ground, but its left edge crosses a concave step.
 assert.equal(compare([[[38.5,24],[40,25.9],[38.5,28]]]),false);
 assert.equal(compare([box(9,67.5,2.5,1)]),false);
 // Empty space between separate soles may cross a hole: conservative bound
 // failure must fall back, rather than reject a valid set of soles.
 assert.equal(compare([box(9,67.5,.5,.5),box(11.2,67.5,.5,.5)]),true);
});
test('edge contact, tiny overlaps and fixed-epsilon ground boundaries match the original predicate',()=>{
 const p=[box(40,60,1,1)];
 for(const shift of [-1e-7,-1e-9,0,1e-9,1e-7,.1]){
  compare(p,{x:0,y:0},'meadow',{unitsPerWorld:1,obstacles:[{x:41+shift,y:60,width:1,height:1}]});
 }
 assert.equal(compare(p,{x:0,y:0},'meadow',{unitsPerWorld:1,obstacles:[{x:41,y:60,width:1,height:1}]}),true);
 for(const remodel of ['meadow','moon_garden','tea_house'])for(const [index,spans] of getYardPlayzoneRows(remodel).entries()){
  for(const [a,b] of spans)for(const x of [a,b])for(const offset of [-1e-7,-1e-9,0,1e-9,1e-7]){
   compare([box(x+offset,index*2-.001,.001,.002)],{x:0,y:0},remodel);
  }
 }
});
test('historical fuzzy clipping extrapolation at both strip edges remains exact',()=>{
 const source=[[[10,59-5e-9],[90,59-15e-9],[50,60]]];
 assert.equal(compare(source),false);
 for(const boundary of [39,41,49,51,59,61,67,69,75,77])for(const sign of [-1,1]){
  for(const delta of [1e-12,1e-10,1e-9,5e-9,1e-8,2e-8])for(const unit of [1,8,.125]){
   const row=[[10,boundary+sign*delta],[90,boundary+sign*3*delta],[50,boundary-sign]];
   compare([row.map(([x,y])=>[x/unit,y/unit])],{x:0,y:0},'meadow',{unitsPerWorld:unit});
  }
 }
});
test('obstacle X clipping keeps its historical arithmetic before Y-only separation',()=>{
 for(const boundary of [20,40,60,80])for(const sign of [-1,1]){
  for(const delta of [1e-12,1e-10,1e-9,5e-9,1e-8,2e-8])for(const unit of [1,8,.125]){
   const polygon=[[boundary+sign*delta,60],[boundary+sign*3*delta,80],[boundary-sign,70]];
   for(const y of [54,85])compare([polygon.map(([x,y])=>[x/unit,y/unit])],{x:0,y:0},'meadow',{
    unitsPerWorld:unit,obstacles:[{x:boundary,y,width:1,height:1}]});
  }
 }
});
test('mutable, shallow-frozen, wrapped and invalid inputs retain the exact path',()=>{
 const p=[box(40,60,1,1)];assert.equal(groundCoverageAllowed(p,{x:0,y:0},'meadow',{unitsPerWorld:1}),true);
 Object.freeze(p);p[0][0][0]=-100;assert.equal(groundCoverageAllowed(p,{x:0,y:0},'meadow',{unitsPerWorld:1}),false);
 for(const source of [[{polygon:box(40,60,1,1)}],[{points:box(40,60,1,1)}],[[[40,60],[41,60]]],[[[40,60],[41,60],[NaN,61]]]])compare(source);
 const alias=box(40,60,1,1);alias.polygon=box(-10,60,1,1);assert.equal(compare([alias]),false);
 const point=[40,60],row=[point,[41,60],[41,61],[40,61]],rows=[row];Object.freeze(row);Object.freeze(rows);
 assert.equal(groundCoverageAllowed(rows,{x:0,y:0},'meadow',{unitsPerWorld:1}),true);point[0]=-10;
 assert.equal(groundCoverageAllowed(rows,{x:0,y:0},'meadow',{unitsPerWorld:1}),false);
});
test('every family source facing/motion matches exact clipping across layouts and obstacles',()=>{
 let comparisons=0;
 for(const [actor,data]of Object.entries(FAMILY_ASSETS)){
  const guard=createAuthoredMotionGround(data.ground,{remodel:'meadow'});
  for(const kind of ['hop','left90','right90','rest','stand'])for(const facing of [0,2,4,6]){
   const source=guard.coverage(kind,facing).polygons,mutable=structuredClone(source),frozen=deepFreeze(source);
   for(const remodel of ['meadow','moon_garden','tea_house'])for(const origin of [{x:50,y:60},{x:10,y:68},{x:38.5,y:26},{x:90,y:40},{x:20,y:90},{x:0,y:0}]){
    for(const obstacles of [[],[{x:50,y:60,width:.002,height:.002}],[{x:origin.x+1,y:origin.y-1,width:.1,height:2}]]){
     const options={unitsPerWorld:data.ground.unitsPerWorld,obstacles};
     assert.equal(groundCoverageAllowed(frozen,origin,remodel,options),groundCoverageAllowed(mutable,origin,remodel,options),`${actor}:${kind}:${facing}:${remodel}:${JSON.stringify(origin)}`);comparisons++;
    }
   }
  }
 }
 assert.equal(comparisons,4320);
});
