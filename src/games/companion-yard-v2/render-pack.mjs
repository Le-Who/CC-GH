/** Visual delivery only. No actor admission, motion roots, economy or receipt changes. */
import {ACCEPTED_RENDER_PACK_REVISION} from './render-pack-policy.mjs';
import {digest} from '../../../game-logic/yard-v2/util.mjs';
import {PRESENTATION_CAMERA_DIRECTION,SCENE45_REVISION} from './scene45-transform.mjs';
import {validateRuntimeCells} from './runtime-cells.mjs';
import {pageOwnerLedger} from './decoded-capacity.mjs';
export const RENDER_PACK_URL='/assets/yard-scene45/render-pack.json';
export const REQUIRED_ACTORS=Object.freeze(['mika','mochi','pebble','pip','willow','starlit','basil','sage']);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fail(message){const error=Error(message);error.code='YARD_CAMERA_MEDIA_UNAVAILABLE';throw error;}
export function sourceDescriptorDigest(value){const copy={...value};delete copy.assetBaseURL;delete copy.assetURL;return digest(copy);}
const camera=value=>same(value,PRESENTATION_CAMERA_DIRECTION);
function imageDescriptor(row){
 if(!row||!hash(row.sha256)||!Number.isSafeInteger(row.encodedBytes)||row.encodedBytes<1||row.canvas?.length!==2||!row.canvas.every(n=>Number.isSafeInteger(n)&&n>0)
  ||row.decodedBytes!==row.canvas[0]*row.canvas[1]*4||row.decodedBytes>8*1024*1024||row.src!==`media/${row.sha256}.webp`)fail('Verified bounded content-addressed image required');
 return row;
}
function calibration(row){
 if(row?.canvas?.length!==2||!row.canvas.every(n=>Number.isSafeInteger(n)&&n>0)||row.sourceOrigin?.length!==3||!row.sourceOrigin.every(Number.isFinite)
  ||!same(row.sourceRect,{x:0,y:0,width:row.canvas[0],height:row.canvas[1]}))fail('Complete native canvas, full source rectangle and source origin required');
 if(!camera(row.cameraDirection)||row.projection!=='orthographic'||row.shadowMode!=='source-composite'||row.labelsBaked!==false||row.runtimeSpriteRotationAllowed!==false
  ||row.pivotPx?.length!==2||!row.pivotPx.every(Number.isFinite)||!Number.isFinite(row.pixelsPerWorld)||row.pixelsPerWorld<=0)fail('New camera source pixels, pivot and scale required');
}
export function validateRenderPack(pack){
 const unsealed={...pack};delete unsealed.revision;
 if(!pack||pack.format!=='yard-scene-render-pack/v1'||pack.sceneRevision!==SCENE45_REVISION||pack.unitsPerWorld!==8||!camera(pack.cameraDirection)||!hash(pack.revision)||digest(unsealed)!==pack.revision)fail('Complete verified45-degree render pack required');
 if(!same(Object.keys(pack.actors||{}).sort(),[...REQUIRED_ACTORS].sort()))fail('All eight actor render bindings, including Pip, are required');
 if(!same(Object.keys(pack.environment||{}).sort(),['cottage','ground']))fail('Both selected environment images are required');
 Object.values(pack.environment).forEach(imageDescriptor);
 const backgrounds={ground:'b0c3f9f9d3a52831440269c1cded91c5fb750ce20aace2b940d41ee693d1f908',cottage:'5b894712c3473184c1cf70f7a3e8f7506d328b4b636f8187793a004ff2cff4e3'};
 for(const [id,sha]of Object.entries(backgrounds))if(pack.environment[id].sha256!==sha||!same(pack.environment[id].canvas,[1024,1536]))fail('Selected cottage10 background pixels required');
 if(!pack.catalog||!same(Object.keys(pack.catalog.goodies||{}).sort(),['fountain_bowl','leaf_pot','moon_lamp','snack_table','sun_cushion','yarn_mouse']))fail('Complete source-matched goodie previews required');
 for(const conditions of Object.values(pack.catalog.goodies)){if(!Object.hasOwn(conditions,'new'))fail('Every goodie needs its own source preview');for(const row of Object.values(conditions))imageDescriptor(row);}
 if(!same(Object.keys(pack.catalog.foods||{}).sort(),['berry_plate','bonito_bowl','empty_bowl','kibble']))fail('Complete source-matched food previews required');
 Object.values(pack.catalog.foods).forEach(imageDescriptor);return pack;
}
export function validateInstalledRenderPack(pack){
 if(!ACCEPTED_RENDER_PACK_REVISION||pack?.revision!==ACCEPTED_RENDER_PACK_REVISION)fail('No accepted complete visual source revision is installed');
 return validateRenderPack(pack);
}
/** Group semantic consumers without equating distinct source descriptors. A
 * shared ID can own one bitmap only when its complete native pixel/calibration
 * identity agrees and actor-specific rig evidence is explicitly accounted for. */
export function groupStillContracts(contracts){
 const grouped=new Map();
 for(const contract of contracts){
  if(!contract?.id||!contract.meta)fail('Complete semantic still contract required');
  const rows=grouped.get(contract.id)||[];rows.push(contract);grouped.set(contract.id,rows);
 }
 for(const rows of grouped.values())if(rows.length>1){
  const consumers=new Set(),identities=[];
  for(const {consumerId,meta}of rows){
   if(typeof consumerId!=='string'||!consumerId||consumers.has(consumerId)||meta.providerIndependentPixels!==true)fail('Explicit unique consumers and shared-pixel evidence required');
   consumers.add(consumerId);
   const identity={...meta};delete identity.assetBaseURL;delete identity.assetURL;
   if(Object.hasOwn(meta,'sourceRigSha256')){
    if(!hash(meta.sourceRigSha256)||meta.sourceRigSha256ByActor?.[consumerId]!==meta.sourceRigSha256)fail('Shared still actor rig evidence mismatch');
    delete identity.sourceRigSha256;
   }
   identities.push(digest(identity));
  }
  if(new Set(identities).size!==1)fail('Shared still pixels or native calibration disagree');
 }
 return grouped;
}
export function bindRenderPack(pack,entries,stillContracts,{origin}={}){
 validateRenderPack(pack);if(!origin)fail('Same-origin visual root required');
 if(!same(Object.keys(entries).sort(),[...REQUIRED_ACTORS].sort()))fail('Exact eight semantic actor entries required');
 const baseURL=new URL('/assets/yard-scene45/',origin).href,clipMap=new WeakMap(),bound=new WeakSet(),stills=new Map(),physicalPages=new Map();
 for(const [actorId,entry]of Object.entries(entries)){
  const visual=pack.actors[actorId];if(visual.sourceManifestRevision!==entry.manifest.manifestRevision||!same(visual.actorProfile,entry.reference))fail('Visual pack does not identify the accepted actor source');
  const collections={clips:entry.manifest.clips,walk:entry.manifest.walk.facings,turns:entry.manifest.turns,extra:entry.manifest.extraSourceClips||{}};
  const expected=Object.entries(collections).flatMap(([kind,rows])=>Object.keys(rows||{}).map(id=>`${kind}:${id}`)).sort();
  if(!same(Object.keys(visual.clips||{}).sort(),expected))fail('Complete actor clip, walk and turn coverage required');
  for(const [kind,rows]of Object.entries(collections))for(const [id,source]of Object.entries(rows||{})){
   const row=visual.clips[`${kind}:${id}`];calibration(row);
   if(row.sourceDescriptorSha256!==sourceDescriptorDigest(source)||!hash(row.sourceArtifactSha256)||row.frameCount!==source.frameCount)fail('Visual source descriptor or frame identity mismatch');
   for(const p of row.pages||[])imageDescriptor({...p,canvas:[p.width,p.height]});
   try{validateRuntimeCells(row,{physicalPages,baseURL});}catch{fail('Complete verified native crop metadata required');}
   const clip={...source,canvas:[...row.canvas],sourceRect:{...row.sourceRect},sourceOrigin:[...row.sourceOrigin],renderSourceArtifactSha256:row.sourceArtifactSha256,shadowMode:row.shadowMode,cameraDirection:[...row.cameraDirection],pixelsPerWorld:row.pixelsPerWorld,pivotPx:[...row.pivotPx],runtimeCells:structuredClone(row.runtimeCells),pages:row.pages.map(p=>({...p})),assetBaseURL:baseURL,assetRevision:pack.revision,verifySourceBytes:true};clipMap.set(source,clip);bound.add(clip);
  }
 }
 const stillGroups=groupStillContracts(stillContracts);
 if(!same(Object.keys(pack.stills||{}).sort(),[...stillGroups.keys()].sort()))fail('Every semantic still requires new camera pixels');
 for(const [id,contracts]of stillGroups){
  const row=pack.stills[id],meta=contracts[0].meta;imageDescriptor(row);calibration(row);
  const sourceBindings=contracts.map(contract=>({consumerId:contract.consumerId||'scene',sourceDescriptorSha256:sourceDescriptorDigest(contract.meta)})).sort((a,b)=>a.consumerId.localeCompare(b.consumerId));
  if(contracts.length>1||row.sourceBindings){
   if(!same(row.sourceBindings,sourceBindings))fail('Every shared still consumer descriptor must be bound');
   if(row.sourceDescriptorSha256&&!sourceBindings.some(binding=>binding.sourceDescriptorSha256===row.sourceDescriptorSha256))fail('Still source identity mismatch');
  }else if(row.sourceDescriptorSha256!==sourceDescriptorDigest(meta))fail('Still source identity mismatch');
  if(!hash(row.sourceArtifactSha256)||contracts.some(({meta})=>['goodieId','foodId','condition'].some(key=>meta[key]!=null&&row[key]!==meta[key])))fail('Still source identity mismatch');
  if(meta.goodieId&&meta.condition&&!pack.catalog.goodies[meta.goodieId]?.[meta.condition])fail('A source condition has no matching catalog preview');
  stills.set(id,{meta:{...meta,canvas:[...row.canvas],sourceRect:{...row.sourceRect},sourceOrigin:[...row.sourceOrigin],renderSourceArtifactSha256:row.sourceArtifactSha256,shadowMode:row.shadowMode,pixelsPerWorld:row.pixelsPerWorld,pivotPx:[...row.pivotPx],worldPixelScale:row.pixelsPerWorld,cameraDirection:[...row.cameraDirection],sha256:row.sha256,encodedBytes:row.encodedBytes,assetRevision:pack.revision,verifySourceBytes:true},
   sourceBindings,sourceContracts:contracts.map(contract=>({consumerId:contract.consumerId||'scene',meta:structuredClone(contract.meta)})),url:new URL(row.src,baseURL).href});
 }
 // A crop may have a distinct encoded hash, but must identify the scene's exact native parent pixels.
 for(const [goodieId,conditions]of Object.entries(pack.catalog.goodies))for(const [condition,row]of Object.entries(conditions)){const source=pack.stills[row.stillId];if(!source||row.sourcePixelsSha256!==source.sha256||source.goodieId!==goodieId||source.condition!==condition)fail('Catalog preview and scene visual source differ');}
 for(const [foodId,row]of Object.entries(pack.catalog.foods)){const source=pack.stills[row.stillId];if(!source||row.sourcePixelsSha256!==source.sha256||source.foodId!==foodId)fail('Food preview and scene visual source differ');}
 const actorPages=Object.fromEntries(Object.entries(pack.actors).map(([id,actor])=>[id,Object.values(actor.clips).flatMap(clip=>clip.pages.map(p=>({owner:visualImageURL(p.src,baseURL,pack.revision),width:p.width,height:p.height})))]));
 pageOwnerLedger(...Object.values(actorPages));
 return{revision:pack.revision,catalog:{...pack.catalog,baseURL},stills,environment:pack.environment,actorPages,clip(source){if(bound.has(source))return source;const value=clipMap.get(source);if(!value)fail('No new-camera pixels for the requested source clip');return value;}};
}
export function visualImageURL(src,baseURL,revision){const url=new URL(src,baseURL);if(revision)url.searchParams.set('yard-media',revision);return url.href;}
export function renderCatalogPreview(catalog,kind,id,{condition='new'}={}){
 const own=(object,key)=>Object.hasOwn(object||{},key),conditions=own(catalog?.goodies,id)?catalog.goodies[id]:null;
 const row=kind==='goodie'&&own(conditions,condition)?conditions[condition]:kind==='food'&&own(catalog?.foods,id)?catalog.foods[id]:null;
 return row?new URL(row.src,catalog.baseURL).href:null;
}
