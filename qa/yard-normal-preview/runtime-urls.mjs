/** Pure actual actor-adapter URL enumeration. No renderer or network. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
export async function runtimeUrls(root,dist){
const BASE='http://review.invalid',SCENE='src/games/companion-yard-v2/',LOGIC='game-logic/yard-v2/';
const check=(v,m)=>assert(v,m),mod=rel=>import(pathToFileURL(path.join(root,rel))),read=async rel=>JSON.parse(await fs.readFile(path.join(dist,rel)));
const urls=new Set();function asset(value){const u=new URL(value,BASE);check(u.origin===BASE&&!u.hash,'External runtime URL');urls.add(u.pathname+u.search);}
const {CAMERA_DIRECTION}=await mod(SCENE+'projection.mjs');check(JSON.stringify(CAMERA_DIRECTION)===JSON.stringify([5.66,-8,3.97]),'The final legacy adapter is not the exact M2 camera');
const {YARD_ACTOR_PROFILES:profiles}=await mod(LOGIC+'released-actor-profiles.mjs');
const {MIKA_ACTOR_REFERENCE}=await mod(LOGIC+'actor-profiles.mjs'),{MIKA_CLIPS}=await mod(LOGIC+'media/mika-clips.mjs'),{MIKA_RUNTIME_MEDIA_REVISION}=await mod(LOGIC+'media/runtime-version.mjs');
const {MOCHI_RUNTIME_MEDIA_REVISION}=await mod(LOGIC+'mochi-actor-profile.mjs'),{PEBBLE_MEDIA_REVISION}=await mod(LOGIC+'pebble-actor-profile.mjs'),{PIP_MEDIA_REVISION}=await mod(LOGIC+'pip-actor-profile.mjs');
const {createActorMediaEntry}=await mod(SCENE+'actor-media.mjs'),{createMochiActorMediaEntry}=await mod(SCENE+'mochi-actor-media.mjs'),{createPebbleActorMediaEntry}=await mod(SCENE+'pebble-actor-media.mjs'),{createPipActorMediaEntry}=await mod(SCENE+'pip-actor-media.mjs'),{createFamilyActorMediaEntry}=await mod(SCENE+'family-actor-media.mjs');
const revisions={mika:MIKA_RUNTIME_MEDIA_REVISION,mochi:MOCHI_RUNTIME_MEDIA_REVISION,pebble:PEBBLE_MEDIA_REVISION,pip:PIP_MEDIA_REVISION},entries={};
for(const id of ['mika','mochi','pebble','pip','willow','starlit','basil','sage']){
 check(profiles[id]?.playbackReady===true,'Unexpected disabled default actor: '+id);const family=!Object.hasOwn(revisions,id),root=family?`/assets/yard-family/${id}/`:`/assets/yard-${id}/`,url=root+'runtime-media.json'+(family?'':'?v='+encodeURIComponent(revisions[id]));asset(url,id+':manifest');const manifest=await read(root.slice(1)+'runtime-media.json'),options={assetBaseURL:BASE+root,profiles};
 entries[id]=id==='mika'?createActorMediaEntry(manifest,{...options,reference:MIKA_ACTOR_REFERENCE,clips:MIKA_CLIPS}):id==='mochi'?createMochiActorMediaEntry(manifest,options):id==='pebble'?createPebbleActorMediaEntry(manifest,options):id==='pip'?createPipActorMediaEntry(manifest,options):createFamilyActorMediaEntry(id,manifest,options);
}
const {FOOD_BINDINGS}=await mod(LOGIC+'food-media.mjs'),stills=await read('assets/yard-mika/still-layer-contract.json');asset('/assets/yard-mika/still-layer-contract.json?v='+encodeURIComponent(MIKA_RUNTIME_MEDIA_REVISION),'mika:still-contract');
for(const id of new Set(['sun-cushion-clean','yarn-mouse-clean','yarn-mouse-settled-clean',...Object.values(FOOD_BINDINGS).flatMap(f=>[f.filledStillId,f.emptyStillId])])){check(stills[id],'Mika still contract missing: '+id);const u=new URL('/assets/yard-mika/'+id+'.webp',BASE);if(stills[id].assetRevision)u.searchParams.set('yard-media',stills[id].assetRevision);asset(u.href,'mika:still:'+id);}
asset('/assets/yard-mika/background.webp','legacy:scene-owned-background');
let clips=0,pages=0;function walk(value,id,visited=new Set()){
 if(!value||typeof value!=='object'||visited.has(value))return;visited.add(value);
 if(Array.isArray(value.pages)){clips++;check(typeof value.assetBaseURL==='string','Unscoped actual clip in '+id);for(const page of value.pages){check(typeof page.src==='string','Native page source missing');const u=new URL(page.src,value.assetBaseURL);if(value.assetRevision)u.searchParams.set('yard-media',value.assetRevision);asset(u.href,id+':atlas');pages++;}}
 for(const nested of Object.values(value))if(typeof nested==='object')walk(nested,id,visited);
}
for(const[id,entry]of Object.entries(entries)){walk(entry.manifest,id);for(const[stillId,meta]of Object.entries(entry.stills||{})){check(meta.assetURL,'Native still URL missing');const u=new URL(meta.assetURL,BASE);if(meta.assetRevision)u.searchParams.set('yard-media',meta.assetRevision);asset(u.href,id+':still:'+stillId);}}
return {urls:[...urls].sort(),actors:Object.keys(entries),clipObjects:clips,pageReferences:pages};
}
