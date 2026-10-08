import calibration from './mika-p2-calibration.json' with {type:'json'};
import envelope from './mika-p2-skin-envelope.json' with {type:'json'};
import mask from './meadow-mask.json' with {type:'json'};
import {createMikaNativePoseDriver} from './mika-native-pose.mjs';
import {planMikaYardQaCruise,sampleMikaYardQaCruise} from './mika-yard-route.mjs';
import {bindMikaPersistedItems,planMikaItemArrival,planMikaItemContinuationAsync} from './mika-item-approach.mjs';
import {configureMikaYardCamera} from './mika-yard-camera.mjs';
let nextActorInstance=0;
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
export async function createMikaYardQaLayer({itemApproach=false,continuation=false,signal,yieldPlanning,cameraDirection,reserveRGBA,fetchImpl=fetch,loadDependencies=defaultDependencies,canvasFactory=()=>document.createElement('canvas'),parkedCanvasFactory=()=>document.createElement('canvas'),rendererFactory=null,presentationNow=()=>performance.now()}={}){
 if(typeof reserveRGBA!=='function')throw Error('QA_RESOURCE_OWNER_REQUIRED');
 let THREE,model,driver,renderer,lighting,scene,camera,canvas,disposed=false,graphicsRetired=false,phase='loading',reason=null,plan=null,originStamp=null,lastResult=null,layoutStamp=null,account=null,accountObserved=false,allocatedPixels=0,rgbaBytes=0,modelGPUBytes=0;
 const actorInstance=++nextActorInstance;
 let heldCanvas=null,heldKey=null,heldBytes=0,gpuRenders=0,parkedRasterCopies=0,presentedAction=0,presentedTime=0,activeCommandToken=null;
 let itemCandidate=null,latestSnapshot=null,latestContext=null,actionsStarted=0,actionsCompleted=0,lastActionResult=null,pendingPlanning=null,planningAbort=null,retirementPromise=null,planningMetrics=null;
 continuation=continuation===true&&itemApproach===true;
 const trace=[];let currentTime=0,frames=0,maximumEnvelopeRadius=0,projectionStamp=null,interruption=null;
 function traceState(){trace.push({phase,reason,time:currentTime,frames});if(trace.length>12)trace.shift();}
 function clearHeldFrame(reaccount=true){
  if(heldCanvas){heldCanvas.width=0;heldCanvas.height=0;heldCanvas=null;}heldKey=null;
  if(heldBytes){rgbaBytes-=heldBytes;heldBytes=0;if(reaccount&&!graphicsRetired)reserveRGBA(rgbaBytes);}
 }
 function releaseGraphics(){
  if(graphicsRetired)return;graphicsRetired=true;activeCommandToken=null;clearHeldFrame(false);driver?.dispose();lighting?.dispose();
  const geometries=new Set(),materials=new Set(),skeletons=new Set();model?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.skeleton)skeletons.add(o.skeleton);});
  canvas?.removeEventListener('webglcontextlost',onLost);for(const value of [...skeletons,...geometries,...materials])value.dispose();renderer?.dispose();renderer?.forceContextLoss();if(canvas){canvas.width=0;canvas.height=0;}
  reserveRGBA(0);rgbaBytes=0;model=null;driver=null;renderer=null;lighting=null;scene=null;camera=null;canvas=null;
 }
 function stop(next,why){if(disposed||graphicsRetired)return;planningAbort?.abort(Error(why));phase=next;reason=why;traceState();releaseGraphics();}
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
  latestSnapshot=snapshot;
  const key=snapshotLayout(snapshot),nextAccount=snapshot?.player?.id??null;
  if(accountObserved&&nextAccount!==account)stop('aborted','ACCOUNT_CHANGED');accountObserved=true;account=nextAccount;
  if(layoutStamp!==null&&layoutStamp!==key)stop('aborted','LAYOUT_CHANGED');layoutStamp=key;
 }
 const cameraAdmission=projection=>(sweep,vertical)=>sweep.every(p=>[vertical.min,vertical.max].every(z=>{const q=projection.project({...p,z});return q.x>=3&&q.y>=3&&q.x<=projection.width-3&&q.y<=projection.height-3;}));
 function requestItemArrival(slotId,scope={}){
  const refuse=reason=>lastActionResult={ok:false,reason},immediate=reason=>Promise.resolve(refuse(reason));
  if(!continuation||disposed||graphicsRetired)return immediate('NATIVE_ACTION_UNAVAILABLE');
  if(phase!=='parked'||pendingPlanning||!lastResult||!latestContext)return immediate('NATIVE_ACTOR_NOT_SETTLED');
  const bound=bindMikaPersistedItems(latestSnapshot,latestContext.view);
  if(!bound.ok||bound.key!==latestContext.bound.key){stop('aborted',bound.reason||'NATIVE_ITEM_BINDING_CHANGED');return immediate(reason);}
  if(slotId===itemCandidate.target.slotId)return immediate('ALREADY_ARRIVED');
  const controller=planningAbort=new AbortController(),stopped=structuredClone(lastResult.sample),previousReason=reason;
  activeCommandToken=scope?.commandToken??null;
  const started=performance.now();planningMetrics={slices:0,batches:0,maxBatchMs:0,maxSliceMs:0,cpuMs:0,wallMs:null,cancelled:false};
  phase='planning';reason='NATIVE_PATH_PLANNING';traceState();
  let task;
  task=(async()=>{
   try{
    const candidate=await planMikaItemContinuationAsync(bound,calibration,envelope,stopped,slotId,{acceptSweep:cameraAdmission(latestContext.projection),signal:controller.signal,
     ...(yieldPlanning?{yieldTask:yieldPlanning}:{}),onBatch:ms=>{planningMetrics.batches++;planningMetrics.maxBatchMs=Math.max(planningMetrics.maxBatchMs,ms);},onSlice:(ms,stage)=>{planningMetrics.slices++;planningMetrics.cpuMs+=ms;if(ms>planningMetrics.maxSliceMs){planningMetrics.maxSliceMs=ms;planningMetrics.maxSliceStage=stage;}}});
    // The parked actor kept drawing during yields. Every owner/layout/session
    // interruption retires this request; an old answer cannot revive its model.
    if(controller.signal.aborted||disposed||graphicsRetired||phase!=='planning'||planningAbort!==controller)return refuse(reason||'NATIVE_ACTION_CANCELLED');
    const current=bindMikaPersistedItems(latestSnapshot,latestContext?.view);
    if(!current.ok||current.key!==bound.key){stop('aborted',current.reason||'NATIVE_ITEM_BINDING_CHANGED');return refuse(reason);}
    if(!candidate.ok){activeCommandToken=null;phase='parked';reason=previousReason;traceState();return refuse(candidate.reason);}
    clearHeldFrame();itemCandidate=candidate;plan=candidate.plan;originStamp=null;currentTime=0;phase='running';reason=null;actionsStarted++;traceState();
    return lastActionResult={ok:true,action:actionsStarted,targetSlotId:slotId};
   }catch(error){
    if(controller.signal.aborted||disposed||graphicsRetired)return refuse(reason||'NATIVE_ACTION_CANCELLED');
    activeCommandToken=null;phase='parked';reason=previousReason;traceState();return refuse(String(error.message));
   }finally{
    planningMetrics.wallMs=performance.now()-started;planningMetrics.cancelled=controller.signal.aborted;
    if(planningAbort===controller)planningAbort=null;if(pendingPlanning===task)pendingPlanning=null;
   }
  })();pendingPlanning=task;return task;
 }
 function frame({view,snapshot,projection,sceneGeometry,stamp,shadow}){
  if(disposed||graphicsRetired)return null;
  try{
   noteSnapshot(snapshot);if(graphicsRetired)return null;
   const bound=itemApproach?bindMikaPersistedItems(snapshot,view):null;
   if(bound&&!bound.ok){stop('blocked',bound.reason);return null;}
   if(itemCandidate&&itemCandidate.bindingKey!==bound.key){stop('aborted','NATIVE_ITEM_BINDING_CHANGED');return null;}
   const layout=bound?bound.binding.layout:mikaQaLayout(view,sceneGeometry),nextProjection=JSON.stringify([projection.width,projection.height,projection.ppu,globalThis.devicePixelRatio??1,cameraDirection,...[{x:0,y:0,z:0},{x:8,y:0,z:0},{x:0,y:8,z:0},{x:0,y:0,z:1}].map(point=>projection.project(point))]);
   if(projectionStamp!==null&&projectionStamp!==nextProjection){stop('aborted','VIEWPORT_CHANGED');return null;}projectionStamp=nextProjection;
   latestContext={view,bound,projection};
   if(!plan){
    const options={acceptSweep:cameraAdmission(projection)};
    if(bound){itemCandidate=planMikaItemArrival(bound,calibration,envelope,options);if(!itemCandidate.ok){stop('blocked',itemCandidate.reason);return null;}plan=itemCandidate.plan;}
    else plan=planMikaYardQaCruise(layout,calibration,envelope,options);
    if(!plan.ok){stop('blocked',plan.reason);return null;}phase='running';actionsStarted++;traceState();
   }
   // RAF timestamps and performance.now share the browser monotonic origin.
   // Planning, allocation and the first GPU render precede the first copy;
   // they must not consume the finite authored cruise. Undrawn poses stay at0.
   currentTime=(phase==='parked'||phase==='planning')?plan.duration:originStamp===null?0:Math.max(0,(stamp-originStamp)/1000);
   if(currentTime>plan.duration){
    if(continuation){currentTime=plan.duration;phase='parked';reason='ARRIVAL_SETTLED';actionsCompleted++;traceState();}
    else{stop('complete',itemApproach?'FINITE_ITEM_ARRIVAL_ENDED_NO_INTERACTION':'FINITE_CRUISE_ENDED_NO_TRANSITION');return null;}
   }
   const result=sampleMikaYardQaCruise(plan,layout,currentTime);if(result.status!=='ready'){stop('aborted',result.reason||result.status);return null;}
   const width=Math.ceil(projection.width),height=Math.ceil(projection.height),pixels=width*height;
   if(pixels!==allocatedPixels||canvas.width!==width||canvas.height!==height){
    // Before allocating, include old+new color/depth/swap estimates in the same
    // normal scene image/surface ledger. No DPR2 extra QA surface is retained.
    clearHeldFrame();
    if(reserveRGBA(rgbaBytes+pixels*16)!==true){stop('blocked','QA_SURFACE_BUDGET');return null;}
    renderer.setSize(width,height,false);allocatedPixels=pixels;rgbaBytes=pixels*16;reserveRGBA(rgbaBytes);
   }
   configureMikaYardCamera(THREE,camera,projection,cameraDirection);driver.apply(result.sample);
   const park=continuation&&(phase==='parked'||phase==='planning');
   const rasterKey=park?JSON.stringify([projectionStamp,lighting?.diagnostics??null,result.sample.root,result.sample.boneMatrices]):null;
   if(heldCanvas&&heldKey!==rasterKey)clearHeldFrame();
   maximumEnvelopeRadius=Math.max(maximumEnvelopeRadius,result.envelope.radius);lastResult=result;
   return {y:projection.project(result.position).y,draw:ctx=>{
    if(graphicsRetired)return;
    try{const ppu=projection.ppu;shadow(projection.project(result.position),ppu*.55,ppu*.16,.12);
     for(const foot of Object.values(result.sample.contacts))if(foot.contact)shadow(projection.project({x:foot.paw[0]*8,y:foot.paw[1]*8}),ppu*.13,ppu*.045,.2*foot.load);
     if(park&&heldCanvas&&heldKey===rasterKey){ctx.drawImage(heldCanvas,0,0,projection.width,projection.height);parkedRasterCopies++;}
     else{
      renderer.render(scene,camera);gpuRenders++;ctx.drawImage(canvas,0,0,projection.width,projection.height);
      if(park){
       const bytes=width*height*4;if(reserveRGBA(rgbaBytes+bytes)!==true){stop('blocked','QA_PARKED_SURFACE_BUDGET');return;}
       heldBytes=bytes;rgbaBytes+=bytes;heldCanvas=parkedCanvasFactory();heldCanvas.width=width;heldCanvas.height=height;
       const copy=heldCanvas.getContext('2d');if(!copy)throw Error('QA_PARKED_SURFACE_UNAVAILABLE');copy.drawImage(canvas,0,0);heldKey=rasterKey;
      }
     }
     if(originStamp===null)originStamp=presentationNow();
     frames++;presentedAction=actionsStarted;presentedTime=currentTime;
    }catch(error){stop('aborted',String(error.message));}
   },canvas,get snapshot(){return result;}};
  }catch(error){stop('aborted',String(error.message));return null;}
 }
 return{noteSnapshot,frame,requestItemArrival,commandState:()=>continuation?{ownerId:actorInstance,admitted:presentedAction>0,available:!disposed&&!graphicsRetired,phase,actionsStarted,presentedAction,presentedTime,duration:plan?.duration??0,targetSlotId:itemCandidate?.target?.slotId??null}:null,cancelItemArrival({ownerId,commandToken,reason='NATIVE_COMMAND_CANCELLED'}={}){if(disposed||graphicsRetired||ownerId!==actorInstance||!commandToken||commandToken!==activeCommandToken)return false;stop('aborted',reason);return true;},abort:why=>stop('aborted',why),diagnostics:()=>({phase,reason,time:currentTime,frames,actorInstance,continuation,actionsStarted,actionsCompleted,planning:planningMetrics?{...planningMetrics,pending:!!pendingPlanning}:null,lastActionResult:lastActionResult?{...lastActionResult}:null,heading:lastResult?.sample?.root?.heading??null,unitsPerSource:8,assetSha256:envelope.assetSha256,bones:22,rootOwner:'navigation',normalCamera:true,diagnosticCameraFit:false,itemApproach:itemApproach?{action:itemCandidate?.action??'finite-item-arrival',target:itemCandidate?.target??null,motionPhase:lastResult?.sample?.motionPhase??'approach',rootSpeed:lastResult?.sample?.rootSpeed??null,interactionReady:false,savedVisitReady:false}:null,plan:plan?.ok?{start:plan.start,heading:plan.heading,turnRadians:plan.turnRadians,duration:plan.duration,sweep:plan.sweep,candidates:plan.candidates}:null,position:lastResult?.position??null,maximumEnvelopeRadius,resources:{rgbaBytes,heldFrameRGBABytes:heldBytes,gpuRenders,parkedRasterCopies,encodedGLBBytes:BYTES,glbBinaryBytes:BINARY_BYTES,modelCPUUpperBound:MODEL_CPU_BOUND,modelGPUBytes,graphicsRetired,retainedModelGPUBytes:graphicsRetired?0:modelGPUBytes,retainedModelCPUUpperBound:graphicsRetired?0:MODEL_CPU_BOUND,engineObjectOverheadKnown:false,rasterDpr:1},trace:trace.map(r=>({...r})),scope:continuation?'QA only; same-actor finite current-pose actions and static parked pose; no saved visit/interaction/general navigation; layout change retires owner':itemApproach?'QA only; finite item arrival and standing idle; no saved visit/interaction; layout change aborts':'QA only; no visit/save/economy mutation; layout change aborts; no entry/arrival transition'}),dispose(){if(disposed)return retirementPromise;disposed=true;planningAbort?.abort(Error('SCENE_DISPOSED'));document.removeEventListener('visibilitychange',onHidden);canvas?.removeEventListener('webglcontextlost',onLost);releaseGraphics();phase='disposed';traceState();retirementPromise=Promise.resolve(pendingPlanning).then(()=>undefined,()=>undefined);return retirementPromise;}};
}
