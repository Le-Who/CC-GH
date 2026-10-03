/** Deterministic packing only: copy reviewed source atlases into their own
 * canonical namespace. Does not render, register, activate or publish assets. */
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createMochiMedia,MOCHI_MEDIA_REVISION} from '../game-logic/yard-v2/mochi-media.mjs';
import {MOCHI_ACTOR_REFERENCE} from '../game-logic/yard-v2/mochi-actor-profile.mjs';
import {BASIS} from '../src/games/companion-yard-v2/projection.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),input=resolve(root,'recovery-tools/yard-mochi-combined-qa/media'),output=resolve(root,'public/assets/yard-mochi');
const read=async p=>JSON.parse(await readFile(resolve(input,p),'utf8'));
const [combinedMedia,cardinalMedia]=await Promise.all([read('combined/candidate-media.json'),read('cardinal/candidate-media.json')]);
const server=createMochiMedia(),b=server.mediaRegistry.bindings[0],clip=server.source.clip;
await mkdir(output,{recursive:true});
for(const group of ['combined','cardinal'])await cp(resolve(input,group,'atlases'),resolve(output,group,'atlases'),{recursive:true});
await cp(resolve(input,'combined/target-prop-still.webp'),resolve(output,'target-prop-still.webp'));
const pivot=[combinedMedia.pivotPx[0]+50*BASIS.right.reduce((s,n,i)=>s+n*clip.propRoot[i],0),combinedMedia.pivotPx[1]+50*BASIS.down.reduce((s,n,i)=>s+n*clip.propRoot[i],0)];
const manifest={format:'yard-mochi-canonical-runtime/v1',manifestRevision:MOCHI_MEDIA_REVISION,actorProfile:MOCHI_ACTOR_REFERENCE,
 playbackReady:b.playbackReady,runtimeActivated:b.playbackReady,sourceMedia:{combined:combinedMedia,cardinal:cardinalMedia},
 renderBindings:{[b.id]:{bindingRevision:b.revision,bindingCalibrationHash:b.calibrationHash,groundFootprintRevision:b.groundFootprintRevision}},
 stills:{'mochi:target-yarn-mouse':{src:'target-prop-still.webp',pivotPx:pivot,worldPixelScale:50,labelsBaked:false,goodieId:'yarn_mouse',rotationZ:0,condition:'new'}},
 sourcePolicy:'Own Mochi source media; exact target slot only; full Yard acceptance gate remains closed.'};
await writeFile(resolve(output,'runtime-media.json'),JSON.stringify(manifest)+'\n');
const files=[];for(const [group,collection]of [['combined',[combinedMedia]],['cardinal',[...Object.values(cardinalMedia.walk.facings),...Object.values(cardinalMedia.turns),...Object.values(cardinalMedia.groundRest)]]])
 for(const c of collection)for(const page of c.pages){const path=`${group}/${page.src}`;if(files.some(f=>f.path===path))continue;const data=await readFile(resolve(output,path));const sha256=createHash('sha256').update(data).digest('hex');if(sha256!==page.sha256)throw Error(`Source pixel hash mismatch: ${path}`);files.push({path,bytes:data.length,sha256});}
await writeFile(resolve(output,'SOURCE-MANIFEST.json'),JSON.stringify({runtimeActivated:false,files},null,2)+'\n');
console.log(JSON.stringify({pages:files.length,compressedAtlasBytes:files.reduce((n,f)=>n+f.bytes,0),binding:b.id,releaseReady:false}));
