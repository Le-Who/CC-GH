import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifestBytes=await readFile(new URL('./payload-manifest.json',import.meta.url));
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const expected=new Map(manifest.files.map(r=>['/'+r.path,r]));
for(const spec of[{name:'portrait-320',width:320,height:568,dpr:1},{name:'portrait-390-dpr2',width:390,height:844,dpr:2},{name:'landscape-844',width:844,height:390,dpr:1}])test.describe(spec.name,()=>{
 test.use({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:spec.dpr,isMobile:true,hasTouch:true});
 test('actual layered Canvas, native second, endpoint hold and diagnostics',async({page},info)=>{
  const errors=[],requests=[],responses=[],pending=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
  page.on('response',r=>{const path=new URL(r.url()).pathname,row=expected.get(path);if(row)pending.push((async()=>{const bytes=await r.body();responses.push({path,status:r.status(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),expectedSha256:row.sha256});})().catch(e=>errors.push(String(e))));});
  try {
  await page.goto('/preview/yard-environment-probe/');await page.waitForFunction(()=>window.__yardEnvironmentProbe?.snapshot().ready===true);
  await expect(page.locator('header')).toContainText('No eight-actor');await expect(page.locator('#error')).toBeEmpty();
  await page.screenshot({path:info.outputPath(`${spec.name}-initial.png`),fullPage:true});
  const started=Date.now();await page.locator('#play').click();await page.waitForFunction(()=>window.__yardEnvironmentProbe.snapshot().state==='held-endpoint');
  const endpoint=await page.evaluate(()=>window.__yardEnvironmentProbe.snapshot());expect(endpoint.current.index).toBe(25);expect(endpoint.current.sourceMs).toBe(5000);expect(endpoint.plays[0].wallDurationMs).toBeGreaterThanOrEqual(1000);expect(Date.now()-started).toBeGreaterThanOrEqual(1000);
  await page.waitForTimeout(200);expect(await page.evaluate(()=>window.__yardEnvironmentProbe.snapshot().current.index)).toBe(25);
  await page.screenshot({path:info.outputPath(`${spec.name}-endpoint.png`),fullPage:true});
  await page.locator('#guides').check();await page.screenshot({path:info.outputPath(`${spec.name}-anchors-mask.png`),fullPage:true});
  await page.locator('#reset').click();await page.waitForFunction(()=>window.__yardEnvironmentProbe.snapshot().state==='ready');
  expect(await page.evaluate(()=>window.__yardEnvironmentProbe.snapshot().current.sourceMs)).toBe(4000);
  const final=await page.evaluate(()=>window.__yardEnvironmentProbe.snapshot());await Promise.all(pending);
  expect(final.errors).toEqual([]);expect(errors).toEqual([]);expect(final.peakBytes).toBeLessThanOrEqual(64*1024*1024);expect(final.peakPages).toBeLessThanOrEqual(2);expect(final.peakDecodes).toBeLessThanOrEqual(1);
  expect(final.draws.every(r=>Number.isInteger(r.index)&&r.sourceMs===4000+40*r.index)).toBe(true);expect(final.maskMethod).toBe('conservativeMaskStrips');
  expect(requests.every(r=>r.method==='GET'&&new URL(r.url).origin==='http://127.0.0.1:4317'&&!new URL(r.url).pathname.startsWith('/api/'))).toBe(true);
  const verified=new Set(responses.filter(r=>r.status===200&&r.sha256===r.expectedSha256).map(r=>r.path));for(const row of manifest.files.filter(r=>r.path.endsWith('.webp')))expect(verified.has('/'+row.path),row.path).toBe(true);
  expect(responses.every(r=>r.status===200&&r.sha256===r.expectedSha256)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally {
   await Promise.allSettled(pending);
   const final=await page.evaluate(()=>window.__yardEnvironmentProbe?.snapshot()).catch(error=>({captureError:String(error)}));
   await info.attach('source-clock-budget-and-http.json',{body:Buffer.from(JSON.stringify({scope:'scene-render-probe; not eight-actor or live API acceptance',viewport:spec,commit:process.env.GITHUB_SHA||null,manifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),evidence:final,http:responses,requests,errors},null,2)),contentType:'application/json'});
  }
 });
});

test.describe('interrupted-resize',()=>{
 test.use({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 test('a media wait preserves the old canvas until the new frame and viewport can commit together',async({page},info)=>{
  let release;const held=new Promise(resolve=>{release=resolve;});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/pages/probe-02.webp',async route=>{await held;await route.continue();});
  try{
   await page.goto('/preview/yard-environment-probe/');await page.waitForFunction(()=>window.__yardEnvironmentProbe?.snapshot().ready);
   await page.locator('#play').click();await page.waitForFunction(()=>window.__yardEnvironmentProbe.snapshot().events.some(e=>e.type==='media-wait'&&e.index>=12));
   const before=await page.evaluate(()=>{const c=document.querySelector('canvas');return{width:c.width,height:c.height,pixels:c.toDataURL(),elapsed:window.__yardEnvironmentProbe.snapshot().current.elapsedMs};});
   await page.setViewportSize({width:360,height:720});
   await page.waitForFunction(()=>window.__yardEnvironmentProbe.snapshot().events.some(e=>e.type==='resize-deferred'&&e.heldIndex!==null));
   const during=await page.evaluate(()=>{const c=document.querySelector('canvas');return{width:c.width,height:c.height,pixels:c.toDataURL()};});
   expect(during).toEqual({width:before.width,height:before.height,pixels:before.pixels});
   await page.screenshot({path:info.outputPath('resize-held-native-canvas.png'),fullPage:true});
   release();await page.waitForFunction(()=>window.__yardEnvironmentProbe.snapshot().state==='held-endpoint');
   await page.waitForFunction(()=>document.querySelector('canvas').width===Math.round(document.querySelector('#stage').getBoundingClientRect().width*devicePixelRatio));
   const final=await page.evaluate(()=>window.__yardEnvironmentProbe.snapshot());expect(final.errors).toEqual([]);expect(errors).toEqual([]);expect(final.current.sourceMs).toBe(5000);expect(final.plays[0].wallDurationMs).toBeGreaterThanOrEqual(1000);expect(final.peakBytes).toBeLessThanOrEqual(64*1024*1024);
   await page.screenshot({path:info.outputPath('resize-committed-native-endpoint.png'),fullPage:true});
  }finally{
   release();const snapshot=await page.evaluate(()=>window.__yardEnvironmentProbe?.snapshot()).catch(error=>({captureError:String(error)}));
   await info.attach('interrupted-resize-evidence.json',{body:Buffer.from(JSON.stringify({scope:'delayed atlas and resize scene probe',snapshot,errors},null,2)),contentType:'application/json'});
  }
 });
});

test('teardown closes a real ImageBitmap that finishes decoding late',async({page},info)=>{
 await page.addInitScript(()=>{const decode=window.createImageBitmap.bind(window);window.__lateBitmap={started:0,closed:0};window.createImageBitmap=async(...args)=>{const image=await decode(...args),close=image.close.bind(image);image.close=()=>{window.__lateBitmap.closed++;close();};window.__lateBitmap.started++;await new Promise(resolve=>{window.__releaseLateBitmap=resolve;});return image;};});
 try{
  await page.goto('/preview/yard-environment-probe/',{waitUntil:'commit'});await page.waitForFunction(()=>window.__lateBitmap?.started===1);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await page.evaluate(()=>window.__releaseLateBitmap());
  await page.waitForFunction(()=>window.__lateBitmap.closed===1);const result=await page.evaluate(()=>({bitmap:window.__lateBitmap,probe:window.__yardEnvironmentProbe.snapshot()}));
  expect(result.bitmap).toEqual({started:1,closed:1});expect(result.probe.ready).toBe(false);expect(result.probe.state).toBe('disposed');expect(result.probe.draws).toEqual([]);
  await info.attach('late-bitmap-teardown.json',{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
 }finally{await page.evaluate(()=>window.__releaseLateBitmap?.()).catch(()=>{});}
});
