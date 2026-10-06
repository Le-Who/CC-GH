/** Pure actual-source enumeration. Runs after the real source build, before Chromium.
 * It invokes the native actor adapters to derive scoped atlas/still URLs. No scene,
 * renderer, save, network client, bitmap decoder or browser is constructed. */
import fs from 'node:fs/promises';import path from 'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';
const HERE=path.dirname(fileURLToPath(import.meta.url)),REPO=path.resolve(HERE,'../..'),DIST=path.join(HERE,'dist'),OVERLAY=path.join(HERE,'candidate/vendor/r5');
const BASE='http://review.invalid',SCENE='src/games/companion-yard-v2/',LOGIC='game-logic/yard-v2/';
const check=(v,m)=>{if(!v)throw Error(m);},sha=b=>createHash('sha256').update(b).digest('hex');
const mod=rel=>import(pathToFileURL(path.join(OVERLAY,rel)).href),read=async rel=>JSON.parse(await fs.readFile(path.join(DIST,rel)));
const canonical=JSON.parse(await fs.readFile(path.join(HERE,'canonical-media-closure.json'))),canonicalByPath=new Map(canonical.files.map(r=>[r.path,r]));
for(const r of canonical.files){const b=await fs.readFile(path.join(DIST,r.path));check(b.length===r.bytes&&sha(b)===r.sha256,'Unreadable/stale emitted canonical media: '+r.path);}
const urls=new Map();
function add(value,consumer,expected={}){const u=new URL(value,BASE);check(u.origin===BASE&&!u.hash,'External or fragment runtime URL');const key=u.pathname+u.search,file=decodeURIComponent(u.pathname.slice(1))||'index.html';check(!file.split('/').includes('..'),'Escaping runtime URL');const prior=urls.get(key);if(prior){prior.consumers.push(consumer);return;}urls.set(key,{url:key,file,consumers:[consumer],...(expected.sha256?{sha256:expected.sha256}:{}),...(expected.bytes!==undefined?{bytes:expected.bytes}:{})});}
function asset(value,consumer){const u=new URL(value,BASE),key=decodeURIComponent(u.pathname.slice(1)),expected=canonicalByPath.get(key)||{};add(u.href,consumer,expected);}
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
// Enumerate actual historical/current UI functions across their finite arguments.
const ui=await mod(SCENE+'catalog-ui.mjs'),catalog=await mod('game-logic/yard-catalog.js'),inventory=JSON.parse(await fs.readFile(path.join(OVERLAY,SCENE+'ui-image-inventory.json')));
for(const row of inventory.rows)asset(row.url,'ui:reserved-lifetime');for(const value of Object.values(ui.YARD_UI_ART))asset(value,'ui:semantic-art');
const uiSource=await fs.readFile(path.join(OVERLAY,SCENE+'catalog-ui.mjs'),'utf8'),poseBlock=uiSource.match(/const visitorPoses\s*=\s*\{([\s\S]*?)\n\};/)?.[1];check(poseBlock,'Finite visitor pose source missing');const poses=new Set(['',...[...poseBlock.matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1])]);
const preview=(kind,id,options)=>{const url=ui.catalogPreview(kind,id,options);if(url)asset(url,'ui:'+kind+':'+id);};
for(const id of Object.keys(catalog.YARD_GOODIES))for(const condition of['new','worn','broken'])preview('goodie',id,{condition});
for(const id of ['empty_bowl',...Object.keys(catalog.YARD_FOODS)])preview('food',id);
for(const id of Object.keys(catalog.YARD_VISITORS))for(const pose of poses)preview('visitor',id,{pose});
for(const id of Object.keys(catalog.YARD_REMODELS))preview('remodel',id);
for(const id of['cat','dog','bunny','fox','hamster','turtle'])preview('companion',id);
// The optional mode's finite literal URLs and pinned external module graph.
for(const rel of['assets/pip.glb','assets/clean-garden.png','data/fixture.json','data/location.json','data/calibration.json','source/pip-rest-coat.glsl','vendor/three/build/three.module.js','vendor/three/build/three.core.js','vendor/three/addons/loaders/GLTFLoader.js','vendor/three/addons/utils/BufferGeometryUtils.js','vendor/three/addons/utils/SkeletonUtils.js'])add('/pip-prototype/'+rel,'optional:static');
for(const url of['/','/?optional=0','/?optional=1','/main.js','/main.css','/pip-prototype/yard-pip-scene.mjs'])add(url,'built:entry');
const built=JSON.parse(await fs.readFile(path.join(HERE,'built-files.json'))),virtualInputs=[...new Set([...built.mainInputs,...built.lazyInputs].filter(p=>p.startsWith('<')&&p.endsWith('>')))],sourcePaths=new Set([...built.mainInputs,...built.lazyInputs].filter(p=>!p.startsWith('<')));check(virtualInputs.every(p=>p==='<define:import.meta.env>'),'Unknown virtual compiled source');
sourcePaths.add('package.json');sourcePaths.add('pnpm-lock.yaml');sourcePaths.add(path.relative(REPO,path.join(HERE,'build.mjs')));sourcePaths.add(path.relative(REPO,path.join(HERE,'canonical-media-closure.json')));sourcePaths.add(path.relative(REPO,path.join(HERE,'enumerate-runtime-urls.mjs')));sourcePaths.add(path.relative(REPO,path.join(HERE,'seal-url-closure.mjs')));
for(const row of canonical.files.filter(r=>r.path.endsWith('.json')))sourcePaths.add(row.repositoryPath);
const sourcePins=[];for(const rel of [...sourcePaths].sort()){const absolute=path.isAbsolute(rel)?rel:path.join(REPO,rel),normalized=path.relative(REPO,absolute);check(!normalized.startsWith('../'),'Compiled input outside repository');const b=await fs.readFile(absolute);sourcePins.push({path:normalized,bytes:b.length,sha256:sha(b)});}
for(const row of urls.values()){const b=await fs.readFile(path.join(DIST,row.file));if(row.sha256)check(sha(b)===row.sha256,'Descriptor hash mismatch: '+row.url);if(row.bytes!==undefined)check(b.length===row.bytes,'Descriptor bytes mismatch: '+row.url);row.bytes=b.length;row.sha256=sha(b);row.consumers=[...new Set(row.consumers)].sort();}
const result={format:'actual-yard-source-url-requirements/v1',complete:true,coverage:{off:'complete',on:'complete',fallback:'complete',portraits:'complete'},sourcePins,enumeration:{virtualCompiledInputs:virtualInputs,actors:Object.keys(entries),nativeAdapterClipObjects:clips,nativeAdapterPageReferences:pages,canonicalFilesRead:canonical.files.length,canonicalBytesRead:canonical.files.reduce((n,r)=>n+r.bytes,0),method:'Actual native actor factories, actual catalog function outputs, complete UI inventory and finite optional static graph; emitted references checked by sealer'},urls:[...urls.values()].sort((a,b)=>a.url.localeCompare(b.url))};
await fs.writeFile(path.join(HERE,'asset-url-requirements.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({complete:true,urlCount:result.urls.length,sourcePins:sourcePins.length,...result.enumeration}));
