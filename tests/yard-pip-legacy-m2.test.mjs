import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';
import{createCourtyardScene}from'../src/games/companion-yard-v2/scene.mjs';
import{LEGACY_M2_BACKGROUND,legacyBackgroundRect}from'../src/games/companion-yard-v2/legacy-m2-background.mjs';
import{createUiImageReserve}from'../src/games/companion-yard-v2/ui-image-reserve.mjs';
import{YARD_FOODS,YARD_GOODIES}from'../game-logic/yard-catalog.js';
import{sceneCatalogPreview,catalogPreview}from'../src/games/companion-yard-v2/catalog-ui.mjs';
const repo=process.env.YARD_M2_REPO_ROOT||path.resolve(import.meta.dirname,'..');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function dimensions(bytes){
 if(bytes.subarray(0,4).toString()==='RIFF'){
  const kind=bytes.subarray(12,16).toString();
  if(kind==='VP8X')return[1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
  if(kind==='VP8L'){const bits=bytes.readUInt32LE(21);return[1+(bits&16383),1+((bits>>>14)&16383)];}
  if(kind==='VP8 ')return[bytes.readUInt16LE(26)&16383,bytes.readUInt16LE(28)&16383];
 }
 if(bytes.subarray(1,4).toString()==='PNG')return[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 throw Error('Unknown existing image header');
}
async function environment({delayBackground=false,delayStatic=false}={}){
 const closure=JSON.parse(await fs.readFile(path.join(repo,'recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json'))),map=new Map(closure.files.map(r=>['/'+r.path,r.repositoryPath]));
 const requests=[],images=[],draws=[],frames=new Map(),wait=deferred(),entered=deferred();let serial=0;
 globalThis.location={origin:'https://yard.invalid'};globalThis.document={hidden:false};globalThis.devicePixelRatio=2;
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.fetch=async(url,{signal}={})=>{
  if(signal?.aborted)throw Error('aborted');const u=new URL(url,location.origin);requests.push(u.pathname+u.search);
  const source=map.get(u.pathname);assert.ok(source,'Exact canonical URL required: '+u.pathname);
  const bytes=await fs.readFile(path.join(repo,source));return{ok:true,json:async()=>JSON.parse(bytes),blob:async()=>new Blob([bytes])};
 };
 globalThis.createImageBitmap=async blob=>{
  const bytes=Buffer.from(await blob.arrayBuffer()),[width,height]=dimensions(bytes);
  if((delayBackground&&width===1374&&height===1145)||(delayStatic&&width===420&&height===336)){entered.resolve();await wait.promise;}
  const image={width,height,closed:false,close(){assert.equal(this.closed,false,'bitmap must close once');this.closed=true;}};images.push(image);return image;
 };
 const noop=()=>{},ctx=new Proxy({drawImage(image,...args){assert.equal(image.closed,false);draws.push({width:image.width,height:image.height,args});},createRadialGradient:()=>({addColorStop:noop})},{get:(target,k)=>target[k]||noop});
 const canvas={width:0,height:0,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:648})};
 return{canvas,requests,images,draws,frames,wait,entered,tick(stamp){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(stamp));}};
}
test('legacy plate uses exact released cover/52%50% mapping and historical thumbnail branch',()=>{
 assert.deepEqual(LEGACY_M2_BACKGROUND.canvas,[1374,1145]);
 const r=legacyBackgroundRect(390,648);assert.equal(r.height,648);assert.ok(Math.abs(r.width-777.6)<1e-9);assert.ok(Math.abs(r.x+201.552)<1e-9);
 assert.equal(sceneCatalogPreview({kind:'legacy-m2'},'food','kibble'),catalogPreview('food','kibble'));
 assert.equal(sceneCatalogPreview({kind:'legacy-m2'},'goodie','leaf_pot'),catalogPreview('goodie','leaf_pot'));
});
test('actual released M2 descriptors and image headers reach a ready accounted legacy owner',{skip:!repo},async()=>{
 const e=await environment(),errors=[],views=[],ui=createUiImageReserve();
 const snapshot={serverTime:1000000,yard:{remodel:'meadow',bowls:[],placedGoodies:[],pendingGifts:[],currencies:{treats:0,shinyTreats:0}},yardRuntime:{serverNow:1000000,mutable:false,visits:[],supportedBindings:{},display:{issues:[]}}};
 const before=JSON.stringify(snapshot),scene=createCourtyardScene(e.canvas,{uiImageOwner:ui,onError:error=>errors.push(error.message),onView:v=>views.push(v)});scene.update(snapshot);await scene.ready;
 assert.deepEqual(errors,[]);assert.equal(scene.diagnostics().ready,true);assert.equal(scene.diagnostics().legacySourceCommit,'6b80c9a2cca146e20afcaced6a34a035c30c13aa');e.tick(300);
 assert.equal(views.at(-1).renderCatalog.kind,'legacy-m2');assert.equal(views.at(-1).mediaReady,true);assert.equal(JSON.stringify(snapshot),before);
 assert.equal(e.draws[0].width,1374);assert.equal(e.requests.some(u=>u.includes('render-pack')),false);assert.ok(e.requests.some(u=>u.includes('runtime-media.json?v=')));assert.ok(e.requests.some(u=>u.includes('?yard-media=')));
 const d=scene.diagnostics();if(process.env.YARD_LEGACY_REPORT){await fs.mkdir(path.dirname(process.env.YARD_LEGACY_REPORT),{recursive:true});await fs.writeFile(process.env.YARD_LEGACY_REPORT,JSON.stringify({scope:'Real released M2 descriptors/image headers; mocked Canvas2D bitmap execution, not browser pixels',requests:e.requests,diagnostics:d},null,2)+'\n');}assert.equal(d.globalDecodedBudget.backgroundBytes,1374*1145*4);assert.equal(d.globalDecodedBudget.maxConcurrentDecodes,1);assert.ok(d.globalDecodedBudget.totalBytes<=64*1024*1024);
 await scene.dispose();assert.ok(e.images.every(image=>image.closed));assert.equal(scene.diagnostics().globalDecodedBudget.bitmapOwners,0);assert.equal(e.frames.size,0);
});
test('dispose during actual legacy background decode closes late bitmap and starts no manifests',{skip:!repo},async()=>{
 const e=await environment({delayBackground:true}),scene=createCourtyardScene(e.canvas,{uiImageOwner:createUiImageReserve()});await e.entered.promise;
 let retired=false;const retiring=scene.dispose().then(()=>{retired=true;});await Promise.resolve();assert.equal(retired,false);e.wait.resolve();await retiring;
 assert.equal(e.requests.length,1);assert.equal(e.requests[0],'/assets/yard-mika/background.webp');assert.equal(e.images.length,1);assert.equal(e.images[0].closed,true);assert.equal(scene.diagnostics().globalDecodedBudget.stillPendingBytes,0);assert.equal(e.frames.size,0);
});

test('every restored legacy food/goodie URL has an admitted UI owner',()=>{
 const ui=createUiImageReserve();for(const[k,ids]of[['food',['empty_bowl',...Object.keys(YARD_FOODS)]],['goodie',Object.keys(YARD_GOODIES)]])for(const id of ids)for(const condition of['new','worn','broken']){const url=sceneCatalogPreview({kind:'legacy-m2'},k,id,{condition});if(url)assert.equal(ui.admit([url]),true,url);}
});
test('dispose during a legacy static decode blocks subsequent actor fetches and reservations',{skip:!repo},async()=>{
 const e=await environment({delayStatic:true}),scene=createCourtyardScene(e.canvas,{uiImageOwner:createUiImageReserve()});await e.entered.promise;const count=e.requests.length,retired=scene.dispose();e.wait.resolve();await retired;
 assert.equal(e.requests.length,count);assert.equal(e.requests.some(url=>url.includes('yard-mochi')),false);assert.ok(e.images.every(image=>image.closed));assert.equal(scene.diagnostics().globalDecodedBudget.stillPendingBytes,0);assert.equal(scene.diagnostics().globalDecodedBudget.bitmapOwners,0);
});
