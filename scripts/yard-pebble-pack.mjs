/** Offline deterministic pack; sources are locally rendered, never fetched. */
import {readFile,mkdir,writeFile,link} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createPebbleMedia} from '../game-logic/yard-v2/pebble-media.mjs';
import {PEBBLE_ACTOR_PROFILE,PEBBLE_ACTOR_REFERENCE,PEBBLE_MEDIA_REVISION} from '../game-logic/yard-v2/pebble-actor-profile.mjs';
import {BASIS} from '../src/games/companion-yard-v2/projection.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),source=resolve(process.env.YARD_PEBBLE_SOURCE||'/workspace/shared/yard-pebble-source-20261003-r1'),from=resolve(source,'media'),out=resolve(root,'public/assets/yard-pebble');
const read=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const [walkPart,turnPart,combinedPart]=await Promise.all(['walk','turn','combined'].map(s=>read(resolve(from,`${s}-render.json`))));
const server=createPebbleMedia(),clip=server.source.clip,binding=server.mediaRegistry.bindings[0];
for(const p of[walkPart,turnPart,combinedPart])if(p.sourceRigSha256!==clip.sourceRigSha256||p.sourceMotionSha256!==clip.sourceMotionSha256||p.maxPostRenderRootError>1e-6)throw Error('Source/render identity or actual root mismatch');
const clean=c=>({...c,pages:c.pages.map(({alphaBounds,framePixelHashes,compressedBytes,sha256,...p})=>p)}),walk=Object.fromEntries([0,2,4,6].map(f=>[f,clean(walkPart.clips[`walk-${f}`])])),turns={};
for(const f of[0,2,4,6])for(const sign of[-1,1]){
 const c=clean(turnPart.clips[`turn-${f}-${sign}`]),end=walk[(f+sign*2+8)%8];turns[`${f}:${sign}:2`]={...c,frameCount:49,pages:[...c.pages,{...end.pages[0],first:48,count:1,offset:0}],groundContacts:[...c.groundContacts,end.groundContacts[0]]};
}
for(const f of[0,2,4,6]){const a=turns[`${f}:1:2`],b=turns[`${(f+2)%8}:1:2`];turns[`${f}:1:4`]={...a,id:`turn-${f}-180`,frameCount:97,durationMs:4800,
 pages:[...a.pages.filter(p=>p.first<48).map(p=>({...p,count:Math.min(p.count,48-p.first)})),...b.pages.map(p=>({...p,first:p.first+48}))],groundContacts:[...a.groundContacts.slice(0,48),...b.groundContacts]};}
const active=clean(combinedPart.clips[clip.id]);
const still={goodieId:clip.goodieId,src:'leaf-pot-still.webp',condition:'new',rotationZ:0,labelsBaked:false,sourceRigSha256:clip.sourceRigSha256,worldPixelScale:active.pixelsPerWorld,
 pivotPx:[active.pivotPx[0]+active.pixelsPerWorld*BASIS.right.reduce((s,n,i)=>s+n*clip.propRoot[i],0),active.pivotPx[1]+active.pixelsPerWorld*BASIS.down.reduce((s,n,i)=>s+n*clip.propRoot[i],0)]};
const manifest={format:'yard-composite-visitor-runtime/v1',manifestRevision:PEBBLE_MEDIA_REVISION,actorProfile:PEBBLE_ACTOR_REFERENCE,runtimeActivated:false,playbackReady:binding.playbackReady,
 sourceRigSha256:clip.sourceRigSha256,sourceMotionSha256:clip.sourceMotionSha256,renderBindings:{[clip.id]:{bindingRevision:binding.revision,bindingCalibrationHash:binding.calibrationHash,groundFootprintRevision:PEBBLE_ACTOR_PROFILE.ground.revision}},
 clips:{[clip.id]:active},walk:{stride:.4,cycleSeconds:1,facings:walk},turns,stills:{'pebble:leaf-pot':still}};
const files=[...new Set([...Object.values(walkPart.clips),...Object.values(turnPart.clips),...Object.values(combinedPart.clips)].flatMap(c=>c.pages.map(p=>p.src)).concat('leaf-pot-still.webp'))].sort(),rows=[];
for(const path of files){const src=resolve(from,path),dest=resolve(out,path),bytes=await readFile(src);await mkdir(dirname(dest),{recursive:true});try{await link(src,dest);}catch(e){if(e.code!=='EEXIST')throw e;if(!(await readFile(dest)).equals(bytes))throw Error(`Stale destination ${path}`);}rows.push({path,bytes:bytes.length,sha256:sha(bytes)});}
await writeFile(resolve(out,'runtime-media.json'),JSON.stringify(manifest)+'\n');await writeFile(resolve(out,'SOURCE-MANIFEST.json'),JSON.stringify({format:'yard-pebble-media-source/v1',runtimeActivated:false,sourceRigSha256:clip.sourceRigSha256,sourceMotionSha256:clip.sourceMotionSha256,files:rows},null,2)+'\n');
console.log(JSON.stringify({files:rows.length,bytes:rows.reduce((n,f)=>n+f.bytes,0),manifest:resolve(out,'runtime-media.json'),runtimeActivated:false}));
