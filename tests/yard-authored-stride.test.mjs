import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import fixture from './fixtures/yard-mochi-r1/authored-stride.json' with {type:'json'};
import {createAuthoredStrideSampler} from '../game-logic/yard-v2/media/authored-stride.mjs';
import {ACTOR_PROFILES,resolveActorProfile} from '../game-logic/yard-v2/actor-profiles.mjs';
const copy=structuredClone,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('Mochi fixture retains its audited source hashes and remains unregistered',()=>{
  const bytes=readFileSync(new URL('./fixtures/yard-mochi-r1/authored-stride.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'5d78d77970c4defa63e478f8aa3e9559edddc4b6f623989aeda8889c314c02a8');
  for(const field of ['posesSha256','rigSha256','styleSha256'])assert.match(fixture.source[field],/^[a-f0-9]{64}$/);
  assert.equal(fixture.source.denseSkinSamples,101);
  assert.ok(fixture.source.minimumSolidZ>-.003);
  assert.ok(fixture.source.maxGroundedSoleRigidError<1e-5);
  assert.ok(fixture.source.maxLocalEndpointMeshError<1e-5);
  assert.equal(fixture.playbackReady,false);assert.equal(fixture.runtimeActivated,false);
  assert.deepEqual(Object.keys(ACTOR_PROFILES),['mika']);
  assert.equal(resolveActorProfile({id:'mochi',revision:'mochi-hop-r1'}),null);
});

test('every 20 Hz pose uses its exact authored root rather than linear phase times stride',()=>{
  const s=createAuthoredStrideSampler(fixture);
  for(const row of fixture.frames.slice(0,-1)){
    const actual=s.sample(row.atMs);
    assert.equal(actual.frameIndex,row.frameIndex);assert.equal(actual.phase,row.atMs/1000);
    assert.equal(actual.distanceWorld,row.distanceWorld);close(actual.continuousDistanceWorld,row.distanceWorld);
    if(row.atMs<950)assert.equal(s.sample(row.atMs+49.9).distanceWorld,row.distanceWorld);
  }
  const crouch=s.sample(200);close(crouch.distanceWorld,.005);
  assert.ok(Math.abs(crouch.distanceWorld-fixture.strideWorld*.2)>.09);
  assert.ok(s.sample(400).distanceWorld>0);
});

test('root anticipation/settle reversal is preserved and cannot be inverted as time',()=>{
  const s=createAuthoredStrideSampler(fixture);
  assert.ok(s.sample(50).distanceWorld<0);
  assert.ok(s.sample(950).distanceWorld>fixture.strideWorld);
  assert.ok(fixture.rootExtentWorld[0]<0&&fixture.rootExtentWorld[1]>.48);
  for(let time=0;time<1000;time++){
    const a=s.sample(time),row=fixture.frames[a.frameIndex];
    assert.equal(a.distanceWorld,row.distanceWorld);
    close(a.continuousDistanceWorld,fixture.rootSamples[time].distanceWorld);
  }
});

test('three authored cycles preserve a continuous root seam and canonical end stance',()=>{
  const s=createAuthoredStrideSampler(fixture);
  for(let cycle=0;cycle<3;cycle++)for(const row of fixture.frames.slice(0,-1)){
    const a=s.sample(cycle*1000+row.atMs,{cycles:3});
    assert.equal(a.cycle,cycle);assert.equal(a.frameIndex,row.frameIndex);
    close(a.distanceWorld,cycle*.48+row.distanceWorld);
  }
  for(const time of [3000,3001,99999]){
    const a=s.sample(time,{cycles:3});assert.equal(a.complete,true);
    assert.equal(a.frameIndex,0);assert.equal(a.phase,0);close(a.distanceWorld,1.44);
  }
  assert.equal(s.sample(-2).sampledTimeMs,0);
  assert.equal(s.sample(1000,{cycles:3}).complete,false);
});

test('the sampler owns a frozen defensive contract and survives serialization without changing timing',()=>{
  const c=copy(fixture),s=createAuthoredStrideSampler(c);c.frames[4].distanceWorld=800;
  assert.equal(s.sample(200).distanceWorld,fixture.frames[4].distanceWorld);
  assert.throws(()=>{s.contract.frames[4].distanceWorld=800;},TypeError);
  const restored=createAuthoredStrideSampler(JSON.parse(JSON.stringify(s.contract)));
  for(const time of [0,52,200,491,950,1000,2349,3000])assert.deepEqual(s.sample(time,{cycles:3}),restored.sample(time,{cycles:3}));
});

test('malformed/incoherent timing, root data and insufficient envelopes fail closed',()=>{
  const edits=[c=>c.frames[2].atMs=0,c=>c.frames[4].frameIndex=99,
    c=>c.frames[0].atMs=1,c=>c.rootSamples[0].atMs=1,
    c=>c.frames.at(-1).atMs=999,c=>c.rootSamples.at(-1).atMs=999,
    c=>c.frames[2].distanceWorld=NaN,c=>c.rootSamples[200].distanceWorld=Infinity,
    c=>c.frames[4].distanceWorld=.3,c=>c.rootSamples[0].distanceWorld=.2,
    c=>c.rootExtentWorld=[0,.48],c=>c.rootExtentWorld=[1,0],
    c=>c.durationMs=0,c=>c.strideWorld=-.1,c=>c.frames=[]];
  for(const edit of edits){const c=copy(fixture);edit(c);assert.throws(()=>createAuthoredStrideSampler(c),/authored stride contract/);}
  const s=createAuthoredStrideSampler(fixture);
  for(const time of [NaN,Infinity,'50'])assert.throws(()=>s.sample(time),/stride time/);
  for(const cycles of [0,-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>s.sample(20,{cycles}),/cycle count/);
});
