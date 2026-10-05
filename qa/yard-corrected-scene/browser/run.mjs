import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(process.env.YARD_PREVIEW_REPO_ROOT||path.join(root,'../..'));
const {chromium}=createRequire(path.join(repo,'package.json'))('@playwright/test'),dist=path.join(root,'dist'),out=path.join(root,'browser-results');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{
 if(req.method!=='GET')throw Error('Read-only preview');const url=new URL(req.url,'http://localhost');
 const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1),file=path.resolve(dist,rel);
 if(!file.startsWith(dist+path.sep)||rel.includes('..'))throw Error('Invalid path');
 const data=await fs.readFile(file),types={'.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.html':'text/html'};
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','content-length':data.length});res.end(data);
 }catch{res.writeHead(404);res.end('Unavailable');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),results=[],failures=[];
let screenshotBytes=0;
async function settleVisibleMedia({timeoutMs=4000}={}){
 const deadline=performance.now()+timeoutMs;let pending=['document fonts'];
 async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Error('Visible media readiness timed out: '+pending.join(', '))),Math.max(0,deadline-performance.now()));
 })]);}finally{clearTimeout(timer);}}
 const paint=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const source=image=>image.currentSrc||image.getAttribute('src')||'';
 const label=image=>source(image)||'<img without src: '+image.className+'>';
 function visible(image){
  const r=image.getBoundingClientRect();let left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
  if(!image.getClientRects().length||right<=left||bottom<=top)return false;
  for(let node=image;node;node=node.parentElement){const style=getComputedStyle(node);
   if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
   if(node!==image){const clip=node.getBoundingClientRect();
    if(/^(auto|scroll|hidden|clip)$/.test(style.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
    if(/^(auto|scroll|hidden|clip)$/.test(style.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
   }
  }
  return right>left&&bottom>top;
 }
 const images=()=>[...(document.querySelector('dialog[open]')||document).querySelectorAll('img')].filter(visible);
 while(true){
  pending=['document fonts'];await bounded(document.fonts.ready.catch(error=>{throw Error('Document fonts failed: '+String(error));}));
  const current=images(),sources=current.map(source);pending=[];
  for(const image of current){
   if(!source(image)||!image.complete){pending.push(label(image));continue;}
   if(image.naturalWidth<=0||image.naturalHeight<=0)throw Error('Visible image failed to load: '+label(image));
  }
  if(pending.length){await bounded(paint());continue;}
  pending=current.map(label);
  await bounded(Promise.all(current.map(image=>image.decode().catch(error=>{throw Error('Visible image decode failed: '+label(image)+'; '+String(error));}))));
  pending=['paint after visible image decode'];await bounded(paint());
  const after=images();
  if(document.fonts.status!=='loading'&&after.length===current.length&&after.every((image,i)=>image===current[i]&&source(image)===sources[i]&&image.complete&&image.naturalWidth>0&&image.naturalHeight>0))return {visibleImages:after.length};
 }
}
async function capture(page,name,{diagnostic=false}={}){if(!diagnostic)await page.evaluate(settleVisibleMedia);const bytes=await page.screenshot({type:'jpeg',quality:85});if(screenshotBytes+bytes.length>40*1024*1024)throw Error('Screenshot evidence cap reached');screenshotBytes+=bytes.length;await fs.writeFile(path.join(out,name+'.jpg'),bytes);}
async function session(spec,fn){const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:spec.dpr||1,isMobile:spec.mobile!==false,hasTouch:spec.mobile!==false});
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',route=>{const r=route.request();requests.push({method:r.method(),url:r.url()});
  if(r.method()!=='GET'||!r.url().startsWith(origin+'/')||/\/api\//.test(r.url())){errors.push('Unexpected request: '+r.method()+' '+r.url());return route.abort();}return route.continue();});
 try{const data=await fn(page);assert.deepEqual(errors,[]);results.push({name:spec.name,...data,errors,requestCount:requests.length});}
 catch(e){failures.push({name:spec.name,error:String(e),errors});await capture(page,spec.name+'-failure',{diagnostic:true}).catch(()=>{});}
 finally{await fs.writeFile(path.join(out,spec.name+'-requests.json'),JSON.stringify(requests,null,2));await context.close();}}
try{
 for(const [width,height]of [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]]){
  await session({name:`ui-${width}x${height}`,width,height,dpr:width===390?2:1,mobile:width<1024},async page=>{
   await page.goto(origin+'/?at=3250');await page.waitForFunction(()=>window.__yardPreview?.ready,{},{timeout:30000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await capture(page,`ui-${width}x${height}-scene`);
   for(let panel=0;panel<3;panel++){
    await page.locator('.cy-actions button').nth(panel).click();await page.waitForSelector('dialog[open]');
    const tabs=await page.locator('dialog .cy-tabs button').count();for(let tab=0;tab<Math.max(1,tabs);tab++){
     if(tabs)await page.locator('dialog .cy-tabs button').nth(tab).click();
     await capture(page,`ui-${width}x${height}-panel${panel}-tab${tab}`);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    if(width===390&&panel===1){await page.setViewportSize({width:844,height:390});await capture(page,'ui-open-dialog-landscape');
     assert.equal(await page.locator('dialog[open]').isVisible(),true);await page.setViewportSize({width,height});}
    await page.locator('dialog>header button').click();await page.waitForSelector('dialog[open]',{state:'hidden'});
    await page.locator('.cy-actions button').nth(panel).click();await page.keyboard.press('Escape');await page.waitForSelector('dialog[open]',{state:'hidden'});
   }
   const state=await page.evaluate(()=>({errors:window.__yardPreview.errors,ownerViolations:window.__yardPreview.ownerViolations,peakOwnedRgba:window.__yardPreview.peakOwnedRgba,
    brokenImages:[...document.images].filter(i=>i.currentSrc&&i.complete&&i.naturalWidth===0).map(i=>i.currentSrc)}));
   assert.deepEqual(state.errors,[]);assert.equal(state.ownerViolations,0);assert.deepEqual(state.brokenImages,[]);assert.ok(state.peakOwnedRgba<=67108864);return state;
  });
 }
 for(const delay of [0,80,220])await session({name:'timing-'+delay,width:390,height:844,dpr:2},async page=>{
  await page.goto(origin+`/?autoplay=1&delay=${delay}`);await page.waitForFunction(()=>window.__yardPreview?.ready,{},{timeout:30000});
  if(delay===80){await page.waitForTimeout(2000);await page.setViewportSize({width:844,height:390});}
  await page.waitForFunction(()=>window.__yardPreview?.finished,{},{timeout:15000});const state=await page.evaluate(()=>window.__yardPreview);
  await fs.writeFile(path.join(out,`timing-${delay}.json`),JSON.stringify(state,null,2));
  assert.deepEqual(state.errors,[]);assert.equal(state.ownerViolations,0);assert.ok(state.peakOwnedRgba<=67108864);
  assert.deepEqual(state.omittedSourceWindows,[],'Never-sampled source windows');assert.deepEqual(state.sampledWindowsNeverReady,[],'Sampled source windows never ready');
  return {peakOwnedRgba:state.peakOwnedRgba,maxRafGapMs:state.maxRafGapMs,sourceWindows:148};
 });
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
await fs.writeFile(path.join(out,'RESULTS.json'),JSON.stringify({scope:'one corrected actor plus actual read-only React/CSS; no API/economy/outbox or full-eight acceptance',results,failures,productionReady:false},null,2));
console.log(JSON.stringify({passed:results.length,failed:failures.length}));if(failures.length)process.exitCode=1;
