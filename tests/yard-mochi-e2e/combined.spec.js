import {test,expect} from '@playwright/test';
const viewports=[[320,568,1],[360,800,1],[390,844,1],[414,896,1],[568,320,1],[844,390,1],[768,1024,1],[1024,768,1],[1280,720,1],[393,873,2]];
const sampleTimes=[-50,0,1500,4200,10000,11150,11200,14000,17000,19150,19200,19950];
// Return the checked snapshot itself. A separate evaluate after a successful
// wait can race ResizeObserver, which deliberately invalidates painted state.
async function paintedSnapshot(page,sourceMs,width){
 const handle=await page.waitForFunction(({sourceMs,width})=>{
  const d=window.mochiQA?.diagnostics(),r=document.querySelector('canvas')?.getBoundingClientRect();
  if(!d?.painted||d.painted.sourceMs!==sourceMs||d.painted.width!==width||!r
   ||d.painted.width!==r.width||d.painted.height!==r.height)return false;
  const f=document.querySelector('footer');
  return {...d,canvasBounds:{x:r.x,y:r.y,width:r.width,height:r.height},footerFits:f.scrollHeight<=f.clientHeight};
 },{sourceMs,width});
 try{return await handle.jsonValue();}finally{await handle.dispose();}
}
for(const[width,height,dpr]of viewports)test(`Mochi combined media ${width}x${height} DPR ${dpr}`,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<1100,hasTouch:width<1100});const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(`${info.project.use.baseURL}/__mochi_qa__/index.html`);await page.waitForFunction(()=>window.mochiQA?.ready);const results=[];let initialBounds;
 for(const sourceMs of sampleTimes){
  await page.evaluate(t=>window.mochiQA.seek(t),sourceMs);const d=await paintedSnapshot(page,sourceMs,width);
  initialBounds??=d.canvasBounds;expect(d.canvasBounds).toEqual(initialBounds);expect(d.footerFits).toBe(true);
  expect(d.errors).toEqual([]);expect(d.painted.targetInstances).toBe(1);expect(d.painted.otherInstances).toBe(1);expect(d.horizontalOverflow).toBe(false);
  for(const b of d.painted.visibleBounds){expect(b.left).toBeGreaterThanOrEqual(7.99);expect(b.top).toBeGreaterThanOrEqual(7.99);expect(b.right).toBeLessThanOrEqual(d.painted.width-7.99);expect(b.bottom).toBeLessThanOrEqual(d.painted.height-7.99);}
  expect(d.retainedPages).toBeLessThanOrEqual(3);expect(d.decodedBytes+d.pendingBytes).toBeLessThanOrEqual(64*1048576);expect(d.pendingDecodes).toBeLessThanOrEqual(1);
  for(const b of d.buttons){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}
  const inside=sourceMs>=0&&sourceMs<19200;expect(d.painted.targetHidden).toBe(inside?'target-toy':null);results.push({sourceMs,...d.painted,canvasBounds:d.canvasBounds,pendingBytes:d.pendingBytes,pendingDecodes:d.pendingDecodes,footerFits:d.footerFits});
  if([0,4200,10000,19200].includes(sourceMs))await info.attach(`mochi-${width}x${height}-${sourceMs}`,{body:await page.screenshot(),contentType:'image/png'});
 }
 // Repeated navigation and resize reuse the same source plan and owner slot.
 for(const name of ['Entry','Rest','Entry','Exit','Rest'])await page.getByRole('button',{name,exact:true}).click();
 await paintedSnapshot(page,10600,width);await page.setViewportSize({width:height,height:width});const rotated=await paintedSnapshot(page,10600,height);
 expect(rotated.horizontalOverflow).toBe(false);expect(rotated.footerFits).toBe(true);await page.setViewportSize({width,height});
 expect((await paintedSnapshot(page,10600,width)).canvasBounds).toEqual(initialBounds);
 // Exercise the former footer-wrap race repeatedly, without retries or sleeps.
 for(const sourceMs of [-50,0,4200,19200,-50,0,10000,19200]){
  await page.evaluate(t=>window.mochiQA.seek(t),sourceMs);const d=await paintedSnapshot(page,sourceMs,width);
  expect(d.canvasBounds).toEqual(initialBounds);expect(d.footerFits).toBe(true);expect(d.painted.targetInstances).toBe(1);expect(d.painted.otherInstances).toBe(1);expect(d.errors).toEqual([]);
 }
 await page.reload();const reloaded=await paintedSnapshot(page,0,width);expect(reloaded.canvasBounds).toEqual(initialBounds);expect(errors).toEqual([]);
 await info.attach('mochi-source-ownership-and-budget',{body:Buffer.from(JSON.stringify(results,null,2)),contentType:'application/json'});await context.close();
});
