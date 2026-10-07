import {createOptionalPipRenderer} from '/source/src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs';
import {sampleR1SavedStay,r1SavedStayGeometry} from '/source/src/games/companion-yard-v2/pip-prototype/canonical-saved-stay.mjs';
import {createCleanProjection} from '/source/src/games/companion-yard-v2/pip-prototype/projection.mjs';
import {createPipGardenLighting} from '/source/src/games/companion-yard-v2/pip-prototype/grounding-recipe.mjs';
import {admitPipResources,rgbaAdmission,COMBINED_KNOWN_CPU_PEAK,ENCODED_BACKGROUND_CPU_BYTES} from '/source/src/games/companion-yard-v2/pip-prototype/resources.mjs';
import {selectCanonicalFoodState} from '/source/game-logic/yard-v2/canonical-food-contract.mjs';
const root='/source/src/games/companion-yard-v2/pip-prototype/';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`Input ${url}: ${r.status}`);return r.json();};
const arrayBuffer=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`Asset ${url}: ${r.status}`);return r.arrayBuffer();};
const [plan,input,descriptor,fixture,calibration,fragmentHelper]=await Promise.all([json('/qualified-plan.json'),json('/qualified-inputs.json'),json(root+'data/location.json'),json(root+'data/fixture.json'),json(root+'data/calibration.json'),fetch(root+'source/pip-rest-coat.glsl').then(r=>r.text())]);
const geometry=r1SavedStayGeometry(),canvas=document.querySelector('#background'),host=document.querySelector('#direct'),ctx=canvas.getContext('2d'),bitmap=await createImageBitmap(await (await fetch(root+'assets/clean-garden.png')).blob());
let renderer=null,projection=null,lastResources=null,last=null,running=false,raf=null,frameTimes=[],lastAt=plan.arrivedAt-1;
const reserve=()=>rgbaAdmission({uiBytes:19138304,backgroundBytes:bitmap.width*bitmap.height*4,currentCanvasBytes:canvas.width*canvas.height*4,directSurfaceBytes:lastResources?.ownedRGBASurfacePeakBytes||0});
function resize(){const dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);projection=createCleanProjection(descriptor,innerWidth,innerHeight,{focus:plan.inspectionPlan.target});if(!reserve().fits)throw Error('RGBA resource admission failed');renderer?.resize({viewport:projection.renderViewport});ctx.fillStyle='#d8e3c1';ctx.fillRect(0,0,innerWidth,innerHeight);const a=projection.art;ctx.drawImage(bitmap,a.x,a.y,a.width,a.height);}
resize();
async function create(){
 const food=selectCanonicalFoodState(input.snapshot);
 // A genuine worn target must not be silently converted back to uses:0 for art.
 if(!food.available)throw Error(`Saved-visit food selector failed: ${food.reason}`);
 renderer=await createOptionalPipRenderer({enabled:true,canonicalFoodEnabled:true,groundingRecipe:'pip-garden-grounding-v1',actorUnitsPerSource:plan.actor.unitsPerSource,presentationMode:'direct',directHost:host,calibration,fragmentHelper,viewport:projection.renderViewport,planter:{descriptor:fixture.planter,placement:fixture.placements[0]},
  admitResources:row=>{if(!admitPipResources({...row,encodedBackgroundCPUBytes:ENCODED_BACKGROUND_CPU_BYTES}))return false;if(row.stage==='before-drawing-buffer-allocation')lastResources=row;return reserve().fits;},
  getBaseResourceUsage:()=>{const r=lastResources;return{rgba:reserve().totalBytes,knownCPU:COMBINED_KNOWN_CPU_PEAK+r.boneDataTextureCPUBytesEstimate,estimatedGPU:r.geometryGPUBufferBytes+r.boneDataTextureGPUBytesEstimate+r.resizeDrawingBufferPeakEstimatedBytes+r.compositorResizePeakBytesEstimate};},
  loadAssetBytes:()=>arrayBuffer(root+'assets/pip.glb'),loadPlanterAssetBytes:()=>arrayBuffer(root+'assets/planter-t2.glb'),loadCanonicalFoodAssetBytes:arrayBuffer,
  setupLighting:({THREE,scene,renderer})=>{const p=plan.inspectionPlan.entranceStages[0].end.root;const lighting=createPipGardenLighting({THREE,scene,renderer,target:new THREE.Vector3(p.x/12,.5,-p.y/12),recipe:'pip-garden-grounding-v1'});return()=>lighting.dispose();},
 });
 await renderer.setCanonicalFoodSnapshot(input.snapshot,{ownerKey:{}});
 const selected=renderer.diagnostics.canonicalFood.selection;
 if(!selected.available||selected.state!==food.state)throw Error('Rendered canonical food does not match genuine snapshot');
}
function seek(at){host.style.visibility='hidden';const result=sampleR1SavedStay(plan,at,{rows:input.rows,geometry});if(result.code)throw Error(result.code);const sample=result.sample||{world:at<plan.arrivedAt?plan.inspectionPlan.initial:plan.exitStages.at(-1).end,startsFromSettled:true,styleFrame:96,anticipationU:1,settleU:1,intention:result.phase};renderer.setCanonicalPlacements(input.rows,{selectedSlotId:plan.inspectionPlan.target.slotId});const drawn=renderer.renderDirect({sample,point:projection.project(sample.world.root),visibility:result.sample?'both':'planter',forcePausedRedraw:true});if(drawn)host.style.visibility='visible';lastAt=at;last={at,phase:result.phase,intention:sample.intention,drawn,root:sample.world.root,needsAnimationFrame:result.needsAnimationFrame};return diagnostics();}
function diagnostics(){return {visitId:plan.visitId,...last,projection:{width:projection.width,height:projection.height,scale:projection.scale,art:projection.art},renderer:renderer?.diagnostics,rgba:reserve(),frameTimes,scope:'Isolated actual renderer at canonical gameplay density, no app shell acceptance'};}
function pause(){running=false;cancelAnimationFrame(raf);}
function play(from,to){pause();frameTimes=[];const start=performance.now();running=true;function step(now){if(!running)return;const at=Math.min(to,from+now-start);frameTimes.push({realMs:now-start,serverMs:at});seek(at);if(at<to)raf=requestAnimationFrame(step);else running=false;}raf=requestAnimationFrame(step);}
await create();seek(lastAt);
window.savedVisitQA={ready:true,plan,seek,play,pause,diagnostics,get running(){return running;},async fresh(){pause();await renderer.dispose();renderer=null;await create();return seek(lastAt);}};
addEventListener('resize',()=>{resize();seek(lastAt);});
