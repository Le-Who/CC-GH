import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {here,resolveSource,pip} from './config.mjs';
const load=p=>import(pathToFileURL(resolveSource(p)));
const THREE=await load(pip+'vendor/three/build/three.module.js');
const {GLTFLoader}=await load(pip+'vendor/three/addons/loaders/GLTFLoader.js');
const {createAdaptivePoseDriver}=await load(pip+'prototype/adaptive-pose-driver.mjs');
const {sampleR1SavedStay,r1SavedStayGeometry}=await load(pip+'canonical-saved-stay.mjs');
const {createCleanProjection}=await load(pip+'projection.mjs');
const plan=JSON.parse(fs.readFileSync(path.join(here,'qualified-plan.json'))),input=JSON.parse(fs.readFileSync(path.join(here,'qualified-inputs.json'))),capture=JSON.parse(fs.readFileSync(path.join(here,'capture-plan.json')));
const cal=JSON.parse(fs.readFileSync(resolveSource(pip+'data/calibration.json'))),descriptor=JSON.parse(fs.readFileSync(resolveSource(pip+'data/location.json'))),bytes=fs.readFileSync(resolveSource(pip+'assets/pip.glb'));
const geometry=r1SavedStayGeometry(),samples=capture.samples.map(([name,at])=>({name,at,...sampleR1SavedStay(plan,at,{rows:input.rows,geometry})})).filter(s=>s.sample);
function transformValues(g){const values=[];g.scene.traverse(b=>{if(b.isBone)values.push(...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements);});assert(values.every(Number.isFinite));return values;}
const diff=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
async function make(){const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''),frame=new THREE.Group();frame.scale.setScalar(plan.actor.unitsPerSource/12);frame.add(g.scene);frame.updateMatrixWorld(true);const driver=createAdaptivePoseDriver(THREE,g,cal,{unitsPerSource:plan.actor.unitsPerSource,sourceFrame:frame});return {g,frame,driver,apply(s){driver.apply(s);return transformValues(g);},dispose(){driver.dispose();const gs=new Set(),ms=new Set();g.scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])ms.add(m);});for(const q of [...gs,...ms])q.dispose();}};}
const fresh=[];for(const row of samples){const m=await make();fresh.push(m.apply(row.sample));m.dispose();}
const m=await make();let maxRepeat=0,maxScrub=0,maxFresh=0;
for(let i=0;i<samples.length;i++){const v=m.apply(samples[i].sample);maxFresh=Math.max(maxFresh,diff(v,fresh[i]));for(let n=0;n<100;n++)maxRepeat=Math.max(maxRepeat,diff(v,m.apply(samples[i].sample)));}
for(const i of [...samples.keys()].reverse())maxScrub=Math.max(maxScrub,diff(fresh[i],m.apply(samples[i].sample)));
for(const i of [0,14,3,12,1,9,2,17,5,8,0,17].filter(i=>i<samples.length))maxScrub=Math.max(maxScrub,diff(fresh[i],m.apply(samples[i].sample)));
const numerical=[];
for(const row of samples){m.apply(row.sample);const v=new THREE.Vector3(),points=[];let minZ=Infinity; m.g.scene.traverse(mesh=>{if(!mesh.isMesh)return;const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);const point={x:v.x*12,y:-v.z*12,z:v.y*12};minZ=Math.min(minZ,point.z);points.push(point);}});
 const projected=capture.viewports.map(({width,height,deviceScaleFactor})=>{const p=createCleanProjection(descriptor,width,height,{focus:plan.inspectionPlan.target});let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const v of points){const q=p.project(v);minX=Math.min(minX,q.x);minY=Math.min(minY,q.y);maxX=Math.max(maxX,q.x);maxY=Math.max(maxY,q.y);}return {width,height,deviceScaleFactor,scale:p.scale,art:p.art,bounds:{minX,minY,maxX,maxY},fullyOutsideArt:minY>=p.art.y+p.art.height||maxY<=p.art.y||minX>=p.art.x+p.art.width||maxX<=p.art.x};});
 numerical.push({name:row.name,at:row.at,phase:row.phase,intention:row.sample.intention,root:row.sample.world.root,minZCanonical:minZ,vertices:points.length,projected});
}
const boundaries=new Set([plan.retreatAt,plan.releaseAt,plan.departureAt,...plan.inspectionPlan.phases.slice(0,3).flatMap(p=>[p.startMs,p.endMs]),...plan.inspectionPlan.episodes.flatMap(e=>[e.startMs,e.endMs])].filter(t=>t>plan.arrivedAt&&t<plan.departureAt));
for(const [stages,start]of [[plan.inspectionPlan.entranceStages,plan.arrivedAt],[plan.inspectionPlan.approachStages,plan.inspectionPlan.phases[1].startMs],[plan.retreatStages,plan.retreatAt],[plan.exitStages,plan.departureAt]]){let at=start;for(const stage of stages){at+=Math.ceil(stage.route.totalMs);if(at<plan.leavesAt)boundaries.add(at);}}
const boundaryChecks=[];for(const at of [...boundaries].sort((a,b)=>a-b)){const left=sampleR1SavedStay(plan,at-.001,{rows:input.rows,geometry}),right=sampleR1SavedStay(plan,at,{rows:input.rows,geometry});if(!left.sample||!right.sample)continue;boundaryChecks.push({at,left:left.phase,right:right.phase,maxNativeTransformDelta:diff(m.apply(left.sample),m.apply(right.sample))});}
const maxBoundaryDelta=Math.max(...boundaryChecks.map(x=>x.maxNativeTransformDelta));
m.dispose();
const report={scope:'CPU actual pinned GLB and current adaptive pose driver. All 11 bones local translation/quaternion/scale and world matrices; source frame scale 16/12. Not native pixels, clipping, continuous duration or artistic acceptance.',visitId:plan.visitId,sampleCount:samples.length,repeatedEvaluations:samples.length*100,valuesPerPose:fresh[0].length,maxRepeat,maxScrub,maxFresh,passed:[maxRepeat,maxScrub,maxFresh].every(x=>x<1e-10),maxBoundaryDelta,boundaryChecks,numerical};
fs.writeFileSync(path.join(here,'cpu-qualification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,numerical:undefined,boundaryChecks:undefined}));assert.equal(report.passed,true);
