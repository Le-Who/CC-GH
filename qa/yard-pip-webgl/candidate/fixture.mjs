import{createOptionalPipRenderer}from'./prototype/optional-pip-renderer.mjs';
import{buildTrajectory}from'./motion/trajectory.mjs';
import{buildGaitRequest,sampleMotion,inspectKinematics}from'./motion/kinematics.mjs';
import{makeNavigation}from'./motion/polygon-domain.mjs';
import{bounds}from'./motion/math.mjs';
import{createFixtureClock}from'./fixture-clock.mjs';
import{createFixtureScheduler}from'./fixture-scheduler.mjs';

const view=document.querySelector('#view'),stage=document.querySelector('#stage'),directLayer=document.querySelector('#direct-layer');
const ctx=view.getContext('2d'),status=document.querySelector('#status'),metrics=document.querySelector('#metrics');
const enable=document.querySelector('#enable'),disable=document.querySelector('#disable'),firstGoal=document.querySelector('#first-goal');
const placement=document.querySelector('#placement'),presentationMode=document.querySelector('#presentation-mode'),goals=[...document.querySelectorAll('.goal')];
const TIMING_LIMIT=256,qaEnabled=new URLSearchParams(location.search).get('qa')==='1';
// Source-qualified against the original navigation/sole checks. These are
// diagnostic depth witnesses, not accepted art or new playable destinations.
const QA_PLACEMENTS=Object.freeze({'planter-nearer':[90.45320905063016,111.41603826496343,0],'pip-nearer':[77.06922898926626,133.7961427713551,0]});
let api=null,setup=null,calibration=null,helper=null,route=null,gait=null,routeClock=null,scheduler=null;
let generation=0,loadAbort=null,goalIndex=0,placementIndex=0,startsFromSettled=false,loading=false,prepared=false;
let lastResources=null,lastCalls=null,lastFrame=null,lastDisposed=null,observer=null,handlersInstalled=false,lastMetricsAt=0,frameContext=null;
let timings=[],timingDropped=0,frameCount=0,mode='direct',removeHandlers=[];
let qaPlacementName=null,qaStaticWitness=false;
const lifecycle={enables:0,disposals:0,staleDisposals:0,pagehides:0,pageshows:0,blurEvents:0,focusEvents:0,visibilityEvents:0,contextLosses:0,contextRestorations:0,resizeEvents:0};
const json=async(path,signal)=>{const r=await fetch(path,{signal});if(!r.ok)throw Error('Asset request '+r.status);return r.json();};
function activeControls(active){
 disable.disabled=!active&&!loading;firstGoal.disabled=active||loading;presentationMode.disabled=active||loading;
 placement.disabled=loading;goals.forEach(b=>b.disabled=!active||prepared||+b.dataset.goal<=goalIndex);
 enable.disabled=active||loading||firstGoal.value==='';
}
function currentRoute(){return route?{goalIndex,goal:setup.goals[goalIndex].label,activeElapsedMs:Math.min(routeClock.read(),route.totalMs),
 displayedElapsedMs:lastFrame?.sampledElapsedMs??0,durationMs:route.totalMs,settled:(lastFrame?.sampledElapsedMs??0)>=route.totalMs,
 root:lastFrame?.root??null,projectedPoint:lastFrame?.projectedPoint??null,startsFromSettled}:null;}
function snapshot(){return structuredClone({format:'Pip-direct-fixture/v1',mode,enabled:Boolean(api),loading,prepared,
 disposed:!api&&!loading,route:currentRoute(),pauseReasons:routeClock?.reasons??[],scheduler:scheduler?.state??null,
 renderer:api?.diagnostics??null,lifecycle,frameCount,timings,timingLimit:TIMING_LIMIT,timingDropped,lastResources,lastCalls,lastFrame,lastDisposed,
 placement:{index:placementIndex,canonical:setup?(QA_PLACEMENTS[qaPlacementName]??setup.placements[placementIndex]):null,qaName:qaPlacementName,staticWitness:qaStaticWitness},
 mainCanvas:{backing:[view.width,view.height],rgbaBytes:view.width*view.height*4},
 qualification:'Source-qualified local candidate; browser appearance, native lifecycle and performance unqualified.'});}
function updateMetrics(force=false){
 if(qaEnabled&&api&&!prepared)return; // No debug DOM writes during the clean QA interval.
 const now=performance.now();if(!force&&now-lastMetricsAt<500)return;lastMetricsAt=now;
 metrics.textContent=JSON.stringify({mode,resources:lastResources,mainCanvasBackingBytes:view.width*view.height*4,calls:lastCalls,
 frameCount,route:currentRoute(),scheduler:scheduler?.state??null},null,2);
}
function resize(){
 const w=view.getBoundingClientRect().width,h=300,d=Math.min(devicePixelRatio||1,2),bw=Math.round(w*d),bh=Math.round(h*d);
 lifecycle.resizeEvents++;
 if(view.width!==bw||view.height!==bh){view.width=bw;view.height=bh;ctx.setTransform(d,0,0,d,0,0);}
 // Direct surface placement follows even fractional CSS resize. Copy mode
 // redraws the same frozen pose if its main backing was cleared while paused.
 scheduler?.invalidate('resize',{whilePaused:true});
}
function presentation(){
 const v=view.getBoundingClientRect(),s=directLayer.getBoundingClientRect(),css=getComputedStyle(view),t=ctx.getTransform();
 const left=parseFloat(css.borderLeftWidth)||0,right=parseFloat(css.borderRightWidth)||0;
 const top=parseFloat(css.borderTopWidth)||0,bottom=parseFloat(css.borderBottomWidth)||0;
 return{a:t.a,b:t.b,c:t.c,d:t.d,e:t.e,f:t.f,backingWidth:view.width,backingHeight:view.height,
 contentWidth:v.width-left-right,contentHeight:v.height-top-bottom,offsetLeft:v.left-s.left+left,offsetTop:v.top-s.top+top};
}
function project(root){
 const source=[(root.x-setup.start.position.x)/12,(root.y-setup.start.position.y)/12,(root.z??0)/12];
 return{x:view.getBoundingClientRect().width/2+source.reduce((s,v,i)=>s+v*setup.camera.right[i],0)*setup.sourcePixelsPerCss,
 y:185+source.reduce((s,v,i)=>s+v*setup.camera.down[i],0)*setup.sourcePixelsPerCss};
}
function locationFor(index,override=QA_PLACEMENTS[qaPlacementName]){
 const loc=structuredClone(setup.location),p=setup.planter,move=override??setup.placements[index];
 loc.obstacles=loc.obstacles.map(o=>o.id==='planter'?{...o,polygon:p.footprint.map(([x,y])=>[x+move[0]-p.groundPivotCanonical[0],y+move[1]-p.groundPivotCanonical[1]])}:o);return loc;
}
function routeStatus(){return routeClock.paused?'Paused; keeping the current pose.':
 (routeClock.read()>=route.totalMs?'Settled at '+setup.goals[goalIndex].label+(goalIndex===setup.goals.length-1?'. End of this short sequence; Disable to choose another first destination.':'. Choose a later destination or move the planter.'):
 'Moving to '+setup.goals[goalIndex].label+'; '+(route.totalMs/1000).toFixed(2)+' seconds including settle.');}
function startRun(index){
 if(qaStaticWitness)throw Error('Prepare a fresh route after a static overlap witness');
 if(!Number.isInteger(index)||!setup.goals[index])throw Error('Unknown destination');
 if(route&&index<=goalIndex){status.textContent='This short sequence only continues forward. Disable to choose a new first destination.';return false;}
 if(route&&routeClock.read()<route.totalMs){status.textContent='Pip is still moving. Choose the next destination after he settles.';return false;}
 const previous=route?sampleMotion(route,gait,setup.actor,route.totalMs):null;
 const start=previous?{position:{x:previous.root.x,y:previous.root.y},heading:previous.heading}:setup.start;
 const loc=locationFor(placementIndex),r=buildTrajectory({location:loc,actor:setup.actor,start,goal:setup.goals[index]});if(!r.ok)throw Error('Route rejected: '+r.code);
 const g=buildGaitRequest(r,setup.actor),q=inspectKinematics(r,g,setup.actor,makeNavigation(loc,setup.actor,start.position));if(!q.ok)throw Error('Kinematic route rejected');
 if(previous)for(const side of['L','R']){const a=previous.feet[side],b=g.initial[side];if(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)>1e-6||Math.abs(Math.atan2(Math.sin(a.heading-b.heading),Math.cos(a.heading-b.heading)))>1e-6)throw Error('Next route would move a planted foot; retained supported pose');}
 startsFromSettled=Boolean(previous);goalIndex=index;route=r;gait=g;routeClock.reset();lastFrame=null;
 activeControls(true);status.textContent=routeStatus();scheduler?.invalidate('route');return true;
}
function sample(at){
 const world=sampleMotion(route,gait,setup.actor,at),step=Math.max(0,(at-route.anticipationMs)/setup.actor.halfStepMs);
 return{world,startsFromSettled,styleFrame:29+7.5*((step%2+2)%2),anticipationU:Math.max(0,Math.min(1,at/route.anticipationMs)),settleU:Math.max(0,Math.min(1,(at-route.anticipationMs-route.moveMs)/route.settleMs))};
}
function drawFrame({reason='motion',paused=false,timestamp=null,elapsedMs=null,visibility='both'}={}){
 if(!api||!route)return false;
 try{
  // An event can arrive between the last RAF and clock pause. A resize or
  // context restore must retain the actually displayed pose during that pause.
  const at=elapsedMs??(paused&&lastFrame?lastFrame.sampledElapsedMs:Math.min(routeClock.read(),route.totalMs));
  const s=sample(at),point=project(s.world.root),started=performance.now();
  frameContext={reason,phase:reason==='diagnostic'?'diagnostic':reason==='startup'?'startup':at>=route.totalMs?'idle':'moving',sampledElapsedMs:at,routeDurationMs:route.totalMs,goalIndex,paused:routeClock.paused,rafTimestampMs:timestamp,startedAtMs:started};
  const options={sample:s,point,presentation:presentation(),forcePausedRedraw:paused||reason==='startup',visibility};
  let rendered;
  if(mode==='direct')rendered=api.renderDirect(options);
  else{ctx.clearRect(0,0,view.width,view.height);rendered=api.renderAndCopy(ctx,options);}
  if(!rendered)return false;
  frameCount++;lastFrame={...frameContext,root:{...s.world.root},projectedPoint:point,renderedAtMs:performance.now(),surface:api.diagnostics.lastFrame};
  const moving=at<route.totalMs;if(prepared||!moving)status.textContent=prepared?'Ready. The model is warm and the route clock is held.':routeStatus();updateMetrics(!moving);
  return moving&&!routeClock.paused;
 }catch(error){stop('error');status.textContent=error.message;return false;}finally{frameContext=null;}
}
function stop(reason='disabled'){
 generation++;loadAbort?.abort();loadAbort=null;loading=false;prepared=false;
 const previousRoute=currentRoute(),oldApi=api,oldScheduler=scheduler;
 oldScheduler?.dispose();routeClock?.dispose();oldApi?.dispose();if(oldApi)lifecycle.disposals++;
 if(oldApi||previousRoute)lastDisposed={reason,route:previousRoute,renderer:oldApi?.diagnostics??null,scheduler:oldScheduler?.state??null,atMs:performance.now()};
 scheduler=null;routeClock=null;api=null;route=null;gait=null;activeControls(false);
 ctx.clearRect(0,0,view.width,view.height);status.textContent='Disabled. The optional renderer has been disposed.';updateMetrics(true);
}
function pauseReason(reason,active){
 if(!routeClock)return;routeClock.setReason(reason,active);api?.setPaused(routeClock.paused);scheduler?.setPaused(routeClock.paused);
 if(route)status.textContent=prepared?'Ready. The model is warm and the route clock is held.':routeStatus();
}
function frameMetrics(calls){
 lastCalls=calls;const entry={...frameContext,...calls,completedAtMs:performance.now(),activeElapsedAfterCallMs:route?Math.min(routeClock.read(),route.totalMs):null};
 if(timings.length===TIMING_LIMIT){timings.shift();timingDropped++;}timings.push(entry);
}
async function enableTest({prepareOnly=false,initialQAPlacement=null}={}){
 if(api||loading)throw Error('Disable before enabling a new test');if(firstGoal.value==='')throw Error('Choose the first destination');
 goalIndex=+firstGoal.value;const g=++generation;loading=true;mode=presentationMode.value;activeControls(false);loadAbort=new AbortController();const signal=loadAbort.signal;
 status.textContent='Loading the optional test…';timings=[];timingDropped=0;frameCount=0;lastCalls=null;lastFrame=null;
 try{
  [setup,calibration,helper]=await Promise.all([json('./data/fixture.json',signal),json('./data/calibration.json',signal),fetch('./source/pip-rest-coat.glsl',{signal}).then(r=>{if(!r.ok)throw Error('Shader request '+r.status);return r.text();})]);
  if(g!==generation)return false;
  qaPlacementName=initialQAPlacement;qaStaticWitness=false;
  const made=await createOptionalPipRenderer({enabled:true,calibration,fragmentHelper:helper,presentationMode:mode,directHost:directLayer,
   planter:{descriptor:setup.planter,placement:QA_PLACEMENTS[qaPlacementName]??setup.placements[+placement.value]},widthCss:192,heightCss:192,dpr:1,sourcePixelsPerCss:setup.sourcePixelsPerCss,
   loadAssetBytes:async()=>{const r=await fetch('./assets/pip.glb',{signal});if(!r.ok)throw Error('GLB request '+r.status);return r.arrayBuffer();},
   admitResources:r=>r.stage==='before-import-and-load'?r.knownCPUBufferPeakBytes<=8*1024*1024:r.geometryGPUBufferBytes+r.boneDataTextureGPUBytesEstimate+r.resizeDrawingBufferPeakEstimatedBytes+(r.compositorSurfaceBytesEstimate??0)<12*1024*1024,
   onResources:r=>{if(g!==generation)return;lastResources=r;if(r.event==='context-lost'){lifecycle.contextLosses++;pauseReason('context-lost',true);}else if(r.event==='context-restored'){lifecycle.contextRestorations++;pauseReason('context-lost',false);scheduler?.invalidate('context-restored',{whilePaused:true});}},
   onFrameMetrics:frameMetrics,
   setupLighting:({THREE,scene,renderer})=>{renderer.toneMapping=THREE.NoToneMapping;const target=new THREE.Vector3(setup.start.position.x/12,.5,-setup.start.position.y/12),lights=[];const ambient=new THREE.AmbientLight(new THREE.Color().setRGB(.78,.83,.93,THREE.LinearSRGBColorSpace),.55);scene.add(ambient);lights.push(ambient);for(const [position,intensity]of[[[-2.4,4,3],1.8],[[2.5,2.4,1.7],.76],[[0,2.8,-2],1.2]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.copy(target).add(new THREE.Vector3(...position));l.target.position.copy(target);scene.add(l,l.target);lights.push(l,l.target);}return()=>lights.forEach(l=>scene.remove(l));}});
  if(g!==generation){made.dispose();lifecycle.staleDisposals++;return false;}
  api=made;loading=false;loadAbort=null;lifecycle.enables++;prepared=true;
  routeClock=createFixtureClock();routeClock.setReason('ready',true);routeClock.setReason('hidden',document.hidden);routeClock.setReason('blur',!document.hasFocus());
  scheduler=createFixtureScheduler({draw:drawFrame});scheduler.setPaused(true);placementIndex=+placement.value;
  startRun(goalIndex);api.setPaused(true);drawFrame({reason:'startup',paused:true});if(!api)return false;
  if(!prepareOnly)startPrepared();else activeControls(true);updateMetrics(true);return true;
 }catch(error){if(g!==generation)return false;stop('initialization-error');status.textContent='Test could not start: '+error.message;throw error;}
}
function startPrepared(){
 if(!api||!prepared)throw Error('No prepared route');if(qaStaticWitness)throw Error('Prepare a fresh route after a static overlap witness');
 prepared=false;routeClock.reset();pauseReason('ready',false);activeControls(true);scheduler.invalidate('route');return snapshot();
}
function movePlanter(){
 try{
  if(!api){placementIndex=+placement.value;return;}
  if(route&&routeClock.read()<route.totalMs)throw Error('Move the planter after Pip settles.');
  const next=+placement.value,current=sampleMotion(route,gait,setup.actor,route.totalMs),nav=makeNavigation(locationFor(next,null),setup.actor,current.root);
  if(!nav.clearBox(bounds(current.bodyPolygon))||Object.values(current.feet).some(f=>!nav.clearBox(bounds(f.solePolygon))))throw Error('That placement overlaps Pip; retained the current planter position.');
  api.setPlanterPlacement(setup.placements[next]);qaPlacementName=null;placementIndex=next;scheduler.invalidate('placement',{whilePaused:true});status.textContent='Planter moved. Pip keeps his supported pose.';
 }catch(error){placement.value=String(placementIndex);status.textContent=error.message;}
}
function listen(target,event,callback){target.addEventListener(event,callback);removeHandlers.push(()=>target.removeEventListener(event,callback));}
function pagehide(){
 lifecycle.pagehides++;stop('pagehide');observer?.disconnect();observer=null;removeHandlers.forEach(remove=>remove());removeHandlers=[];handlersInstalled=false;
 window.dispatchEvent(new CustomEvent('pip-fixture-lifecycle',{detail:snapshot()}));
}
function installHandlers(){
 if(handlersInstalled)return;handlersInstalled=true;
 listen(firstGoal,'change',()=>{if(!api)activeControls(false);});listen(enable,'click',()=>{enableTest().catch(()=>{});});listen(disable,'click',()=>stop());
 goals.forEach(b=>listen(b,'click',()=>{try{startRun(+b.dataset.goal);}catch(error){status.textContent=error.message;}}));listen(placement,'change',movePlanter);
 listen(document,'visibilitychange',()=>{lifecycle.visibilityEvents++;pauseReason('hidden',document.hidden);});
 listen(window,'blur',()=>{lifecycle.blurEvents++;pauseReason('blur',true);});listen(window,'focus',()=>{lifecycle.focusEvents++;pauseReason('blur',false);});
 listen(window,'pagehide',pagehide);observer=new ResizeObserver(resize);observer.observe(view);resize();activeControls(false);
}
// One dormant pageshow listener allows a bfcache restore to return to disabled
// controls with a fresh observer. A pagehide never retains a renderer or RAF.
window.addEventListener('pageshow',event=>{lifecycle.pageshows++;if(event.persisted)installHandlers();});
window.__pipFixture=Object.freeze({snapshot,...(qaEnabled?{
 async prepare({mode:nextMode='direct',goalIndex:nextGoal=0,placementIndex:nextPlacement=0,overlapPlacement=null}={}){
  if(!['direct','copy'].includes(nextMode)||![0,1,2].includes(nextGoal)||![0,1].includes(nextPlacement))throw Error('Bounded QA options required');
  if(overlapPlacement!==null&&(overlapPlacement!=='planter-nearer'||nextGoal!==0))throw Error('Only the checked planter-nearer A route can start with a diagnostic placement');
  if(api||loading)stop('qa-reset');presentationMode.value=nextMode;firstGoal.value=String(nextGoal);placement.value=String(nextPlacement);
  await enableTest({prepareOnly:true,initialQAPlacement:overlapPlacement});return snapshot();
 },start:startPrepared,
 renderAt({elapsedMs,visibility='both'}={}){
  if(!api||!prepared||!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>route.totalMs)throw Error('Prepare a route and choose its bounded elapsed time');
  drawFrame({reason:'diagnostic',paused:true,elapsedMs,visibility});return snapshot();
 },
 setOverlapWitness(name){
  if(!api||!prepared||goalIndex!==0||lastFrame?.sampledElapsedMs!==route.totalMs||!QA_PLACEMENTS[name])throw Error('Render the held settled-A pose before selecting a bounded overlap witness');
  const current=sampleMotion(route,gait,setup.actor,route.totalMs),next=QA_PLACEMENTS[name],nav=makeNavigation(locationFor(placementIndex,next),setup.actor,current.root);
  if(!nav.clearBox(bounds(current.bodyPolygon))||Object.values(current.feet).some(f=>!nav.clearBox(bounds(f.solePolygon))))throw Error('Diagnostic placement overlaps a supported body or foot');
  api.setPlanterPlacement(next);qaPlacementName=name;qaStaticWitness=true;drawFrame({reason:'diagnostic',paused:true,elapsedMs:route.totalMs});return snapshot();
 }}:{} )});
installHandlers();
