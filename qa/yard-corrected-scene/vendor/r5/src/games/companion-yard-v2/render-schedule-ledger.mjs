/** Read-only, source-bound delivery accounting. This never installs a pack,
 * changes a semantic clip, or treats logical frames as unique render jobs. */
import {digest} from '../../../game-logic/yard-v2/util.mjs';
import {bindRenderPack,REQUIRED_ACTORS,sourceDescriptorDigest} from './render-pack.mjs';
import {canvasResizePeakBytes,fullActorCapacity,pageOwnerLedger} from './decoded-capacity.mjs';
import {uiImageLifetimeLedger,UI_IMAGE_INVENTORY} from './ui-image-reserve.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sum=rows=>rows.reduce((n,row)=>n+row.bytes,0);
const collections=entry=>({clips:entry.manifest.clips,walk:entry.manifest.walk?.facings,turns:entry.manifest.turns,extra:entry.manifest.extraSourceClips||{}});
const semantics=['id','frameCount','fps','sourceSampleMs','durationMs','sourceTimesMs','inclusiveEndpoint','restLoop','phaseSamples','condition','assetRoot','assetRevision','frameAliases'];
const ownerURL=(src,baseURL,revision)=>{const url=new URL(src,baseURL);url.searchParams.set('yard-media',revision);return url.href;};
function assertActors(entries){
 if(!entries||!same(Object.keys(entries).sort(),[...REQUIRED_ACTORS].sort()))throw Error('Exact eight validated semantic actor entries required');
 for(const [id,entry]of Object.entries(entries))if(entry?.reference?.id!==id||!entry.reference.revision||!entry.manifest?.manifestRevision)throw Error('Actor source identity required');
}
function assertCanvas(value){
 if(!Array.isArray(value)||value.length!==2||value.some(n=>!Number.isSafeInteger(n)||n<1))throw Error('Actual positive integer canvas backing dimensions required');
}

/** Entries must come from the same validated actor adapters used by the scene.
 * Raw manifest hashes are not equivalent: assetRevision is part of each bound
 * source digest. No source times are inferred from a nominal fps. */
export function createLogicalSchedulePlan(entries){
 assertActors(entries);const actors={};
 for(const id of REQUIRED_ACTORS){
  const entry=entries[id],clips={};
  for(const [kind,rows]of Object.entries(collections(entry))){
   if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('Complete semantic clip collections required');
   for(const [key,source]of Object.entries(rows)){
    if(!Number.isSafeInteger(source?.frameCount)||source.frameCount<1)throw Error('Complete logical frame count required');
    const timing=Object.fromEntries(semantics.filter(k=>Object.hasOwn(source,k)).map(k=>[k,structuredClone(source[k])]));
    clips[`${kind}:${key}`]={sourceDescriptorSha256:sourceDescriptorDigest(source),logicalFrameCount:source.frameCount,
     logicalFrameRange:{first:0,endExclusive:source.frameCount},sourceFields:timing};
   }
  }
  if(!Object.keys(clips).length)throw Error('Every actor needs actual semantic clips');
  actors[id]={actorProfile:structuredClone(entry.reference),sourceManifestRevision:entry.manifest.manifestRevision,
   semanticClipCount:Object.keys(clips).length,logicalFrameCount:Object.values(clips).reduce((n,c)=>n+c.logicalFrameCount,0),clips};
 }
 const plan={format:'yard-source-bound-logical-schedule/v1',scope:'Every consumer descriptor and logical frame; no source-state aliases, render-job estimate, or runtime activation.',
  actors,semanticClipCount:Object.values(actors).reduce((n,a)=>n+a.semanticClipCount,0),
  logicalFrameCount:Object.values(actors).reduce((n,a)=>n+a.logicalFrameCount,0)};
 return{...plan,sha256:digest(plan)};
}

/** All possible resource URLs remain charged for the component lifetime.
 * CSS/DOM ownership follows the live reserve implementation; it does not prove
 * that a browser shares decode buffers between repeated image elements. */
export const completeUiLifetimeReserve=uiImageLifetimeLedger;

/** A conservative sufficient bound over independently varying actor pages.
 * Complete clip/frame binding is mandatory before actual page maxima can be
 * used. This is not a sampled synchronized timeline or browser-RSS measurement. */
export function auditRenderSchedule(pack,entries,stillContracts,{origin,canvas,resizeCanvas=canvas,uiInventory=UI_IMAGE_INVENTORY,
 limitBytes=64*1024*1024,slotLimit=16}={}){
 assertCanvas(canvas);assertCanvas(resizeCanvas);
 const logical=createLogicalSchedulePlan(entries),bound=bindRenderPack(pack,entries,stillContracts,{origin});
 const actorPages={},actors={},physicalOwners=[];
 for(const id of REQUIRED_ACTORS){
  const source=logical.actors[id],clips={};actorPages[id]=[];
  for(const [key,planned]of Object.entries(source.clips)){
   const row=pack.actors[id].clips[key],pages=row.pages.map(page=>({owner:ownerURL(page.src,bound.catalog.baseURL,bound.revision),width:page.width,height:page.height}));
   actorPages[id].push(...pages);physicalOwners.push(...pages);
   const runs=[];let previous=null;
   for(const frame of row.runtimeCells.frames){
    const owner=pages[frame.pageIndex].owner;
    if(previous?.owner===owner&&previous.endExclusive===frame.index)previous.endExclusive++;
    else{previous={first:frame.index,endExclusive:frame.index+1,owner};runs.push(previous);}
   }
   clips[key]={...planned,renderSourceArtifactSha256:row.sourceArtifactSha256,runtimeCellsSha256:digest(row.runtimeCells),
    pageRows:pages,frameOwnerRuns:runs,coveredLogicalFrames:runs.reduce((n,r)=>n+r.endExclusive-r.first,0)};
  }
  const owners=[...pageOwnerLedger(actorPages[id]).values()],maximumBytes=Math.max(...owners.map(row=>row.bytes));
  actors[id]={...source,clips,distinctPageOwners:owners.length,pageInventoryBytes:sum(owners),maximumCurrentPageBytes:maximumBytes,
   maximumCurrentOwners:owners.filter(row=>row.bytes===maximumBytes).map(row=>row.owner)};
 }
 const atlasOwners=[...pageOwnerLedger(physicalOwners).values()];
 const staticRows=[...bound.stills.values()].map(({meta,url})=>({owner:ownerURL(url,bound.catalog.baseURL,bound.revision),width:meta.canvas[0],height:meta.canvas[1]}));
 staticRows.push(...Object.values(bound.environment).map(row=>({owner:ownerURL(row.src,bound.catalog.baseURL,bound.revision),width:row.canvas[0],height:row.canvas[1]})));
 const staticOwners=[...pageOwnerLedger(staticRows).values()],ui=completeUiLifetimeReserve(bound.catalog,uiInventory);
 const cottageLayerBytes=448*448*4,cottageMaskPeakBytes=cottageLayerBytes,canvasPeakBytes=canvasResizePeakBytes(...canvas,...resizeCanvas);
 const nonAtlas={staticImageInventoryBytes:sum(staticOwners),cottageLayerBytes,cottageMaskPeakBytes,uiLifetimeBytes:ui.bytes,
  oldCanvasBytes:canvas[0]*canvas[1]*4,newCanvasBytes:resizeCanvas[0]*resizeCanvas[1]*4,canvasResizePeakBytes:canvasPeakBytes};
 const nonAtlasPeakBytes=nonAtlas.staticImageInventoryBytes+cottageLayerBytes+cottageMaskPeakBytes+ui.bytes+canvasPeakBytes;
 const capacity=fullActorCapacity(actorPages,nonAtlasPeakBytes,{limitBytes,slotLimit});
 const report={format:'yard-complete-render-schedule-ledger/v1',renderRevision:bound.revision,logicalScheduleSha256:logical.sha256,
  sourceBindingComplete:true,semanticClipCount:logical.semanticClipCount,logicalFrameCount:logical.logicalFrameCount,actors,
  decodedOwnerPolicy:'AtlasCache and scene ImageBitmaps own separate decode allocations even when the resource URL matches. UI resources are separately reserved.',
  atlasOwners,staticOwners,stillConsumerBindings:[...bound.stills].map(([id,row])=>({id,sourceBindings:row.sourceBindings,sourceArtifactSha256:row.meta.renderSourceArtifactSha256})),ui,nonAtlas,capacity:{...capacity,limitBytes,slotLimit,
   policy:'Sum eight independent maximum current pages, one largest pending page, all static owners, cottage layer and mask, lifetime UI resources, and old plus new resize backings.',
   pendingDecodeCount:1,queuedUndecodedBytes:0,queuedPolicy:'Queued jobs allocate no pixels; the serial decoder reserves the full declared page before decoding.',
   extraRetainedPagesPolicy:'AtlasCache must evict unpinned retained pages before a reserved allocation; actual retained plus pending bytes remain capped.'},
  acceptance:{installed:false,browserQualified:false,fullEightVisualAcceptance:false,scope:'Validated metadata and logical RGBA/backing capacity only; does not certify actual export pixels, animation quality, browser scratch, fonts, GPU/compositor copies or process RSS.'}};
 return{...report,sha256:digest(report)};
}
