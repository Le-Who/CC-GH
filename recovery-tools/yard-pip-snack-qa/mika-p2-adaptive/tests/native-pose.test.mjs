import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {sampleMikaLocomotion} from '../src/mika-locomotion.mjs';
const vendor=new URL('../browser/vendor/three/',import.meta.url);
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier==='three'?new URL('build/three.module.js',vendor).href:specifier,context);}});
const THREE=await import('three');
const {GLTFLoader}=await import(new URL('addons/loaders/GLTFLoader.js',vendor));
const {createMikaNativePoseDriver}=await import('../src/mika-native-pose.mjs');
const calibration=JSON.parse(readFileSync(new URL('../src/mika-p2-calibration.json',import.meta.url)));
const fixture=new URL('../browser/',import.meta.url);
const expected=JSON.parse(readFileSync(new URL('expected.json',fixture)));
const bytes=readFileSync(new URL('models/p2.glb',fixture));
assert.equal(createHash('sha256').update(bytes).digest('hex'),calibration.sourceSha256['export-check/Mika-N1-continuous-bend-P2.glb']);
const fresh=()=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');

test('one native scene root and parent-local bones reproduce original and mirror skin witnesses',async()=>{
  const gltf=await fresh(),driver=createMikaNativePoseDriver(THREE,gltf,calibration);
  const scene=new THREE.Scene();scene.add(driver.root);
  const body=driver.skinned.find(m=>m.geometry.attributes.position.count===expected.variants.p2.mainSkinVertices);
  assert.ok(body);assert.equal(body.skeleton.bones.length,22);
  for(const [variant,mirror]of [['p2',false],['mirror',true]])for(const pose of expected.variants[variant].poses){
    const sample=sampleMikaLocomotion({kind:'accepted-p2-reference',mirror},calibration,pose.time);
    driver.apply(sample);scene.updateMatrixWorld(true);
    assert.ok(driver.root.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...pose.root))<1e-6,'root transforms once');
    for(let i=0;i<expected.variants[variant].vertexIndices.length;i++){
      const p=body.getVertexPosition(expected.variants[variant].vertexIndices[i],new THREE.Vector3()).applyMatrix4(body.matrixWorld);
      assert.ok(p.distanceTo(new THREE.Vector3(...pose.points[i]))<.001,`${variant}/${pose.time}/vertex${i}: ${p.toArray()} vs ${pose.points[i]}`);
    }
  }
});

test('all native skin vertices match baked original/mirror and repeated/fresh sampling does not accumulate scale',async()=>{
  const gltf=await fresh(),driver=createMikaNativePoseDriver(THREE,gltf,calibration),scene=new THREE.Scene();scene.add(driver.root);
  let maximum=0,compared=0;
  for(const [variant,mirror]of [['p2',false],['mirror',true]]){
    const sourceBytes=readFileSync(new URL(expected.variants[variant].file,fixture));
    assert.equal(createHash('sha256').update(sourceBytes).digest('hex'),expected.variants[variant].sha256);
    const baked=await new GLTFLoader().parseAsync(sourceBytes.buffer.slice(sourceBytes.byteOffset,sourceBytes.byteOffset+sourceBytes.byteLength),'');
    const mixer=new THREE.AnimationMixer(baked.scene),action=mixer.clipAction(baked.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
    const nativeMeshes=new Map();baked.scene.traverse(o=>{if(o.isSkinnedMesh)nativeMeshes.set(o.name,o);});
    for(const pose of expected.variants[variant].poses){
      driver.apply(sampleMikaLocomotion({kind:'accepted-p2-reference',mirror},calibration,pose.time));
      action.reset().play();mixer.setTime(pose.time);baked.scene.updateMatrixWorld(true);
      for(const mesh of nativeMeshes.values())mesh.skeleton.update();
      for(const mesh of driver.skinned){
        const source=nativeMeshes.get(mesh.name);assert.ok(source);
        assert.equal(mesh.geometry.attributes.position.count,source.geometry.attributes.position.count);
        for(let i=0;i<mesh.geometry.attributes.position.count;i++){
          const actual=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),want=source.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(source.matrixWorld);
          maximum=Math.max(maximum,actual.distanceTo(want));compared++;
        }
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(baked.scene);
  }
  assert.ok(maximum<.001,`all-mesh maximum ${maximum}, ${compared} vertices`);
  const sample=t=>sampleMikaLocomotion({kind:'accepted-p2-reference'},calibration,t);
  const capture=()=>driver.skinned.map(mesh=>({name:mesh.name,point:mesh.getVertexPosition(0,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray(),bones:mesh.skeleton.bones.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])}));
  driver.apply(sample(2.25));const first=capture();driver.apply(sample(4));driver.apply(sample(0));driver.apply(sample(2.25));assert.deepEqual(capture(),first);
  const other=createMikaNativePoseDriver(THREE,await fresh(),calibration);scene.add(other.root);other.apply(sample(2.25));
  for(let i=0;i<driver.skinned.length;i++)assert.deepEqual(other.skinned[i].getVertexPosition(0,new THREE.Vector3()).applyMatrix4(other.skinned[i].matrixWorld).toArray(),first[i].point);
  console.log(JSON.stringify({kind:'native-all-skin-parity',maximumVertexWorldError:maximum,comparedVertices:compared,skinMeshes:driver.skinned.length,freshAndRepeated:true}));
});
