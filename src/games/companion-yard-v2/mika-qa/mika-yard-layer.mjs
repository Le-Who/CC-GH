import calibration from './mika-p2-calibration.json' with {type:'json'};
import envelope from './mika-p2-skin-envelope.json' with {type:'json'};
import mask from './meadow-mask.json' with {type:'json'};
import {createMikaNativePoseDriver} from './mika-native-pose.mjs';
import {planMikaYardQaCruise,sampleMikaYardQaCruise} from './mika-yard-route.mjs';
import {configureMikaYardCamera} from './mika-yard-camera.mjs';
const ASSET='/assets/yard-mika-p2-qa/p2.glb',BYTES=3671320,BINARY_BYTES=3624236,MODEL_CPU_BOUND=BYTES*3;
const defaultDependencies=()=>Promise.all([import('../pip-prototype/vendor/three/build/three.module.js'),import('../pip-prototype/vendor/three/addons/loaders/GLTFLoader.js'),import('../pip-prototype/grounding-recipe.mjs')]);
const snapshotLayout=value=>JSON.stringify([value?.yard?.remodel,(value?.yard?.placedGoodies??[]).map(p=>[p.slotId,p.goodieId,p.x,p.y,p.rotationZ??0,p.condition]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),value?.yardRuntime?.display?.placements??[],(value?.yard?.bowls??[]).map(b=>b.id)]);

/** Read-only normal-Yard geometry, including every visible prop and exclusion.
 * Unknown prop footprints or active visitors block this deliberately narrow QA.
 */
export function mikaQaLayout(view,sceneGeometry){
 if(view?.yard?.remodel!=='meadow'||view.pets?.length||view.props?.some(p=>!p.supported||!p.drawStandalone))throw Error('QA_LAYOUT_OR_VISITOR_UNSUPPORTED');
 if(view.bowls?.some(b=>b.id!=='bowl-1'))throw Error('QA_BOWL_GEOMETRY_UNSUPPORTED');
 const obstacles=(sceneGeometry.exclusions??[]).map((r,i)=>({id:'fixed:'+i,...r}));
 for(const prop of view.props??[]){
  const shape=sceneGeometry.footprints?.[prop.goodieId],p=prop.transform,a=p?.rotationZ??0;
  if(!shape||![shape.width,shape.height,p?.x,p?.y,a].every(Number.isFinite))throw Error('QA_PROP_FOOTPRINT_UNAVAILABLE');
  const width=Math.abs(Math.cos(a))*shape.width+Math.abs(Math.sin(a))*shape.height,height=Math.abs(Math.sin(a))*shape.width+Math.abs(Math.cos(a))*shape.height;
  obstacles.push({id:prop.slotId,goodieId:prop.goodieId,x:p.x-width/2,y:p.y-height/2,width,height,condition:prop.condition??null});
 }
 obstacles.sort((a,b)=>a.id.localeCompare(b.id));
 return {remodel:'meadow',maskRows:mask.rows,obstacles};
}

/** One disposable QA draw layer; the existing Courtyard RAF owns all frames.
 * No account commands, visit records, saved identities, timers or second RAF.
 */
export async function createMikaYardQaLayer({signal,cameraDirection,reserveRGBA,fetchImpl=fetch,loadDependencies=defaultDependencies,canvasFactory=()=>document.createElement('canvas'),rendererFactory=null}={}){
 if(typeof reserveRGBA!=='function')throw Error('QA_RESOURCE_OWNER_REQUIRED');
 let THREE,model,driver,renderer,lighting,scene,camera,canvas,disposed=false,graphicsRetired=false,phase='loading',reason=null,plan=null,originStamp=null,lastResult=null,layoutStamp=null,account=null,accountObserved=false,allocatedPixels=0,rgbaBytes=0,modelGPUBytes=0;
 const trace=[];let currentTime=0,frames=0,maximumEnvelopeRadius=0,projectionStamp=null,interruption=null;
 function traceState(){trace.push({phase,reason,time:currentTime,frames});if(trace.length>12)trace.shift();}
 function releaseGraphics(){
  if(graphicsRetired)return;graphicsRetired=true;driver?.dispose();lighting?.dispose();
  const geometries=new Set(),materials=new Set(),skeletons=new Set();model?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.skeleton)skeletons.add(o.skeleton);});
  canvas?.removeEventListener('webglcontextlost',onLost);for(const value of [...skeletons,...geometries,...materials])value.dispose();renderer?.dispose();renderer?.forceContextLoss();if(canvas){canvas.width=0;canvas.height=0;}
  reserveRGBA(0);rgbaBytes=0;model=null;driver=null;renderer=null;lighting=null;scene=null;camera=null;canvas=null;
 }
 function stop(next,why){if(disposed||graphicsRetired)return;phase=next;reason=why;traceState();releaseGraphics();}
 const onHidden=()=>{if(!graphicsRetired&&document.hidden){interruption??='VISIBILITY_INTERRUPTED';if(phase!=='loading')stop('aborted',interruption);}};
 const onLost=event=>{event.preventDefault();stop('aborted','WEBGL_CONTEXT_LOST');};
 const checkLoading=()=>{signal?.throwIfAborted();if(interruption)throw Error(interruption);};
 document.addEventListener('visibilitychange',onHidden);onHidden();
 try{
  checkLoading();
  const loaded=await loadDependencies();THREE=loaded[0];const {GLTFLoader}=loaded[1],{createPipGardenLighting}=loaded[2];
  if(THREE.REVISION!=='186')throw Error('UNQUALIFIED_THREE');checkLoading();
  const response=await fetchImpl(ASSET,{signal});if(!response.ok)throw Error('MIKA_QA_ASSET_UNAVAILABLE');
  const bytes=await response.arrayBuffer();checkLoading();if(bytes.byteLength!==BYTES)throw Error('MIKA_QA_ASSET_SIZE');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==envelope.assetSha256)throw Error('MIKA_QA_ASSET_HASH');
  checkLoading();const gltf=await new GLTFLoader().parseAsync(bytes,'');model=gltf.scene;checkLoading();
  if(gltf.parser.json.images?.length)throw Error('MIKA_QA_TEXTURE_NOT_ADMITTED');
  const attributes=new Set(),skeletons=new Set();model.traverse(o=>{if(o.geometry){for(const a of Object.values(o.geometry.attributes))attributes.add(a);if(o.geometry.index)attributes.add(o.geometry.index);}if(o.skeleton)skeletons.add(o.skeleton);});
  modelGPUBytes=[...attributes].reduce((n,a)=>n+a.array.byteLength,0)+[...skeletons].reduce((n,s)=>{const side=Math.max(4,Math.ceil(Math.sqrt(s.bones.length*4)/4)*4);return n+side*side*16;},0);
  if(modelGPUBytes>8*1024*1024||MODEL_CPU_BOUND+modelGPUBytes>24*1024*1024)throw Error('MIKA_QA_MODEL_BUDGET');
  if(reserveRGBA(16)!==true)throw Error('QA_SURFACE_BUDGET');rgbaBytes=16;allocatedPixels=1;
  canvas=canvasFactory();canvas.width=1;canvas.height=1;renderer=rendererFactory?rendererFactory({THREE,canvas}):new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:false});
  renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=false;
  scene=new THREE.Scene();driver=createMikaNativePoseDriver(THREE,gltf,calibration);scene.add(driver.root);camera=new THREE.OrthographicCamera();
  lighting=createPipGardenLighting({THREE,scene,renderer,target:new THREE.Vector3(50/8,0,-66/8),recipe:'baseline'});
  canvas.addEventListener('webglcontextlost',onLost);phase='waiting-layout';traceState();
 }catch(error){reason=String(error?.message??error);phase=signal?.aborted||interruption?'aborted':'unavailable';releaseGraphics();traceState();}
 function noteSnapshot(snapshot){
  const key=snapshotLayout(snapshot),nextAccount=snapshot?.player?.id??null;
  if(accountObserved&&nextAccount!==account)stop('aborted','ACCOUNT_CHANGED');accountObserved=true;account=nextAccount;
  if(layoutStamp!==null&&layoutStamp!==key)stop('aborted','LAYOUT_CHANGED');layoutStamp=key;
 }
 function frame({view,snapshot,projection,sceneGeometry,stamp,shadow}){
  if(disposed||graphicsRetired)return null;
  try{
   noteSnapshot(snapshot);if(graphicsRetired)return null;
   const layout=mikaQaLayout(view,sceneGeometry),nextProjection=JSON.stringify([projection.width,projection.height,projection.ppu]);
   if(projectionStamp!==null&&projectionStamp!==nextProjection){stop('aborted','VIEWPORT_CHANGED');return null;}projectionStamp=nextProjection;
   if(!plan){plan=planMikaYardQaCruise(layout,calibration,envelope,{acceptSweep:(sweep,vertical)=>sweep.every(p=>[vertical.min,vertical.max].every(z=>{const q=projection.project({...p,z});return q.x>=3&&q.y>=3&&q.x<=projection.width-3&&q.y<=projection.height-3;}))});if(!plan.ok){stop('blocked',plan.reason);return null;}originStamp=stamp;phase='running';traceState();}
   currentTime=Math.max(0,(stamp-originStamp)/1000);
   if(currentTime>plan.duration){stop('complete','FINITE_CRUISE_ENDED_NO_TRANSITION');return null;}
   const result=sampleMikaYardQaCruise(plan,layout,currentTime);if(result.status!=='ready'){stop('aborted',result.reason||result.status);return null;}
   const width=Math.ceil(projection.width),height=Math.ceil(projection.height),pixels=width*height;
   if(pixels!==allocatedPixels||canvas.width!==width||canvas.height!==height){
    // Before allocating, include old+new color/depth/swap estimates in the same
    // normal scene image/surface ledger. No DPR2 extra QA surface is retained.
    if(reserveRGBA(rgbaBytes+pixels*16)!==true){stop('blocked','QA_SURFACE_BUDGET');return null;}
    renderer.setSize(width,height,false);allocatedPixels=pixels;rgbaBytes=pixels*16;reserveRGBA(rgbaBytes);
   }
   configureMikaYardCamera(THREE,camera,projection,cameraDirection);driver.apply(result.sample);
   maximumEnvelopeRadius=Math.max(maximumEnvelopeRadius,result.envelope.radius);lastResult=result;
   return {y:projection.project(result.position).y,draw:ctx=>{
    if(graphicsRetired)return;
    try{const ppu=projection.ppu;shadow(projection.project(result.position),ppu*.55,ppu*.16,.12);
     for(const foot of Object.values(result.sample.contacts))if(foot.contact)shadow(projection.project({x:foot.paw[0]*8,y:foot.paw[1]*8}),ppu*.13,ppu*.045,.2*foot.load);
     renderer.render(scene,camera);ctx.drawImage(canvas,0,0,projection.width,projection.height);frames++;
    }catch(error){stop('aborted',String(error.message));}
   },canvas,get snapshot(){return result;}};
  }catch(error){stop('aborted',String(error.message));return null;}
 }
 return{noteSnapshot,frame,abort:why=>stop('aborted',why),diagnostics:()=>({phase,reason,time:currentTime,frames,unitsPerSource:8,assetSha256:envelope.assetSha256,bones:22,rootOwner:'navigation',normalCamera:true,diagnosticCameraFit:false,plan:plan?.ok?{start:plan.start,heading:plan.heading,turnRadians:plan.turnRadians,duration:plan.duration,sweep:plan.sweep,candidates:plan.candidates}:null,position:lastResult?.position??null,maximumEnvelopeRadius,resources:{rgbaBytes,encodedGLBBytes:BYTES,glbBinaryBytes:BINARY_BYTES,modelCPUUpperBound:MODEL_CPU_BOUND,modelGPUBytes,graphicsRetired,retainedModelGPUBytes:graphicsRetired?0:modelGPUBytes,retainedModelCPUUpperBound:graphicsRetired?0:MODEL_CPU_BOUND,engineObjectOverheadKnown:false,rasterDpr:1},trace:trace.map(r=>({...r})),scope:'QA only; no visit/save/economy mutation; layout change aborts; no entry/arrival transition'}),dispose(){if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',onHidden);canvas?.removeEventListener('webglcontextlost',onLost);releaseGraphics();phase='disposed';traceState();}};
}
