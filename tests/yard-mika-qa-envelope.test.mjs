import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {sampleMikaLocomotion} from '../src/games/companion-yard-v2/mika-qa/mika-locomotion.mjs';
import {boundMikaPose} from '../src/games/companion-yard-v2/mika-qa/mika-envelope.mjs';
const vendor=new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/',import.meta.url);
registerHooks({resolve(s,c,n){return n(s==='three'?new URL('build/three.module.js',vendor).href:s,c);}});
const THREE=await import('three'),{GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
const {createMikaNativePoseDriver}=await import('../src/games/companion-yard-v2/mika-qa/mika-native-pose.mjs');
const cal=JSON.parse(readFileSync(new URL('../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json',import.meta.url))),envelope=JSON.parse(readFileSync(new URL('../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json',import.meta.url)));
test('joint-corner pose envelope contains every evaluated native skin vertex',async()=>{
  const bytes=readFileSync(new URL('../public/assets/yard-mika-p2-qa/p2.glb',import.meta.url)),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const driver=createMikaNativePoseDriver(THREE,gltf,cal),v=new THREE.Vector3(),C=new THREE.Matrix4().makeRotationX(Math.PI/2);
  for(const mirror of [false,true])for(const t of [0,.375,.75,1.5,2.25,3,3.875,4]){
    const sample=sampleMikaLocomotion({kind:'accepted-p2-reference',mirror},cal,t),box=boundMikaPose(sample,envelope);driver.apply(sample);
    const inverseRoot=new THREE.Matrix4().makeRotationZ(-sample.root.heading).multiply(new THREE.Matrix4().makeTranslation(...sample.root.position.map(x=>-x)));
    for(const mesh of driver.skinned)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(C).applyMatrix4(inverseRoot);
      for(let j=0;j<3;j++)assert.ok(v.getComponent(j)>=box.min[j]&&v.getComponent(j)<=box.max[j],`${mirror}/${t}/${mesh.name}/${i}/${j}`);
    }
  }
});
