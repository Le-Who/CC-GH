/** Local trusted QA fixture, never imported by the production app. */
import {AtlasCache} from './atlas.mjs';
import {createProjection} from './projection.mjs';
import {createPipSnackCandidate} from '../../../game-logic/yard-v2/media/pip-snack-binding.mjs';
import {PIP_ACTOR_PROFILE} from '../../../game-logic/yard-v2/pip-actor-profile.mjs';
import {createPipActorMediaEntry} from './pip-actor-media.mjs';
const $=s=>document.querySelector(s),canvas=$('canvas'),ctx=canvas.getContext('2d'),status=$('#status');
const base=new URL('../../../../public/assets/yard-pip/',import.meta.url).href,sourceBase=new URL('../../../game-logic/yard-v2/media/pip/',import.meta.url).href;
const rawFetch=fetch.bind(globalThis);let delay=0,failOnce=false,events=[],errors=[],generation=0;
globalThis.fetch=async(input,init)=>{const url=String(input);if(url.includes('/assets/yard-pip/atlases/')){if(delay)await new Promise(r=>setTimeout(r,delay));if(failOnce){failOnce=false;return new Response('Intentional one-page QA failure',{status:503});}}return rawFetch(input,init);};
const read=async url=>{const r=await rawFetch(url);if(!r.ok)throw Error(`Source ${r.status}: ${url}`);return r.json();};
const [clip,strideContract,motionContract,manifest,fixture]=await Promise.all([read(sourceBase+'snack-combined-binding.json'),read(sourceBase+'authored-stride.json'),read(sourceBase+'ground-motion.json'),read(base+'runtime-media.json'),read(new URL('../../../../public/pip-visit-fixture.json',import.meta.url))]);
const source=createPipSnackCandidate({clip,strideContract,motionContract});
// Explicit local fixture permission cannot change the default source registry.
const profiles={pip:{...PIP_ACTOR_PROFILE,playbackReady:true}},entry=createPipActorMediaEntry(manifest,{source,assetBaseURL:base,profiles}),presenter=entry.presenter,plan=fixture.plan;
const still=manifest.stills['pip:target-snack-table'],image=new Image();image.src=new URL(still.src,base).href;await image.decode();
let cache,projection,pendingSize=null,currentAt=plan.schedule.combinedStart+5200,playing=false,lastStamp=performance.now(),disposed=false,lastDraw=null,holdCount=0,frameCount=0,lastStatus=0;
const makeCache=()=>new AtlasCache(base,3,{maxDecodedBytes:32*1024*1024,maxConcurrentDecodes:1,onEvent:e=>{events.push({...e,generation});if(events.length>1000)events.shift();}});
cache=makeCache();
function resize(){const r=canvas.getBoundingClientRect();pendingSize={width:r.width,height:r.height,dpr:Math.min(devicePixelRatio||1,2)};}
function applyResize(){if(!pendingSize)return;const {width,height,dpr}=pendingSize;pendingSize=null;canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);projection=createProjection(width,height);}
new ResizeObserver(resize).observe(canvas);resize();applyResize();
function shadow(p){const q=projection.project(p),ppu=projection.ppu;ctx.save();ctx.translate(q.x,q.y);ctx.scale(ppu*.09,ppu*.04);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'#344b2540');g.addColorStop(1,'#344b2500');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
function draw(view){applyResize();let supportCount=0;ctx.clearRect(0,0,projection.width,projection.height);const p=fixture.placement;
 if(!view.targetSlotHidden){const q=projection.project(p),scale=projection.ppu/still.worldPixelScale;ctx.drawImage(image,q.x-still.pivotPx[0]*scale,q.y-still.pivotPx[1]*scale,image.width*scale,image.height*scale);}
 if(view.pose){const basePoint=view.anchor,contacts=view.clip.groundContacts[view.index]||[];supportCount=contacts.length;for(const p of contacts)shadow({x:basePoint.x+p[0]*8,y:basePoint.y+p[1]*8,z:0});cache.draw(ctx,view.clip,view.index,projection.project(basePoint),projection.ppu);}
 lastDraw={groundSupportCount:supportCount,at:currentAt,clip:view.clip?.id??null,index:view.index??null,targetHidden:view.targetSlotHidden,phase:view.pose?.phase??(currentAt<plan.schedule.leavesAt?'entry-wait':'complete'),role:view.pose?.role??'none',sourceRole:view.pose?.sourceRole??null,position:view.pose?.position??null};frameCount++;
}
const props=()=>[{...fixture.placement,supported:true,drawStandalone:true,transform:{x:fixture.placement.x,y:fixture.placement.y,rotationZ:0}}];
function tick(stamp){if(disposed)return;const dt=Math.min(100,stamp-lastStamp);lastStamp=stamp;if(playing&&!document.hidden)currentAt=Math.min(plan.schedule.leavesAt,currentAt+dt*Number($('#speed').value));if(currentAt>=plan.schedule.leavesAt){playing=false;$('#play').textContent='Play';}
 try{
  if(cache.error)throw cache.error;
  const requests=presenter.requests(plan,currentAt);cache.prepare(requests.required,requests.lookahead);const view=presenter.compose(plan,currentAt,props(),cache);
  if(view.requiresCoherentFrameHold){holdCount++;}else draw(view);
  if(cache.error)throw cache.error;
  if(stamp-lastStatus>150){status.dataset.error='false';status.textContent=`${view.pose?.sourceRole??view.pose?.role??'complete'} · ${cache.entries.size} pages · ${((cache.decodedBytes+cache.reservedBytes)/1048576).toFixed(1)} MB reserved/decoded · ${view.requiresCoherentFrameHold?'holding coherent canvas':'frame ready'} · source gate closed`;$('#time').value=currentAt;$('#timeLabel').value=(currentAt/1000).toFixed(2)+' s';lastStatus=stamp;}
 }catch(error){status.dataset.error='true';status.textContent=String(error.message)+' · Last coherent frame retained; Retry / clear can recover';if(errors.at(-1)!==String(error.message))errors.push(String(error.message));playing=false;$('#play').textContent='Play';}
 requestAnimationFrame(tick);
}
function jump(name){playing=false;$('#play').textContent='Play';const start=plan.schedule.combinedStart,end=plan.schedule.combinedEnd;currentAt={approach:plan.schedule.enterAt+5000,action:start,nibble:start+5200,back:start+11520,turn:start+14000,rest:start+17920,seam:start+19200-40,depart:end+1200,done:plan.schedule.leavesAt}[name];}
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Pause':'Play';lastStamp=performance.now();};$('#restart').onclick=()=>{playing=false;$('#play').textContent='Play';currentAt=0;};$('#step').onclick=()=>{playing=false;$('#play').textContent='Play';currentAt=Math.min(plan.schedule.leavesAt,currentAt+40);};$('#phase').onchange=e=>jump(e.target.value);$('#time').oninput=e=>{playing=false;$('#play').textContent='Play';currentAt=Number(e.target.value);};
$('#delay').onclick=()=>{delay=delay?0:1200;$('#delay').textContent=delay?'Decode delayed':'Delay decode';};$('#fail').onclick=()=>{failOnce=true;status.textContent='Next atlas request will fail intentionally';};$('#retry').onclick=()=>{cache.dispose();generation++;cache=makeCache();status.dataset.error='false';};
window.addEventListener('pagehide',()=>{disposed=true;cache.dispose();});
window.pipQA=Object.freeze({snapshot:()=>({ready:true,runtimeActivated:false,at:currentAt,lastDraw,holdCount,frameCount,cache:{retained:cache.entries.size,pending:cache.pending.size,active:cache.active,decodedBytes:cache.decodedBytes,reservedBytes:cache.reservedBytes,maxDecodedBytes:cache.maxDecodedBytes},manifestPages:manifest.exportAudit.atlasPages,loadedURLs:[...new Set(events.filter(e=>e.type==='atlas-load-start').map(e=>e.src))],errors:[...errors],events:[...events],planSummary:{combinedStart:plan.schedule.combinedStart,combinedEnd:plan.schedule.combinedEnd,leavesAt:plan.schedule.leavesAt,loopCycles:plan.schedule.loop.cycles},viewport:{width:innerWidth,height:innerHeight,canvasWidth:canvas.width,canvasHeight:canvas.height,overflow:document.documentElement.scrollWidth>innerWidth}})});
requestAnimationFrame(tick);
