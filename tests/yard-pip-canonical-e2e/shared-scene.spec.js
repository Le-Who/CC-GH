import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const compact=path.join(process.cwd(),'test-results-pip-canonical/compact');
const save=async(name,data)=>{await mkdir(compact,{recursive:true});await writeFile(path.join(compact,name),data);};
async function open(page,url,info){const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});try{const r=await page.goto(url);expect(r.status(),JSON.stringify(errors)).toBe(200);await page.waitForFunction(()=>window.yardQA?.ready);}catch(e){await save('boot-'+info.title.replace(/[^a-zA-Z0-9]+/g,'-')+'.json',JSON.stringify(errors));throw e;}}
const viewports=[[320,568,1],[360,800,1],[390,844,1],[414,896,1],[568,320,1],[844,390,1],[768,1024,1],[1024,768,1],[1280,720,1],[393,873,2]];
async function painted(page,at){const h=await page.waitForFunction(at=>{const d=window.yardQA?.diagnostics();return d?.ready&&d.view?.now===at&&!d.pendingResize?d:false;},at);try{return await h.jsonValue();}finally{await h.dispose();}}
const check=d=>{expect(d.errors).toEqual([]);expect(d.targetInstances).toBe(1);expect(d.horizontalOverflow).toBe(false);expect(d.retainedPages).toBeLessThanOrEqual(3);expect(d.pendingDecodes).toBeLessThanOrEqual(1);expect(d.decodedBytesEstimate+d.pendingBytesEstimate).toBeLessThanOrEqual(64*1048576);for(const b of d.buttons){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}};
for(const[width,height,dpr]of viewports)test(`Canonical Yard Pip ${width}x${height} DPR ${dpr}`,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<1100,hasTouch:width<1100}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
 await open(page,`${info.project.use.baseURL}/__yard_qa__/index.html`,info);const times=await page.evaluate(()=>window.yardQA.times),rows=[];
 for(const key of ['approach','turn','beforeEntry','entry','inspect','back','turnAway','rest','loopEnd','loopStart','beforeExit','exit','leaving','finished']){
  await page.evaluate(t=>window.yardQA.seek(t),times[key]);const d=await painted(page,times[key]);check(d);
  expect(d.view.yard.goodieInventory.alchemy_living_arbor).toBe(4);expect(d.view.yard.goodieInventory.alchemy_echo_chimes).toBe(7);
  if(key==='finished'){expect(d.view.pets).toHaveLength(0);expect(d.view.pendingGifts).toHaveLength(1);}else{expect(d.view.pets).toHaveLength(1);expect(d.view.pets[0].visitorId).toBe('pip_hamster');expect(d.view.pets[0].actorProfile.id).toBe('pip');expect(d.view.pendingGifts).toHaveLength(0);}
  rows.push({phase:key,at:times[key],targetInstances:d.targetInstances,pets:d.view.pets.map(p=>({visitorId:p.visitorId,phase:p.phase,frameIndex:p.frameIndex,position:p.position,clipOrigin:p.clipOrigin})),props:d.view.props.map(p=>({slotId:p.slotId,drawStandalone:p.drawStandalone,stillId:p.stillId,transform:p.transform})),projection:d.projection,retainedPages:d.retainedPages,decodedBytes:d.decodedBytesEstimate,pendingBytes:d.pendingBytesEstimate});
  if(['entry','inspect','back','turnAway','rest','exit'].includes(key))await info.attach(`yard-${width}x${height}-${key}`,{body:await page.screenshot(),contentType:'image/png'});
 }
 // Return navigation disposes and rehydrates the real scene/cache, rather than
 // rewinding its monotonic production clock.
 for(const name of ['Approach','Inspect','Exit','Inspect']){await page.getByRole('button',{name,exact:true}).click();const key=name.toLowerCase();check(await painted(page,times[key]));}
 await page.setViewportSize({width:height,height:width});await page.waitForFunction(()=>{const d=window.yardQA.diagnostics();return !d.pendingResize&&d.projection.width===d.canvasBounds.width&&d.projection.height===d.canvasBounds.height;});check(await page.evaluate(()=>window.yardQA.diagnostics()));
 await page.setViewportSize({width,height});await page.reload();await page.waitForFunction(()=>window.yardQA?.ready);check(await painted(page,times.approach));expect(errors).toEqual([]);
 await save(`${width}x${height}-dpr${dpr}.json`,JSON.stringify(rows,null,2));await info.attach('canonical-server-scene-evidence',{body:Buffer.from(JSON.stringify(rows,null,2)),contentType:'application/json'});await context.close();
});
test('default release gate renders no saved Pip and fetches no Pip pixels',async({page},info)=>{
 const requests=[];page.on('request',r=>{if(r.url().includes('/assets/yard-pip/'))requests.push(r.url());});
 await open(page,`${info.project.use.baseURL}/__yard_qa__/index.html?mode=closed`,info);const times=await page.evaluate(()=>window.yardQA.times);const d=await painted(page,times.approach);
 expect(d.view.pets).toHaveLength(0);expect(d.view.legacy).toHaveLength(1);expect(d.targetInstances).toBe(0);expect(requests).toEqual([]);expect(d.errors).toEqual([]);
});
test('a pending current page holds the whole canvas through resize until one coherent redraw',async({page},info)=>{
 await page.setViewportSize({width:320,height:568});let release,blocked=false;const gate=new Promise(r=>release=r);
 await page.route(/\/pip-snack-combined-r1-p28\.webp/,async route=>{blocked=true;await gate;await route.continue();});
 await open(page,`${info.project.use.baseURL}/__yard_qa__/index.html`,info);const times=await page.evaluate(()=>window.yardQA.times);
 await page.evaluate(t=>window.yardQA.seek(t),times.entry);check(await painted(page,times.entry));const before=await page.evaluate(()=>window.yardQA.bitmap());
 await page.evaluate(t=>window.yardQA.seek(t),times.rest);await expect.poll(()=>blocked).toBe(true);await page.waitForFunction(()=>window.yardQA.diagnostics().pendingDecodes===1);
 expect(await page.evaluate(()=>window.yardQA.bitmap())).toBe(before);await page.setViewportSize({width:568,height:320});await page.waitForFunction(()=>window.yardQA.diagnostics().pendingResize);
 expect(await page.evaluate(()=>window.yardQA.bitmap())).toBe(before);release();check(await painted(page,times.rest));
 const d=await page.evaluate(()=>window.yardQA.diagnostics());expect(d.projection.width).toBe(d.canvasBounds.width);expect(d.projection.height).toBe(d.canvasBounds.height);
 await info.attach('canonical-held-resize',{body:await page.screenshot(),contentType:'image/png'});
});

test('canonical 1x interaction exposes real contact grounding on the courtyard',async({browser},info)=>{
 test.setTimeout(50000);const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,recordVideo:{dir:info.outputPath('movie'),size:{width:390,height:844}}}),page=await context.newPage(),video=page.video();
 try{await open(page,`${info.project.use.baseURL}/__yard_qa__/index.html`,info);const times=await page.evaluate(()=>window.yardQA.times);await page.evaluate(at=>window.yardQA.seek(at),times.entry);check(await painted(page,times.entry));await page.evaluate(()=>window.yardQA.play());await expect.poll(async()=>page.evaluate(()=>window.yardQA.diagnostics().presentationTime),{timeout:32000,intervals:[200]}).toBeGreaterThanOrEqual(times.entry+19240);await page.evaluate(()=>window.yardQA.pause());const d=await page.evaluate(()=>window.yardQA.diagnostics());check(d);expect(d.view.pets[0].sourceRole).toBe('rest-loop');await save('canonical-1x.json',JSON.stringify({at:d.presentationTime,pet:d.view.pets[0],retainedPages:d.retainedPages,decodedBytes:d.decodedBytesEstimate,errors:d.errors},null,2));}
 finally{await context.close();if(video){const {readFile}=await import('node:fs/promises');await save('canonical-1x.webm',await readFile(await video.path()));}}
});
