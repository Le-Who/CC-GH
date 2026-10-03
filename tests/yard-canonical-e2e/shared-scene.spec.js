import {test,expect} from '@playwright/test';
const viewports=[[320,568,1],[360,800,1],[390,844,1],[414,896,1],[568,320,1],[844,390,1],[768,1024,1],[1024,768,1],[1280,720,1],[393,873,2]];
async function painted(page,at){const h=await page.waitForFunction(at=>{const d=window.yardQA?.diagnostics();return d?.ready&&d.view?.now===at&&!d.pendingResize?d:false;},at);try{return await h.jsonValue();}finally{await h.dispose();}}
const check=d=>{expect(d.errors).toEqual([]);expect(d.targetInstances).toBe(1);expect(d.horizontalOverflow).toBe(false);expect(d.retainedPages).toBeLessThanOrEqual(3);expect(d.pendingDecodes).toBeLessThanOrEqual(1);expect(d.decodedBytesEstimate+d.pendingBytesEstimate).toBeLessThanOrEqual(64*1048576);for(const b of d.buttons){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}};
for(const[width,height,dpr]of viewports)test(`Canonical Yard Mochi ${width}x${height} DPR ${dpr}`,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<1100,hasTouch:width<1100}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(`${info.project.use.baseURL}/__yard_qa__/index.html`);await page.waitForFunction(()=>window.yardQA?.ready);const times=await page.evaluate(()=>window.yardQA.times),rows=[];
 for(const key of ['approach','turn','beforeEntry','entry','inspect','rest','loopEnd','loopStart','beforeExit','exit','leaving','finished']){
  await page.evaluate(t=>window.yardQA.seek(t),times[key]);const d=await painted(page,times[key]);check(d);
  expect(d.view.yard.goodieInventory.alchemy_living_arbor).toBe(4);expect(d.view.yard.goodieInventory.alchemy_echo_chimes).toBe(7);
  if(key==='finished'){expect(d.view.pets).toHaveLength(0);expect(d.view.pendingGifts).toHaveLength(1);}else{expect(d.view.pets).toHaveLength(1);expect(d.view.pets[0].visitorId).toBe('mochi_bunny');expect(d.view.pets[0].actorProfile.id).toBe('mochi');expect(d.view.pendingGifts).toHaveLength(0);}
  rows.push({phase:key,at:times[key],targetInstances:d.targetInstances,pets:d.view.pets.map(p=>({visitorId:p.visitorId,phase:p.phase,frameIndex:p.frameIndex,position:p.position,clipOrigin:p.clipOrigin})),props:d.view.props.map(p=>({slotId:p.slotId,drawStandalone:p.drawStandalone,stillId:p.stillId,transform:p.transform})),projection:d.projection,retainedPages:d.retainedPages,decodedBytes:d.decodedBytesEstimate,pendingBytes:d.pendingBytesEstimate});
  if(['entry','inspect','rest','exit'].includes(key))await info.attach(`yard-${width}x${height}-${key}`,{body:await page.screenshot(),contentType:'image/png'});
 }
 // Return navigation disposes and rehydrates the real scene/cache, rather than
 // rewinding its monotonic production clock.
 for(const name of ['Approach','Inspect','Exit','Inspect']){await page.getByRole('button',{name,exact:true}).click();const key=name.toLowerCase();check(await painted(page,times[key]));}
 await page.setViewportSize({width:height,height:width});await page.waitForFunction(()=>{const d=window.yardQA.diagnostics();return !d.pendingResize&&d.projection.width===d.canvasBounds.width&&d.projection.height===d.canvasBounds.height;});check(await page.evaluate(()=>window.yardQA.diagnostics()));
 await page.setViewportSize({width,height});await page.reload();await page.waitForFunction(()=>window.yardQA?.ready);check(await painted(page,times.approach));expect(errors).toEqual([]);
 await info.attach('canonical-server-scene-evidence',{body:Buffer.from(JSON.stringify(rows,null,2)),contentType:'application/json'});await context.close();
});
test('default release gate renders no saved Mochi and fetches no Mochi pixels',async({page},info)=>{
 const requests=[];page.on('request',r=>{if(r.url().includes('/assets/yard-mochi/'))requests.push(r.url());});
 await page.goto(`${info.project.use.baseURL}/__yard_qa__/index.html?mode=closed`);await page.waitForFunction(()=>window.yardQA?.ready);const times=await page.evaluate(()=>window.yardQA.times);const d=await painted(page,times.approach);
 expect(d.view.pets).toHaveLength(0);expect(d.view.legacy).toHaveLength(1);expect(d.targetInstances).toBe(1);expect(requests).toEqual([]);expect(d.errors).toEqual([]);
});
test('a pending current page holds the whole canvas through resize until one coherent redraw',async({page},info)=>{
 await page.setViewportSize({width:320,height:568});let release,blocked=false;const gate=new Promise(r=>release=r);
 await page.route(/\/combined-06\.webp/,async route=>{blocked=true;await gate;await route.continue();});
 await page.goto(`${info.project.use.baseURL}/__yard_qa__/index.html`);await page.waitForFunction(()=>window.yardQA?.ready);const times=await page.evaluate(()=>window.yardQA.times);
 await page.evaluate(t=>window.yardQA.seek(t),times.entry);check(await painted(page,times.entry));const before=await page.evaluate(()=>window.yardQA.bitmap());
 await page.evaluate(t=>window.yardQA.seek(t),times.rest);await expect.poll(()=>blocked).toBe(true);await page.waitForFunction(()=>window.yardQA.diagnostics().pendingDecodes===1);
 expect(await page.evaluate(()=>window.yardQA.bitmap())).toBe(before);await page.setViewportSize({width:568,height:320});await page.waitForFunction(()=>window.yardQA.diagnostics().pendingResize);
 expect(await page.evaluate(()=>window.yardQA.bitmap())).toBe(before);release();check(await painted(page,times.rest));
 const d=await page.evaluate(()=>window.yardQA.diagnostics());expect(d.projection.width).toBe(d.canvasBounds.width);expect(d.projection.height).toBe(d.canvasBounds.height);
 await info.attach('canonical-held-resize',{body:await page.screenshot(),contentType:'image/png'});
});
