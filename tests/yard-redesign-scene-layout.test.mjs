import test from 'node:test';
import assert from 'node:assert/strict';
import {getYardPlayzoneRows} from '../game-logic/yard-playzones.js';
import {cameraBasis, calibrateGround, createCalibratedProjection, maskBoundaryPoints, conservativeMaskStrips, offsetWorldPoint, assertRenderCalibration} from '../src/games/companion-yard-v2/scene-layout.mjs';

const inputs = {cameraDirection: [-9.8058, -1.9612, 17.3205], maskRows: getYardPlayzoneRows('meadow'),
  artSize: {width: 1024, height: 1536}, groundArea: {x: 80, y: 430, width: 860, height: 910}, revision: 'yard-portrait-camera/r2-probe'};
const calibration = calibrateGround(inputs);
const projection = (width=1024,height=1536,artScale=1,artOffset={x:0,y:0}) => createCalibratedProjection(calibration, {width,height,artScale,artOffset});
const near = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-8, `${actual} != ${expected}`);

test('the new camera fits the complete existing world mask centrally without changing saved coordinates', () => {
  const original=structuredClone(inputs), p=projection(), points=maskBoundaryPoints(inputs.maskRows).map(p.project);
  for (const q of points) {assert.ok(q.x>=80-1e-8&&q.x<=940+1e-8);assert.ok(q.y>=430-1e-8&&q.y<=1340+1e-8);}
  assert.ok(Math.max(...points.map(q=>q.y))-Math.min(...points.map(q=>q.y))>900);
  near(Math.max(...points.map(q=>q.x))-Math.min(...points.map(q=>q.x)),860);
  assert.deepEqual(inputs,original);
});

test('every persisted yard point round-trips through uniform artwork fit at phone and landscape sizes', () => {
  for(const args of [[320,568,.31,{x:1,y:-12}],[390,844,.38,{x:0,y:10}],[844,390,.55,{x:90,y:-280}]]) {
    const p=projection(...args);
    for(let x=0;x<=100;x+=5)for(let y=0;y<=100;y+=5){const restored=p.unproject(p.project({x,y}));near(restored.x,x);near(restored.y,y);}
    near(p.artwork.width/p.artwork.height,1024/1536);
    near(p.ppu/calibration.pixelsPerWorld,args[2]);
  }
});

test('keyboard nudges follow physical screen axes with the rotated camera', () => {
  const p=projection(), source={x:54,y:66}, start=p.project(source);
  for(const delta of [{x:8,y:0},{x:-8,y:0},{x:0,y:8},{x:0,y:-8}]) {
    const moved=p.project(offsetWorldPoint(p,source,delta));near(moved.x-start.x,delta.x);near(moved.y-start.y,delta.y);
  }
  assert.deepEqual(source,{x:54,y:66});
});

test('vertical source height has a coherent camera projection and does not alter ground origin', () => {
  const p=projection(), ground=p.project({x:50,y:60}), top=p.project({x:50,y:60,z:1});
  near(top.x,ground.x);near(top.y-ground.y,p.basis.down[2]*p.ppu);assert.ok(top.y<ground.y);
});

test('camera-only source identity is required before a new scene can consume atlas pixels', () => {
  const matching={revision:calibration.revision,cameraDirection:[...calibration.cameraDirection],unitsPerWorld:8};
  assert.equal(assertRenderCalibration(calibration,matching),true);
  for(const wrong of [null,{}, {...matching,revision:'old'}, {...matching,cameraDirection:[5.66,-8,3.97]}, {...matching,cameraDirection:'new'}, {...matching,unitsPerWorld:10}])assert.throws(()=>assertRenderCalibration(calibration,wrong),/do not match/);
});

test('malformed, degenerate and unbounded calibration inputs reject instead of silently stretching', () => {
  for(const camera of [[0,0,1],[1,0,0],[1,0,-1],[1,0,1e-320],[Number.MAX_VALUE,Number.MAX_VALUE,1],[NaN,0,1],'camera',[1,2]])assert.throws(()=>cameraBasis(camera));
  assert.throws(()=>calibrateGround({...inputs,groundArea:{x:80,y:430,width:1000,height:910}}));
  assert.throws(()=>calibrateGround({...inputs,maskRows:[]}));
  assert.throws(()=>projection(390,844,0));
  assert.throws(()=>projection().unproject({x:NaN,y:20}));
});

test('placement ground guide excludes the rejected ledge between differently shaped source rows', () => {
  const rows=getYardPlayzoneRows('meadow'), strips=conservativeMaskStrips(rows);
  // Reviewer witness: mouse center43,24 has footprint38.6..47.4 by22.4..25.6.
  // Raw row12 starts at37, but the validator also requires row13 (starts39.1).
  const contains=(x,y)=>strips.some(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<r.y+r.height);
  assert.equal(contains(38.6,25),false);
  assert.equal(contains(40,25),true);
  for(const strip of strips) {
    const i=strip.y/2;
    for(const row of [rows[i],rows[i+1]])assert.ok(row.some(([lo,hi])=>strip.x>=lo&&strip.x+strip.width<=hi+1e-8));
  }
});
