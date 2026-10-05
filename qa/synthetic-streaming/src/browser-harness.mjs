import {AtlasCache} from '../vendor/r5/atlas.mjs';
import {validateRuntimeCells,runtimeCellDrawArguments} from '../vendor/r5/runtime-cells.mjs';
import {EncodedPrefetch} from './encoded-prefetch.mjs';
import {PrefetchedAtlasCache} from './prefetched-atlas.mjs';
import {LIMIT,RESERVES,capacity} from './capacity.mjs';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function fixture(){const b=await(await fetch('/generated/manifest.json',{cache:'no-store'})).arrayBuffer();
  return {manifest:JSON.parse(new TextDecoder().decode(b)),digest:await hash(b)};}
function clipFor(row,manifest,{owner=0,alias=false,name='proof',fetchMs=0,digest}) {
  const p=manifest.pages[row.pageIndex];
  const clip={id:`fixture-${row.sourceIndex}`,frameCount:1,canvas:row.canvas,pivotPx:row.pivotPx,
    pixelsPerWorld:100,verifySourceBytes:true,pages:[{...p,
      src:`/${p.src}?case=${encodeURIComponent(name)}&owner=${alias?0:owner}&delay=${fetchMs}&revision=${digest}`,
      first:0,count:1}],runtimeCells:{format:'yard-runtime-cells/v1',safeEdgePx:10,
      atlasGutterPx:2,imageSmoothingQuality:'low',frames:[row.frame]}};
  return clip;
}
export async function verifyBrowserPixels() {
  const {manifest,digest}=await fixture(),results=[];
  for(const count of [3,4,5]) {
    const p=manifest.pages.findIndex(p=>p.count===count),row=manifest.frames.find(f=>f.pageIndex===p);
    const clip=clipFor(row,manifest,{digest});validateRuntimeCells(clip);
    const bytes=await(await fetch(clip.pages[0].src)).arrayBuffer();
    check(await hash(bytes)===clip.pages[0].sha256,'Source SHA mismatch');
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/webp'}));
    const [sx,sy,w,h]=row.frame.atlasRect,[ox,oy]=row.frame.cropOriginPx;
    const native=document.createElement('canvas');[native.width,native.height]=row.canvas;
    native.getContext('2d').drawImage(bitmap,sx,sy,w,h,ox,oy,w,h);
    const a=document.createElement('canvas'),b=document.createElement('canvas');
    a.width=b.width=480;a.height=b.height=400;
    const ac=a.getContext('2d',{willReadFrequently:true}),bc=b.getContext('2d',{willReadFrequently:true});
    for(const c of [ac,bc]){c.fillStyle='#bcbcaf';c.fillRect(0,0,480,400);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='low';}
    ac.drawImage(...runtimeCellDrawArguments(row.frame,bitmap,{x:240,y:340},75,100));
    bc.drawImage(native,0,0,704,576,240-352*.75,340-500*.75,704*.75,576*.75);
    const ap=ac.getImageData(0,0,480,400).data,bp=bc.getImageData(0,0,480,400).data;
    let maxDifference=0,differentChannels=0;
    for(let i=0;i<ap.length;i++){const d=Math.abs(ap[i]-bp[i]);maxDifference=Math.max(maxDifference,d);if(d)differentChannels++;}
    check(maxDifference<=2,'Crop/reembedded opaque-ground drawing differs beyond round-trip tolerance');
    results.push({count,sourceSHA:clip.pages[0].sha256,maxDifference,differentChannels,
      directR5DrawAndReembeddedCompared:true});
    bitmap.close();for(const c of [native,a,b]){c.width=1;c.height=1;}
  }
  return {fixtureOnly:true,manifestSha256:digest,pixelComparisons:results,
    outsideTimedInterval:true,notArtApproval:true};
}
export async function runCase(spec) {
  const {manifest,digest}=await fixture(),scope=capacity(spec.width,spec.height,spec.dpr);
  check(scope.fits,'Capacity profile rejected before canvas allocation');
  check(devicePixelRatio===spec.dpr,'Unexpected browser DPR');
  const canvas=document.createElement('canvas'),pendingCanvas=document.createElement('canvas');
  for(const c of [canvas,pendingCanvas]){[c.width,c.height]=scope.backing;c.style.width=`${spec.width}px`;c.style.height=`${spec.height}px`;}
  document.body.append(canvas);const ctx=canvas.getContext('2d',{alpha:true});
  // Touch both backing stores before the timing interval. The second is reserved
  // for a concurrent resize allocation; it does not claim a real HUD render.
  pendingCanvas.getContext('2d').fillRect(0,0,pendingCanvas.width,pendingCanvas.height);
  ctx.fillRect(0,0,canvas.width,canvas.height);
  const physicalPages=new Map(),clips=Array.from({length:spec.owners},(_,owner)=>manifest.frames.map(row=>{
    const clip=clipFor(row,manifest,{...spec,owner,digest});validateRuntimeCells(clip,{physicalPages,baseURL:location.href});return clip;
  }));
  let atlas,pool,prepares=0,encodedPrepares=0,stage='warmup',start=0,decodeActive=0;
  const peaks={decodedAndReserved:0,actuallyAllocatedPlusReserved:0,pageSlots:0,decodeReservations:0,
    bitmapCalls:0,encodedReserved:0,encodedRetained:0,encodedOwners:0,networkActive:0};
  const events=[],samples=[],requested=new Set(),drawn=new Set(),missed=new Set(),errors=[],readyEvents=[];
  let pendingActorSamples=0,pendingTicks=0,fetchCount=0,fetchBytes=0,decodeCalls=0;
  const nativeFetch=globalThis.fetch,nativeBitmap=globalThis.createImageBitmap;
  function sample(){if(!atlas)return;
    const owned=atlas.decodedBytes+atlas.reservedBytes+scope.externalBytes;
    check(owned<=LIMIT,'Decoded ledger exceeded');check(atlas.entries.size+atlas.active<=16,'Page slots exceeded');
    check(atlas.active<=1&&decodeActive<=1,'Single decode reservation violated');
    if(pool){check(pool.reservedBytes<=2097152,'Encoded reservation exceeded');check(pool.entries.size<=24,'Encoded owners exceeded');check(pool.active<=4,'Network stage exceeded');}
    peaks.decodedAndReserved=Math.max(peaks.decodedAndReserved,owned);
    peaks.actuallyAllocatedPlusReserved=Math.max(peaks.actuallyAllocatedPlusReserved,atlas.decodedBytes+atlas.reservedBytes+scope.twoBackingBytes);
    peaks.pageSlots=Math.max(peaks.pageSlots,atlas.entries.size+atlas.active);
    peaks.decodeReservations=Math.max(peaks.decodeReservations,atlas.active);peaks.bitmapCalls=Math.max(peaks.bitmapCalls,decodeActive);
    if(pool)for(const [key,value] of Object.entries({encodedReserved:pool.reservedBytes,encodedRetained:pool.retainedBytes,
      encodedOwners:pool.entries.size,networkActive:pool.active}))peaks[key]=Math.max(peaks[key],value);
  }
  const event=e=>{events.push({...e,stage,atMs:start?performance.now()-start:null});
    if(e.type==='atlas-ready')readyEvents.push(e);
    if(e.type==='atlas-error'||e.type==='encoded-error')errors.push({...e,stage});sample();};
  globalThis.fetch=async(...args)=>{const response=await nativeFetch(...args);fetchCount++;fetchBytes+=Number(response.headers.get('content-length')||0);return response;};
  globalThis.createImageBitmap=async(...args)=>{decodeActive++;decodeCalls++;sample();try{return await nativeBitmap(...args);}finally{decodeActive--;sample();}};
  if(spec.prefetch)pool=new EncodedPrefetch({fetcher:globalThis.fetch,onEvent:event});
  const options={maxDecodedBytes:LIMIT,maxConcurrentDecodes:1,externalBytes:()=>scope.externalBytes,onEvent:event};
  atlas=spec.prefetch?new PrefetchedAtlasCache(location.href,16,{...options,encoded:pool}):new AtlasCache(location.href,16,options);
  const basePrepare=atlas.prepare.bind(atlas);
  atlas.prepare=(required,future)=>{prepares++;check(required.length===spec.owners,'Aggregate owner set required');return basePrepare(required,future);};
  function prepare(at){const index=Math.min(123,Math.floor(at/50)),currentPage=manifest.frames[index].pageIndex;
    const next=[];for(let p=currentPage+1;p<manifest.pages.length&&next.length<2;p++)next.push(manifest.pages[p].first);
    const required=clips.map(c=>({clip:c[index],index:0}));
    const future=next.flatMap(n=>clips.map(c=>({clip:c[n],index:0})));
    if(pool){encodedPrepares++;pool.prepare([...required,...future].map(r=>atlas.request(r.clip,r.index)));}
    atlas.prepare(required,future.slice(0,spec.owners));return {index,required};
  }
  const warmStart=performance.now();
  try {
    prepare(0);await Promise.all([...atlas.pending.values()]);
    if(pool)await Promise.all([...pool.entries.values()].map(e=>e.promise));
    const warmupMs=performance.now()-warmStart,warmupFetchCount=fetchCount;
    stage='timed';start=performance.now();
    await new Promise((resolve,reject)=>{function tick(){try{
      const at=performance.now()-start;if(at>=manifest.durationMs){resolve();return;}
      const {index,required}=prepare(at);ctx.clearRect(0,0,canvas.width,canvas.height);
      let readyMask=0,pendingThisTick=0;
      for(const [owner,r] of required.entries()) {
        const key=`${owner}:${index}`;requested.add(key);
        const ready=!!atlas.frame(r.clip,0);
        const didDraw=atlas.draw(ctx,r.clip,0,{x:120+(owner%4)*Math.min(330,canvas.width/4),y:330+Math.floor(owner/4)*320},85);
        check(didDraw===ready,'Readiness and draw disagree');
        if(didDraw){drawn.add(key);readyMask|=1<<owner;}else{missed.add(key);pendingActorSamples++;pendingThisTick++;}
      }
      if(pendingThisTick)pendingTicks++;sample();samples.push({atMs:at,sourceIndex:index,readyMask});
      requestAnimationFrame(tick);
    }catch(error){reject(error);}}requestAnimationFrame(tick);});
    const endedAtMs=performance.now()-start;stage='cleanup';
    const pending=[...atlas.pending.values()];atlas.dispose();pool?.dispose();await Promise.allSettled(pending);
    const cleanupStart=performance.now();while(pool?.active&&performance.now()-cleanupStart<5000)await new Promise(r=>setTimeout(r,5));
    check(atlas.decodedBytes===0&&atlas.reservedBytes===0&&atlas.active===0,'Decoded cleanup leak');
    check(!pool||(pool.reservedBytes===0&&pool.active===0),'Encoded cleanup leak');
    check(prepares===samples.length+1,'Exactly one aggregate prepare per tick plus warmup');
    check(!pool||encodedPrepares===prepares,'One encoded prepare per aggregate tick');
    const expected=124*spec.owners,gaps=samples.slice(1).map((s,i)=>s.atMs-samples[i].atMs);
    const hardErrors=errors.filter(e=>!e.message.includes('AbortError'));
    const result={...spec,testFixtureOnly:true,actualActorsTested:false,manifestSha256:digest,
      clock:'performance.now with requestAnimationFrame; no waits or slow clock within timed interval',
      warmupMs,warmupFetchCount,timedDurationMs:6200,endedAtMs,timedTicks:samples.length,
      aggregatePrepareCalls:prepares,encodedPrepareCalls:encodedPrepares,
      expectedSourceWindows:expected,distinctWindowsDrawn:drawn.size,windowsNeverDrawn:expected-drawn.size,
      windowsNeverSampled:expected-requested.size,sampledWindowsNeverReady:[...requested].filter(k=>!drawn.has(k)).length,
      windowsWithAnyPendingTick:missed.size,pendingActorSamples,pendingTicks,
      noPendingActorSamples:pendingActorSamples===0,allSourceWindowsDrawn:drawn.size===expected,
      maxRafGapMs:Math.max(0,...gaps),fetchCount,fetchBytes,decodeCalls,peaks,scope,reservations:RESERVES,
      uiStillsCottageActuallyAllocated:false,canvasBackingStoresActuallyAllocated:2,
      ownedEncodedConservativeBoundBytes:2097152+4*262144+4*262144+2*262144,
      excludedMemory:'Browser HTTP buffers/cache, codec workspaces, GPU allocations, GC retention and process RSS',
      endedDecodedBytes:atlas.decodedBytes+atlas.reservedBytes,endedEncodedBytes:pool?.reservedBytes||0,
      browser: navigator.userAgent,sourceWindowSamples:samples,errors:hardErrors,
      expectedAbortEvents:errors.length-hardErrors.length,
      readyEvents:readyEvents.map(e=>({fetchMs:e.fetchMs,decodeMs:e.decodeMs,totalMs:e.totalMs})),events};
    return result;
  }finally {
    atlas.dispose();pool?.dispose();globalThis.fetch=nativeFetch;globalThis.createImageBitmap=nativeBitmap;
    canvas.remove();canvas.width=canvas.height=pendingCanvas.width=pendingCanvas.height=1;
  }
}
window.syntheticHarness={runCase,verifyBrowserPixels,capacity};
