import {OwnerLedger,DECODED_LIMIT} from '../src/capacity.mjs';
import {sceneView} from '../src/scene-fixture.mjs';
import {drawSceneFrame} from '../src/draw-scene-frame.mjs';
import {createAggregateScheduler} from '../src/aggregate-scheduler.mjs';
import {createCompactBrowserSampler} from '../src/compact-browser-sampler.mjs';
import {createMochiC4S1E1Presenter} from '../runtime/candidate-presenter.mjs';
import {createR5AtlasBridge} from '../runtime/r5-atlas-bridge.mjs';
import {EncodedPrefetch} from '../vendor/streaming/encoded-prefetch.mjs';
import {PrefetchedAtlasCache} from '../vendor/streaming/prefetched-atlas.mjs';
import {validateRuntimeCells} from '../vendor/r5/src/games/companion-yard-v2/runtime-cells.mjs';
import {createSceneProjection} from '../vendor/r5/src/games/companion-yard-v2/scene45-transform.mjs';
import {createCottageLayer} from '../vendor/r5/src/games/companion-yard-v2/scene45-environment.mjs';
import {PresentationClock} from '../vendor/r5/src/games/companion-yard-v2/presentation-clock.mjs';
import {digest} from '../runtime/util.mjs';
import {MANIFEST_DIGEST} from '../runtime/contract-pins.mjs';

export function createCourtyardScene(canvas,{uiImageOwner,onView,onError}={}){
 const params=new URLSearchParams(location.search),delayMs=Number(params.get('delay')||0),autoplay=params.get('autoplay')==='1';
 if(![0,80,220].includes(delayMs))throw Error('Bounded delay profile required');
 const ledger=new OwnerLedger({complete:true,bytes:17647352,owners:61}),images=new Map(),stills={};
 const state={kind:'isolated-real-react-native-canvas-preview',actualDom:true,productionReady:false,
  runtimeActivated:false,ready:false,finished:false,errors:[],ticks:[],events:[],peakOwnedRgba:0,
  omittedSourceWindows:[],sampledWindowsNeverReady:[],ownerViolations:0,unexpectedMutationCount:0};
 window.__yardPreview=state;
 let disposed=false,raf=0,atlas,pool,bridge,scheduler,presenter,plan,config,clock,cottageLayer,projection,snapshot,observer;
 let w=0,h=0,dpr=1,backingBytes=0;
 const sample=reason=>{const row=ledger.sample(reason,atlas);state.peakOwnedRgba=Math.max(state.peakOwnedRgba,row.totalBytes);};
 const makeCanvas=(width,height)=>{const result=document.createElement('canvas');result.width=width;result.height=height;return result;};
 function resize(){
  if(!config||disposed)return;
  const rect=canvas.getBoundingClientRect(),nextW=Math.max(1,Math.round(rect.width)),nextH=Math.max(1,Math.round(rect.height));
  const nextDpr=Math.min(devicePixelRatio||1,2),bytes=Math.round(nextW*nextDpr)*Math.round(nextH*nextDpr)*4;
  if(nextW===w&&nextH===h&&nextDpr===dpr)return;
  if(atlas&&!atlas.reserveExternal(ledger.externalBytes+bytes)){state.resizeDenied=true;throw Error('Exact old plus pending canvas budget unavailable');}
  ledger.reserve('pending-canvas','canvas',bytes);sample('old-plus-pending-canvas');
  // Avoid allocating new-width × old-height between sequential DOM setters.
  // Old and final pending bytes are already reserved above; clear the old
  // backing before setting either positive dimension of the replacement.
  canvas.width=0;canvas.height=0;
  canvas.width=Math.round(nextW*nextDpr);canvas.height=Math.round(nextH*nextDpr);
  if(backingBytes)ledger.release('visible-canvas');ledger.release('pending-canvas');ledger.reserve('visible-canvas','canvas',bytes);
  backingBytes=bytes;w=nextW;h=nextH;dpr=nextDpr;projection=createSceneProjection(w,h);
 }
 function draw(at){
  const hints=scheduler.prepare([{presenter,plan}],at),base=sceneView(snapshot,at,config.catalog,config.targetStillId,config.propStillIds);
  const composed=presenter.compose(plan,at,base.props,bridge),target=composed.props.find(row=>row.slotId===plan.placement.slotId);
  const ownerCount=Number(!!composed.pose?.containsTargetProp)+Number(target.drawStandalone);
  if(ownerCount!==1)state.ownerViolations++;
  const anchor=composed.pose?{x:composed.pose.spriteAnchor[0],y:composed.pose.spriteAnchor[1],z:composed.pose.spriteAnchor[2]/8}:null;
  const actorLayers=composed.pose?[{id:composed.request.logicalKey,pose:composed.pose,anchor,draw:(ctx,p)=>bridge.draw(ctx,composed,p.project(anchor),p.ppu)}]:[];
  drawSceneFrame(canvas.getContext('2d'),{projection,images,stills,cottageLayer,view:{...base,props:composed.props},actorLayers,dpr});
  if(autoplay&&at<plan.endAt)state.ticks.push({atMs:at-plan.startAt,window:Math.floor((at-plan.startAt)/50),
   sourceAtMs:composed.pose?.frame.sourceAtMs??null,requested:hints.required[0]?.logicalKey??null,drawn:composed.pose?composed.request.logicalKey:null,
   targetStandalone:target.drawStandalone,ownerCount});
  return {...base,props:composed.props,mutable:false,mediaReady:true};
 }
 function finish(){
  const sampled=new Set(state.ticks.map(row=>row.window));const ready=new Set(state.ticks.filter(row=>row.drawn).map(row=>row.window));
  state.omittedSourceWindows=Array.from({length:148},(_,i)=>i).filter(i=>!sampled.has(i));
  state.sampledWindowsNeverReady=[...sampled].filter(i=>!ready.has(i));state.finished=true;
  state.maxRafGapMs=Math.max(0,...state.ticks.slice(1).map((row,i)=>row.atMs-state.ticks[i].atMs));
  state.sourceHold={startMs:5450,endMs:6200,displayWindows:15,distinctNativeRgbaStates:1};
  sample('completed');
 }
 function tick(){
  if(disposed)return;
  try{const at=autoplay?clock.read():plan.startAt+Math.min(7350,Math.max(0,Number(params.get('at')||3250)));
   draw(Math.min(at,plan.endAt));
   if(autoplay&&at>=plan.endAt&&!state.finished)finish();
   raf=requestAnimationFrame(tick);
  }catch(error){state.errors.push(String(error));onError?.(error);}
 }
 async function start(){
  [config]=await Promise.all([fetch('/runtime/scene.json').then(r=>r.json())]);
  const data=await fetch('/runtime/mochi.json').then(r=>r.json());if(disposed)return;
  if(digest(data.manifest)!==MANIFEST_DIGEST)throw Error('Finite media contract differs from published code');
  const sampler=createCompactBrowserSampler(data);presenter=createMochiC4S1E1Presenter({sampler,manifest:data.manifest,assetVerification:data.verification});
  plan=data.plan;snapshot=data.snapshot;state.mediaReference=presenter.reference;
  config.catalog.baseURL=location.origin+'/assets/yard-scene45/';
  for(const owner of config.extraUiOwners)ledger.reserve(owner.id,'ui-lifetime-reserve',owner.bytes);
  for(const row of config.images){
   ledger.reserve(row.id,'image',row.decodedBytes);
   const bytes=new Uint8Array(await (await fetch(row.url)).arrayBuffer());
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(bytes.length!==row.encodedBytes||hash!==row.sha256)throw Error('Scene resource identity differs');
   const im=await createImageBitmap(new Blob([bytes]));
   if(im.width!==row.canvas[0]||im.height!==row.canvas[1]){im.close();throw Error('Scene resource dimensions differ');}
   if(disposed){im.close();return;}images.set(row.id,im);stills[row.id]=row;
  }
  ledger.reserve('cottage-layer','canvas',448*448*4);ledger.reserve('cottage-mask','canvas',448*448*4);
  cottageLayer=createCottageLayer(images.get('environment:cottage'),makeCanvas);ledger.release('cottage-mask');
  const fetcher=async(url,options)=>{if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));return fetch(url,options);};
  pool=new EncodedPrefetch({fetcher,onEvent:e=>{state.events.push(e);}});
  atlas=new PrefetchedAtlasCache(location.origin+'/actor/',16,{encoded:pool,maxDecodedBytes:DECODED_LIMIT,maxConcurrentDecodes:1,externalBytes:()=>ledger.externalBytes,
   onEvent:e=>{state.events.push(e);sample(e.type);}});
  bridge=createR5AtlasBridge({atlas,assetBaseURL:location.origin+'/actor/',validateRuntimeCells});scheduler=createAggregateScheduler({atlas,encoded:pool,bridge});
  const completeUiReserve=config.uiLifetime.bytes+config.extraUiOwners.reduce((sum,row)=>sum+row.bytes,0);
  uiImageOwner.registerCatalog(config.catalog);uiImageOwner.setAdmissionCheck(next=>next.bytes<=completeUiReserve&&atlas.reserveExternal(ledger.externalBytes));
  resize();observer=new ResizeObserver(()=>{try{resize();}catch(error){state.errors.push(String(error));onError?.(error);}});observer.observe(canvas);
  const startAt=autoplay?plan.startAt:plan.startAt+Math.min(7350,Math.max(0,Number(params.get('at')||3250)));
  scheduler.prepare([{presenter,plan}],startAt);await Promise.all([...atlas.pending.values()]);
  if(disposed)return;clock=new PresentationClock();clock.update(plan.startAt);
  onView?.(draw(startAt));state.ready=true;sample('ready');tick();
 }
 start().catch(error=>{state.errors.push(String(error));onError?.(error);});
 return {update(){},setGhost(){},hit:()=>null,point:()=>null,offsetPoint:()=>null,
  dispose(){disposed=true;cancelAnimationFrame(raf);observer?.disconnect();atlas?.dispose();pool?.dispose();
   for(const [id,im]of images){im.close();ledger.release(id);}images.clear();
   if(cottageLayer){cottageLayer.width=cottageLayer.height=0;ledger.release('cottage-layer');}
   if(backingBytes){canvas.width=canvas.height=0;ledger.release('visible-canvas');}
   uiImageOwner.setAdmissionCheck(null);state.disposed=true;state.endedDecodedBytes=atlas?.decodedBytes??0;}};
}
