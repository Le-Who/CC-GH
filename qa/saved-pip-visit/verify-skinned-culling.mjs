import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {here,resolveSource,pip} from './config.mjs';
const load=p=>import(pathToFileURL(resolveSource(p)));
const THREE=await load(pip+'vendor/three/build/three.module.js');
const {GLTFLoader}=await load(pip+'vendor/three/addons/loaders/GLTFLoader.js');
const {createAdaptivePoseDriver}=await load(pip+'prototype/adaptive-pose-driver.mjs');
const {configurePipSkinnedVisibility}=await load(pip+'prototype/optional-pip-renderer.mjs');
const {sampleR1SavedStay,r1SavedStayGeometry}=await load(pip+'canonical-saved-stay.mjs');
const {createCleanProjection}=await load(pip+'projection.mjs');
const {configureGardenCamera}=await load(pip+'prototype/surface-placement.mjs');
const plan=JSON.parse(fs.readFileSync(path.join(here,'qualified-plan.json'))),input=JSON.parse(fs.readFileSync(path.join(here,'qualified-inputs.json'))),capture=JSON.parse(fs.readFileSync(path.join(here,'capture-plan.json')));
const cal=JSON.parse(fs.readFileSync(resolveSource(pip+'data/calibration.json'))),descriptor=JSON.parse(fs.readFileSync(resolveSource(pip+'data/location.json'))),bytes=fs.readFileSync(resolveSource(pip+'assets/pip.glb'));
const geometry=r1SavedStayGeometry(),camera=new THREE.OrthographicCamera();
configureGardenCamera(camera,new THREE.Vector3(5.66,9.799775507632814,8),createCleanProjection(descriptor,320,568,{focus:plan.inspectionPlan.target}).renderViewport);
const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
const sample=name=>sampleR1SavedStay(plan,capture.samples.find(([n])=>n===name)[1],{rows:input.rows,geometry}).sample;
async function model(){const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),frame=new THREE.Group(),scene=new THREE.Scene();frame.scale.setScalar(plan.actor.unitsPerSource/12);frame.add(g.scene);scene.add(frame);scene.updateMatrixWorld(true);const meshes=[];g.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});const driver=createAdaptivePoseDriver(THREE,g,cal,{unitsPerSource:plan.actor.unitsPerSource,sourceFrame:frame});return {g,meshes,driver,scene,apply(s){driver.apply(s);scene.updateMatrixWorld(true);}};}
function visibleInTree(object){for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;}
const eligible=model=>model.meshes.filter(o=>visibleInTree(o)&&(!o.frustumCulled||frustum.intersectsObject(o))).length;
const reused=await model();assert.equal(reused.meshes.length,19);
// Reproduce the old renderer's first visible draw outside the garden. These
// cached spheres do not move when the bone-driven actor reaches the prop.
reused.apply(sample('entrance-early'));for(const mesh of reused.meshes)frustum.intersectsObject(mesh);
reused.apply(sample('peek'));assert.equal(eligible(reused),0,'the negative control must reproduce old stale-bound culling');
const matrices=reused.meshes.map(m=>m.matrixWorld.elements.slice());
assert.equal(configurePipSkinnedVisibility(reused.g.scene),19);
assert.equal(eligible(reused),19,'all admitted skinned meshes remain drawable after an off-screen entrance');
assert.deepEqual(reused.meshes.map(m=>m.matrixWorld.elements),matrices,'visibility policy must preserve transforms');
const states=[];
for(const name of ['peek','retreat-mid','neutral-rest','exit-mid']){
 reused.apply(sample(name));const fresh=await model();configurePipSkinnedVisibility(fresh.g.scene);fresh.apply(sample(name));
 assert.equal(eligible(reused),eligible(fresh));assert.equal(eligible(reused),19);
 reused.g.scene.visible=false;assert.equal(eligible(reused),0,'explicit hidden actor must stay hidden');
 reused.g.scene.visible=true;assert.equal(eligible(reused),19,'visibility restore must retain bounded actor');
 states.push({name,reused:eligible(reused),fresh:eligible(fresh),hide:0,show:19});fresh.driver.dispose();
}
reused.driver.dispose();
const report={passed:true,negativeControlReproduced:true,skinnedMeshes:19,states,scope:'Pinned GLB, exact Three Frustum path and production visibility policy. Native pixels remain a separate gate.'};
fs.writeFileSync(path.join(here,'skinned-culling-regression.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
