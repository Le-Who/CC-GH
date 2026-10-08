import test from 'node:test';import assert from 'node:assert/strict';
import{configureMikaYardCamera}from'../src/games/companion-yard-v2/mika-qa/mika-yard-camera.mjs';
import{createProjection,CAMERA_DIRECTION}from'../src/games/companion-yard-v2/projection.mjs';
import * as THREE from '../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js';
test('native camera matches the released normal Yard projection, without fitting or recentering',()=>{
 for(const[width,height]of[[320,420],[390,650],[844,252]]){
  const projection=createProjection(width,height),camera=new THREE.OrthographicCamera();configureMikaYardCamera(THREE,camera,projection,CAMERA_DIRECTION);
  for(const p of[{x:50,y:66,z:0},{x:30,y:42,z:.4},{x:70,y:80,z:1.8}]){
   const expected=projection.project(p),actual=new THREE.Vector3(p.x/8,p.z,-p.y/8).project(camera);
   assert.ok(Math.abs((actual.x+1)*width/2-expected.x)<1e-9);assert.ok(Math.abs((1-actual.y)*height/2-expected.y)<1e-9);
  }
 }
});
