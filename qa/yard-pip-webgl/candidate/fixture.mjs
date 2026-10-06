import{createOptionalPipRenderer}from'./prototype/optional-pip-renderer.mjs';
import{buildTrajectory}from'./motion/trajectory.mjs';
import{buildGaitRequest,sampleMotion,inspectKinematics}from'./motion/kinematics.mjs';
import{makeNavigation}from'./motion/polygon-domain.mjs';
import{bounds}from'./motion/math.mjs';
import{createFixtureClock}from'./fixture-clock.mjs';
const view=document.querySelector('#view'),ctx=view.getContext('2d'),status=document.querySelector('#status'),metrics=document.querySelector('#metrics');
const enable=document.querySelector('#enable'),disable=document.querySelector('#disable'),firstGoal=document.querySelector('#first-goal'),placement=document.querySelector('#placement'),goals=[...document.querySelectorAll('.goal')];
let api=null,setup=null,calibration=null,helper=null,route=null,gait=null,routeClock=null,raf=0,generation=0,loadAbort=null,goalIndex=0,lastMetrics=0,latestResources=null,placementIndex=0,startsFromSettled=false;
const json=async(path,signal)=>{const r=await fetch(path,{signal});if(!r.ok)throw Error('Asset request '+r.status);return r.json();};
function activeControls(active){disable.disabled=!active;firstGoal.disabled=active;placement.disabled=false;goals.forEach(b=>b.disabled=!active||+b.dataset.goal<=goalIndex);enable.disabled=active||firstGoal.value==='';}
function resize(){const w=view.getBoundingClientRect().width,h=300,d=Math.min(devicePixelRatio||1,2);view.width=Math.round(w*d);view.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);}
new ResizeObserver(resize).observe(view);resize();
function project(root){const source=[(root.x-setup.start.position.x)/12,(root.y-setup.start.position.y)/12,(root.z??0)/12];return{x:view.getBoundingClientRect().width/2+source.reduce((s,v,i)=>s+v*setup.camera.right[i],0)*setup.sourcePixelsPerCss,y:185+source.reduce((s,v,i)=>s+v*setup.camera.down[i],0)*setup.sourcePixelsPerCss};}
function locationFor(index){const loc=structuredClone(setup.location),p=setup.planter,move=setup.placements[index];loc.obstacles=loc.obstacles.map(o=>o.id==='planter'?{...o,polygon:p.footprint.map(([x,y])=>[x+move[0]-p.groundPivotCanonical[0],y+move[1]-p.groundPivotCanonical[1]])}:o);return loc;}
function startRun(index){
 if(route&&index<=goalIndex){status.textContent='This short sequence only continues forward. Disable to choose a new first destination.';return;}
 if(route&&routeClock.read()<route.totalMs){status.textContent='Pip is still moving. Choose the next destination after he settles.';return;}
 const previous=route?sampleMotion(route,gait,setup.actor,route.totalMs):null;
 const start=previous?{position:{x:previous.root.x,y:previous.root.y},heading:previous.heading}:setup.start;
 const loc=locationFor(placementIndex),r=buildTrajectory({location:loc,actor:setup.actor,start,goal:setup.goals[index]});if(!r.ok)throw Error('Route rejected: '+r.code);
 const g=buildGaitRequest(r,setup.actor),q=inspectKinematics(r,g,setup.actor,makeNavigation(loc,setup.actor,start.position));if(!q.ok)throw Error('Kinematic route rejected');
 if(previous)for(const side of['L','R']){const a=previous.feet[side],b=g.initial[side];if(Math.hypot(a.position.x-b.position.x,a.position.y-b.position.y,a.position.z-b.position.z)>1e-6||Math.abs(Math.atan2(Math.sin(a.heading-b.heading),Math.cos(a.heading-b.heading)))>1e-6)throw Error('Next route would move a planted foot; retained supported pose');}
 startsFromSettled=Boolean(previous);goalIndex=index;route=r;gait=g;routeClock.reset();activeControls(true);status.textContent=routeClock.paused?'Paused while hidden or unfocused; keeping the current pose.':'Moving to '+setup.goals[index].label+'; '+(route.totalMs/1000).toFixed(2)+' seconds including settle.';
}
function sample(at){const world=sampleMotion(route,gait,setup.actor,at),step=Math.max(0,(at-route.anticipationMs)/setup.actor.halfStepMs);return{world,startsFromSettled,styleFrame:29+7.5*((step%2+2)%2),anticipationU:Math.max(0,Math.min(1,at/route.anticipationMs)),settleU:Math.max(0,Math.min(1,(at-route.anticipationMs-route.moveMs)/route.settleMs))};}
function tick(){if(!api)return;try{if(!routeClock.paused){const w=view.getBoundingClientRect().width;ctx.clearRect(0,0,w,300);const at=routeClock.read(),s=sample(at);api.renderAndCopy(ctx,{sample:s,point:project(s.world.root)});if(at>=route.totalMs)status.textContent='Settled at '+setup.goals[goalIndex].label+(goalIndex===setup.goals.length-1?'. End of this short sequence; Disable to choose another first destination.':'. Choose a later destination or move the planter.');}}catch(e){stop();status.textContent=e.message;return;}raf=requestAnimationFrame(tick);}
function stop(){generation++;loadAbort?.abort();loadAbort=null;cancelAnimationFrame(raf);routeClock?.dispose();routeClock=null;api?.dispose();api=null;route=null;gait=null;activeControls(false);ctx.clearRect(0,0,view.width,view.height);status.textContent='Disabled. The private renderer has been disposed.';}
function pauseReason(reason,active){if(!routeClock)return;routeClock.setReason(reason,active);api?.setPaused(routeClock.paused);status.textContent=routeClock.paused?'Paused while hidden or unfocused; keeping the current pose.':'Resuming the same route position.';}
firstGoal.addEventListener('change',()=>{if(!api)enable.disabled=firstGoal.value==='';});
enable.addEventListener('click',async()=>{if(firstGoal.value==='')return;goalIndex=+firstGoal.value;const g=++generation;enable.disabled=true;firstGoal.disabled=true;placement.disabled=true;disable.disabled=false;loadAbort=new AbortController();const signal=loadAbort.signal;status.textContent='Loading the private test…';try{
  [setup,calibration,helper]=await Promise.all([json('./data/fixture.json',signal),json('./data/calibration.json',signal),fetch('./source/pip-rest-coat.glsl',{signal}).then(r=>{if(!r.ok)throw Error('Shader request '+r.status);return r.text();})]);
  const made=await createOptionalPipRenderer({enabled:true,calibration,fragmentHelper:helper,planter:{descriptor:setup.planter,placement:setup.placements[+placement.value]},widthCss:192,heightCss:192,dpr:1,sourcePixelsPerCss:setup.sourcePixelsPerCss,
   loadAssetBytes:async()=>{const r=await fetch('./assets/pip.glb',{signal});if(!r.ok)throw Error('GLB request '+r.status);return r.arrayBuffer();},
   admitResources:r=>r.stage==='before-import-and-load'?r.knownCPUBufferPeakBytes<=8*1024*1024:r.geometryGPUBufferBytes+r.boneDataTextureGPUBytesEstimate+r.resizeDrawingBufferPeakEstimatedBytes<12*1024*1024,
   onResources:r=>{latestResources=r;},onFrameMetrics:r=>{if(performance.now()-lastMetrics<500)return;lastMetrics=performance.now();metrics.textContent=JSON.stringify({resources:latestResources,mainCanvasBackingBytes:view.width*view.height*4,calls:r},null,2);},
   setupLighting:({THREE,scene,renderer})=>{renderer.toneMapping=THREE.NoToneMapping;const target=new THREE.Vector3(setup.start.position.x/12,.5,-setup.start.position.y/12),lights=[];const ambient=new THREE.AmbientLight(new THREE.Color().setRGB(.78,.83,.93,THREE.LinearSRGBColorSpace),.55);scene.add(ambient);lights.push(ambient);for(const [position,intensity]of[[[-2.4,4,3],1.8],[[2.5,2.4,1.7],.76],[[0,2.8,-2],1.2]]){const l=new THREE.DirectionalLight(0xffffff,intensity);l.position.copy(target).add(new THREE.Vector3(...position));l.target.position.copy(target);scene.add(l,l.target);lights.push(l,l.target);}return()=>lights.forEach(l=>scene.remove(l));}});
  if(g!==generation){made.dispose();return;}api=made;routeClock=createFixtureClock();pauseReason('hidden',document.hidden);pauseReason('blur',!document.hasFocus());placementIndex=+placement.value;activeControls(true);startRun(goalIndex);raf=requestAnimationFrame(tick);
 }catch(e){if(g!==generation)return;stop();status.textContent='Test could not start: '+e.message;}});
disable.addEventListener('click',stop);goals.forEach(b=>b.addEventListener('click',()=>{try{startRun(+b.dataset.goal);}catch(e){status.textContent=e.message;}}));
placement.addEventListener('change',()=>{try{
 if(!api){placementIndex=+placement.value;return;}
 if(route&&routeClock.read()<route.totalMs)throw Error('Move the planter after Pip settles.');
 const next=+placement.value,current=sampleMotion(route,gait,setup.actor,route.totalMs),nav=makeNavigation(locationFor(next),setup.actor,current.root);
 if(!nav.clearBox(bounds(current.bodyPolygon))||Object.values(current.feet).some(f=>!nav.clearBox(bounds(f.solePolygon))))throw Error('That placement overlaps Pip; retained the current planter position.');
 api.setPlanterPlacement(setup.placements[next]);placementIndex=next;status.textContent='Planter moved. Pip keeps his supported pose.';
 }catch(e){placement.value=String(placementIndex);status.textContent=e.message;}});
document.addEventListener('visibilitychange',()=>pauseReason('hidden',document.hidden));
window.addEventListener('blur',()=>pauseReason('blur',true));window.addEventListener('focus',()=>pauseReason('blur',false));window.addEventListener('pagehide',stop);
