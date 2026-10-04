import test from 'node:test';
import assert from 'node:assert/strict';
import {exteriorSegments,perimeterPlacements} from './environment-perimeter.mjs';
const perimeter=s=>s.reduce((n,e)=>n+Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y),0);
test('partly shared mask edges disappear without losing exposed boundary',()=>{
  const edges=exteriorSegments([{x:0,y:0,width:10,height:2},{x:2,y:2,width:6,height:2}]);
  assert.equal(perimeter(edges),28);
  assert.equal(edges.some(e=>e.a.y===2&&e.b.y===2&&e.a.x<8&&e.b.x>2),false);
});
test('separate mask islands retain their boundaries',()=>{
  const edges=exteriorSegments([{x:0,y:0,width:2,height:2},{x:4,y:0,width:2,height:2}]);
  assert.equal(perimeter(edges),16);
  assert.equal(edges.some(e=>e.a.x<4&&e.b.x>2),false);
});
test('a hole keeps an inward-facing outside edge',()=>{
  const edges=exteriorSegments([{x:0,y:0,width:6,height:2},{x:0,y:2,width:2,height:2},{x:4,y:2,width:2,height:2},{x:0,y:4,width:6,height:2}]);
  assert.equal(perimeter(edges),32);
  assert.ok(edges.some(e=>e.a.x===2&&e.b.x===2&&e.a.y===2&&e.outward.x===1));
});
test('placements project world outward direction even when projection reflects',()=>{
  const rows=perimeterPlacements([{x:0,y:0,width:10,height:5}],p=>({x:p.x*3,y:-p.y*2}),{spacing:8});
  const top=rows.filter(r=>r.world.y===0);assert.equal(top.length,4);assert.ok(top.every(r=>r.outward.y===1));
  assert.ok(rows.every(r=>Number.isFinite(r.point.x)&&Number.isFinite(r.point.y)));
});
test('invalid dimensions and degenerate projection fail before painting',()=>{
  assert.throws(()=>exteriorSegments([{x:0,y:0,width:-1,height:2}]));
  assert.throws(()=>exteriorSegments([{x:0,y:0,width:3,height:3},{x:1,y:1,width:3,height:3}]),/disjoint interiors/);
  assert.throws(()=>perimeterPlacements([{x:0,y:0,width:1,height:1}],()=>({x:0,y:0})));
});
