/** Assemble descriptors from frozen consumer-verified pixels. No rendering or art generation. */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {FAMILY_ACTOR_IDS,FAMILY_ASSETS} from '../game-logic/yard-v2/media/family-assets.mjs';
import {createFamilyMedia} from '../game-logic/yard-v2/family-media.mjs';
import {digest,clone,compareText} from '../game-logic/yard-v2/util.mjs';
const project=resolve(import.meta.dirname,'..'),pub=resolve(project,'recovery-tools/yard-family-frozen');
const load=async p=>JSON.parse(await readFile(resolve(pub,p),'utf8'));
const fox=await load('assets/yard-fox/file-manifest.json');
const rootFiles={};
for(const prefix of ['route/','interactions/','curl/','shared-props/moon/']){
 const files=fox.files.filter(f=>f.path.startsWith(prefix));
 for(const f of files){const bytes=await readFile(resolve(pub,'assets/yard-fox',f.path));if(bytes.length!==f.bytes||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error(`Changed frozen Fox media: ${f.path}`);}
 rootFiles[prefix.split('/')[0]==='shared-props'?'moon':prefix.slice(0,-1)]=files;
}
const turtles=[];
async function collectTurtles(dir,prefix=''){
 for(const e of await readdir(dir,{withFileTypes:true})){const path=prefix+e.name;if(e.isDirectory())await collectTurtles(resolve(dir,e.name),path+'/');else{const bytes=await readFile(resolve(dir,e.name));turtles.push({path:'runtime/'+path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}
}
await collectTurtles(resolve(pub,'assets/yard-turtles'));turtles.sort((a,b)=>compareText(a.path,b.path));rootFiles.turtles=turtles;
const roots=Object.fromEntries(Object.entries(rootFiles).map(([id,files])=>[id,{path:id==='turtles'?'/assets/yard-turtles/':id==='moon'?'/assets/yard-fox/shared-props/moon/':`/assets/yard-fox/${id}/`,assetRevision:digest(files),files:files.length}]));
const route=await load('assets/yard-fox/route/runtime-media.json'),interactions=await load('assets/yard-fox/interactions/runtime-media.json'),curl=await load('assets/yard-fox/curl/runtime-media.json'),moon=await load('assets/yard-fox/shared-props/moon/runtime-media.json');
const slim=(c,assetRoot)=>{const x=clone(c);delete x.sourcePngHashes;for(const p of x.pages)delete p.sourcePngHashes;return{...x,assetRoot};};
for(const actorId of FAMILY_ACTOR_IDS){
 const server=createFamilyMedia(actorId),d=FAMILY_ASSETS[actorId],profile=server.candidateProfile;
 let walk,turns,clips,stills,extras;
 if(d.family==='fox'){
  const owned=Object.values(route.clips).filter(c=>c.visitorId===profile.visitorId);
  const face=Object.fromEntries(owned.filter(c=>c.activity==='walk').map(c=>{
   if(c.loopFrameCount!==profile.locomotion.phaseSamples.length||c.frameCount!==c.loopFrameCount+1||c.sourceProofs?.exactAtlasRGBA!==true||!c.groundContactsSpace?.includes('source root translation has been removed'))throw Error('Verified Fox walk normalization/loop endpoint required');
   const x=slim(c,'route');x.sourceFrameCountIncludingEndpoint=x.frameCount;x.frameCount=c.loopFrameCount;x.sourceRootNormalizedIn3D=true;x.phaseSamples=clone(profile.locomotion.phaseSamples);x.groundContacts=x.groundContacts.slice(0,x.frameCount);
   x.pages=x.pages.filter(p=>p.first<x.frameCount).map(p=>({...p,count:Math.min(p.count,x.frameCount-p.first)}));return[c.facing,x];
  }));
  walk={stride:d.stride.strideWorld,cycleSeconds:d.stride.durationMs/1000,facings:face};
  turns=Object.fromEntries(owned.filter(c=>c.activity!=='walk').map(c=>{
   const direction=c.activity==='turn-right'?-1:1,steps=c.activity==='turn-around'?4:2;return[`${c.facing}:${direction}:${steps}`,slim(c,'route')];
  }));
  clips=Object.fromEntries(Object.values(interactions.clips).filter(c=>c.visitorId===profile.visitorId).map(c=>[c.id,slim(c,'interactions')]));
  stills=Object.fromEntries(Object.values(moon.clips).map(c=>{const p=c.pages[0];return[c.id,{goodieId:c.goodieId,condition:c.condition,src:p.src,sha256:p.sha256,canvas:clone(c.canvas),decodedBytes:p.decodedBytes,worldPixelScale:c.pixelsPerWorld,pivotPx:clone(c.pivotPx),rotationZ:0,labelsBaked:false,providerIndependentPixels:true,assetRoot:'moon',intrinsicSourceBlendSha256:c.intrinsicSourceBlendSha256,intrinsicSourceContractSha256:c.intrinsicSourceContractSha256}];}));
  extras=Object.fromEntries(Object.values(curl.clips).filter(c=>c.visitorId===profile.visitorId).map(c=>[c.id,slim(c,'curl')]));
 }else{
  const raw=await load(`assets/yard-turtles/${actorId}-art-descriptors.json`);
  walk={...clone(raw.walk),facings:Object.fromEntries(Object.entries(raw.walk.facings).map(([f,c])=>[f,slim(c,'turtles')]))};
  turns=Object.fromEntries(Object.entries(raw.turns).map(([key,c])=>[key,slim(c,'turtles')]));
  clips=Object.fromEntries(Object.values(raw.conditionClips).map(c=>[c.id,slim(c,'turtles')]));
  stills=Object.fromEntries(Object.values(raw.stills).map(c=>[`fountain-bowl-${c.condition}-r2`,{...clone(c),assetRoot:'turtles'}]));
  extras=Object.fromEntries(Object.entries(raw.extraSourceClips||{}).map(([key,c])=>[key,slim(c,'turtles')]));
 }
 const renderBindings=Object.fromEntries(server.mediaRegistry.bindings.map(b=>[b.id,{bindingRevision:b.revision,bindingCalibrationHash:b.calibrationHash,groundFootprintRevision:profile.ground.revision,conditionContract:clone(b.conditionContract)}]));
 const manifest={format:'yard-family-runtime/v1',actorProfile:clone(server.reference),playbackReady:false,runtimeActivated:false,roots,renderBindings,walk,turns,clips,stills,extraSourceClips:extras};
 manifest.manifestRevision=digest(manifest);
 const dir=resolve(pub,'assets/yard-family',actorId);await mkdir(dir,{recursive:true});await writeFile(resolve(dir,'runtime-media.json'),JSON.stringify(manifest)+'\n');
 console.log(JSON.stringify({actorId,manifestRevision:manifest.manifestRevision,clips:Object.keys(clips).length,rootDigests:Object.fromEntries(Object.entries(roots).map(([id,r])=>[id,r.assetRevision]))}));
}
await writeFile(resolve(project,'game-logic/yard-v2/media/family-runtime-roots.json'),JSON.stringify({format:'yard-family-verified-runtime-roots/v1',runtimeActivated:false,roots},null,2)+'\n');
