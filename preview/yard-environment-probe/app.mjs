import {AtlasCache} from '../../src/games/companion-yard-v2/atlas.mjs';
import {drawLayeredEnvironment} from '../../src/games/companion-yard-v2/environment-layout.mjs';
import {getYardPlayzoneRows} from '../../game-logic/yard-playzones.js';
import {ANCHORS,MAX_BYTES,frameAt,workingSet,fitProjection,validateClip,groundGuides} from './model.mjs';
const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d'),stage=document.querySelector('#stage'),playButton=document.querySelector('#play'),resetButton=document.querySelector('#reset'),guides=document.querySelector('#guides'),status=document.querySelector('#status');
const evidence={scope:'scene-render-probe-only',ready:false,state:'loading',errors:[],events:[],draws:[],plays:[],http:[],peakBytes:0,peakPages:0,peakDecodes:0,maskMethod:'conservativeMaskStrips',anchors:ANCHORS,sourceClockRetimed:false};
let environmentBytes=0,environmentReserved=0,canvasBytes=0,projection,calibration,clip,images={},disposed=false,playing=false,elapsed=0,startTime=0,token=0,raf=0,renderedIndex=null,lastWait=null,pendingViewport=null;
const rows=getYardPlayzoneRows('meadow'),maskBefore=JSON.stringify(rows);
const external=()=>environmentBytes+environmentReserved+canvasBytes;
const cache=new AtlasCache(new URL('./assets/clip/',import.meta.url),2,{maxDecodedBytes:MAX_BYTES,maxConcurrentDecodes:1,externalBytes:external,onEvent:event=>{
 evidence.events.push({...event,at:performance.now()});sampleBudget();
 if(event.type==='atlas-error')fail(event.message);
 if(event.type==='atlas-ready'&&calibration&&Object.keys(images).length===4)draw();
}});
function fail(error){if(disposed)return;const message=String(error?.stack||error);evidence.errors.push(message);document.querySelector('#error').textContent=message;status.textContent='Probe failed';evidence.state='error';playing=false;playButton.disabled=true;}
function sampleBudget(){const bytes=cache.decodedBytes+cache.reservedBytes+external();evidence.peakBytes=Math.max(evidence.peakBytes,bytes);evidence.peakPages=Math.max(evidence.peakPages,cache.entries.size+cache.active);evidence.peakDecodes=Math.max(evidence.peakDecodes,cache.active);if(bytes>MAX_BYTES||cache.entries.size+cache.active>2||cache.active>1)throw Error('Complete decoded budget exceeded');return bytes;}
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return r.json();}
async function loadEnvironment(manifest){
 const roles={'yard-environment-plate.webp':'plate','yard-ground-texture.webp':'ground','yard-gate.webp':'gate','yard-border-cluster.webp':'border'};
 for(const item of manifest.files){if(disposed)return false;const role=roles[item.output];if(!role)throw Error('Unexpected environment asset');const expected=item.decoded_rgba_bytes;
  if(!cache.reserveExternal(external()+expected))throw Error('Environment allocation rejected');environmentReserved=expected;sampleBudget();
  const url=new URL(`./assets/environment/${item.output}`,import.meta.url),r=await fetch(url);if(!r.ok)throw Error(`Environment HTTP ${r.status}`);const bytes=await r.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==item.output_sha256||bytes.byteLength!==item.bytes)throw Error('Environment HTTP hash mismatch');
  if(disposed){environmentReserved=0;return false;}const image=await createImageBitmap(new Blob([bytes],{type:'image/webp'}));if(disposed){image.close();environmentReserved=0;return false;}if(image.width!==item.output_size[0]||image.height!==item.output_size[1]){image.close();throw Error('Environment dimensions mismatch');}
  images[role]=image;environmentBytes+=expected;environmentReserved=0;evidence.http.push({src:url.pathname,sha256:hash,bytes:bytes.byteLength});sampleBudget();
 }
 if(environmentBytes!==7730176)throw Error('Incomplete environment ledger');return true;
}
function resize(){if(disposed||!calibration||Object.keys(images).length!==4)return;const rect=stage.getBoundingClientRect();pendingViewport={width:Math.max(1,Math.floor(rect.width)),height:Math.max(1,Math.floor(rect.height)),dpr:window.devicePixelRatio||1};draw();}
function commitResize(){if(!pendingViewport)return;const {width:w,height:h,dpr}=pendingViewport;
 const bw=Math.round(w*dpr),bh=Math.round(h*dpr),nextBytes=bw*bh*4,intermediateBytes=bw*canvas.height*4;
 if(!cache.reserveExternal(environmentBytes+canvasBytes+nextBytes+intermediateBytes))throw Error('Canvas resize allocation rejected');
 const transition=cache.decodedBytes+cache.reservedBytes+environmentBytes+canvasBytes+nextBytes+intermediateBytes;evidence.peakBytes=Math.max(evidence.peakBytes,transition);
 canvas.width=bw;canvas.height=bh;canvas.style.width=w+'px';canvas.style.height=h+'px';canvasBytes=nextBytes;projection=fitProjection(calibration,w,h);ctx.setTransform(dpr,0,0,dpr,0,0);
 evidence.events.push({type:'resize-committed',width:bw,height:bh,sourceIndex:frameAt(elapsed),at:performance.now()});pendingViewport=null;sampleBudget();
}
function draw(){if(disposed||!calibration||!clip||Object.keys(images).length!==4)return false;
 const index=frameAt(elapsed),set=workingSet(clip,index);cache.prepare(set.visible,set.next);const frame=cache.frame(clip,index);
 if(!frame){if(lastWait!==index){evidence.events.push({type:'media-wait',index,elapsedMs:elapsed,at:performance.now()});lastWait=index;}if(pendingViewport&&!pendingViewport.reported){evidence.events.push({type:'resize-deferred',requested:{...pendingViewport},heldIndex:renderedIndex,requestedIndex:index,at:performance.now()});pendingViewport.reported=true;}return false;}
 lastWait=null;commitResize();if(!projection)return false;ctx.clearRect(0,0,projection.width,projection.height);
 const result=drawLayeredEnvironment(ctx,projection,images,{maskRows:rows,entry:ANCHORS.entry,borderAnchors:[{x:6,y:46},{x:7,y:60},{x:13,y:84},{x:92,y:34},{x:98,y:54},{x:85,y:85}]});
 if(result.decodedBytes!==environmentBytes||JSON.stringify(rows)!==maskBefore)throw Error('Environment/source mask changed');
 const anchor=projection.project(ANCHORS.fountain);if(!cache.draw(ctx,clip,index,anchor,projection.ppu))throw Error('Atlas disappeared during draw');
 if(guides.checked){ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(242,255,207,.6)';ctx.beginPath();for(const points of groundGuides(rows,projection)){points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}ctx.stroke();
  ctx.font='11px system-ui';ctx.fillStyle='#fff';for(const [name,world]of Object.entries(ANCHORS)){const p=projection.project(world);ctx.strokeStyle='#ffe095';ctx.beginPath();ctx.moveTo(p.x-5,p.y);ctx.lineTo(p.x+5,p.y);ctx.moveTo(p.x,p.y-5);ctx.lineTo(p.x,p.y+5);ctx.stroke();ctx.fillText(`${name} ${world.x},${world.y}`,p.x+7,p.y-7);}ctx.restore();}
 const scale=projection.ppu/clip.pixelsPerWorld,bounds=clip.frames[index].alphaBoundsPx.map((v,i)=>(i%2?anchor.y-clip.pivotPx[1]*scale:anchor.x-clip.pivotPx[0]*scale)+v*scale);
 if(bounds[0]<0||bounds[1]<0||bounds[2]>projection.width||bounds[3]>projection.height)throw Error('Composite clips outside canvas');
 if(renderedIndex!==index)evidence.draws.push({index,sourceFrame:101+index,sourceMs:4000+index*40,elapsedMs:elapsed,clockNow:performance.now(),playing,alphaBounds:bounds});renderedIndex=index;
 evidence.current={index,sourceMs:4000+index*40,elapsedMs:elapsed,bytes:sampleBudget(),canvasBytes,environmentBytes,atlasBytes:cache.decodedBytes,reservedAtlasBytes:cache.reservedBytes,anchors:Object.fromEntries(Object.entries(ANCHORS).map(([k,v])=>[k,projection.project(v)])),projection:{ppu:projection.ppu,artwork:projection.artwork},gate:result.gate};
 status.textContent=`${index}/25 · ${(sampleBudget()/1048576).toFixed(1)} MiB`;
 if(!playing&&elapsed===1000){evidence.state='held-endpoint';playButton.disabled=false;}
 return true;
}
async function readyFrame(index){const set=workingSet(clip,index);cache.prepare(set.visible,set.next);await Promise.all([...set.visible,...set.next].map(r=>{const q=cache.request(r.clip,r.index);return cache.load(q.src,'demand',q);}));}
async function play(){if(playing||!evidence.ready)return;const own=++token;playButton.disabled=true;evidence.state='preparing';elapsed=0;await readyFrame(0);if(own!==token||disposed)return;
 startTime=performance.now();playing=true;evidence.state='playing';const entry={start:startTime,sourceStartMs:4000,sourceEndMs:5000,rate:1};evidence.plays.push(entry);
 const tick=now=>{try{if(own!==token||disposed)return;elapsed=Math.min(1000,now-startTime);if(elapsed>=1000){playing=false;entry.endpointRequestedAt=now;entry.wallDurationMs=now-startTime;evidence.state='waiting-endpoint';}draw();if(playing)raf=requestAnimationFrame(tick);}catch(error){fail(error);}};raf=requestAnimationFrame(tick);
}
async function reset(){const own=++token;cancelAnimationFrame(raf);playing=false;elapsed=0;renderedIndex=null;playButton.disabled=true;evidence.state='resetting';await readyFrame(0);if(disposed||own!==token)return;draw();evidence.state='ready';playButton.disabled=false;}
window.__yardEnvironmentProbe={snapshot:()=>{const indices=[...new Set(evidence.draws.map(r=>r.index))].sort((a,b)=>a-b);return structuredClone({...evidence,drawnFrameCoverage:{indices,count:indices.length,expected:26,allNativeRowsDisplayed:indices.length===26}});},play,reset};
playButton.addEventListener('click',()=>play().catch(fail));resetButton.addEventListener('click',()=>reset().catch(fail));guides.addEventListener('change',()=>{try{draw();}catch(error){fail(error);}});
window.addEventListener('resize',()=>{try{resize();}catch(error){fail(error);}});
window.addEventListener('pagehide',()=>{disposed=true;++token;cancelAnimationFrame(raf);cache.dispose();for(const image of Object.values(images))image.close();images={};environmentBytes=0;environmentReserved=0;evidence.ready=false;evidence.state='disposed';});
try{[calibration,clip]=await Promise.all([json('./calibration.json'),json('./assets/clip/clip.json')]);validateClip(clip,calibration);clip.assetBaseURL=new URL('./assets/clip/',import.meta.url).href;const loaded=await loadEnvironment(await json('./assets/environment/runtime-environment-manifest.json'));if(loaded&&!disposed){resize();await readyFrame(0);if(!disposed){draw();evidence.ready=true;evidence.state='ready';playButton.disabled=false;resetButton.disabled=false;}}}catch(error){fail(error);}
