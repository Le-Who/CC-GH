import test from 'node:test';
import assert from 'node:assert/strict';
import {createCleanProjection} from '../src/games/companion-yard-v2/pip-prototype/projection.mjs';
import descriptor from '../src/games/companion-yard-v2/pip-prototype/data/location.json' with {type:'json'};
const focus={x:98,y:118},bowl={x:80,y:82,paddingCss:24};
const make=(w,h)=>createCleanProjection(descriptor,w,h,{focus,framing:'top-biased',contextPoints:[bowl]});
test('screenshot-shaped stage keeps upper decoration instead of centering an absent default item',()=>{
 const old=createCleanProjection(descriptor,464,458,{focus}),p=make(464,458);
 assert.ok(old.art.y < -150);
 assert.ok(p.art.y > -40);
 assert.ok(p.art.y-old.art.y > 130);
 assert.ok(p.project(bowl).y+24*p.scale<=458+1e-9);
 assert.equal(p.scale,old.scale);
});
test('ample phone stage begins at artwork top without a blank top gutter',()=>{
 const p=make(378,680);assert.equal(p.art.y,0);assert.ok(p.art.height<=680);
});
test('compact phone and short landscape keep both selected item and bowl visible',()=>{
 for(const [w,h] of [[308,336],[348,590],[378,634],[402,686],[480,194],[756,266],[680,790],[936,560],[1192,510],[464,458]]){
  const p=make(w,h),old=createCleanProjection(descriptor,w,h,{focus});
  assert.equal(p.scale,old.scale);
  for(const point of [focus,bowl]){const q=p.project(point);assert.ok(q.y>0&&q.y<=h-24*p.scale+1e-9,JSON.stringify({w,h,q}));}
  assert.equal(p.renderViewport.x,p.art.x);assert.equal(p.renderViewport.y,p.art.y);
  for(const point of [focus,bowl,{x:72,y:145},{x:120,y:90}]){
   const q=p.unprojectGround(p.project(point));assert.ok(Math.abs(q.x-point.x)<1e-9&&Math.abs(q.y-point.y)<1e-9);
  }
  assert.deepEqual(p.renderViewport.anchorRender,old.renderViewport.anchorRender);
  assert.deepEqual(p.renderViewport.anchorRaster,old.renderViewport.anchorRaster);
  assert.equal(p.renderViewport.pixelsPerRenderUnit,old.renderViewport.pixelsPerRenderUnit);
  assert.deepEqual(p.art,make(w,h).art);
 }
});
test('noncanonical default projection stays identical and lower moved target remains in reach',()=>{
 const p=createCleanProjection(descriptor,464,458,{focus:{x:140,y:80},framing:'top-biased',contextPoints:[bowl]});
 assert.ok(p.project({x:140,y:80}).y<=434+1e-9);
 const old=createCleanProjection(descriptor,464,458,{focus});assert.ok(old.art.y < -150);
});
