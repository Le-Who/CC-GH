import {test,expect} from '@playwright/test';
const viewports=[[320,568,1],[360,800,1],[390,844,1],[414,896,1],[568,320,1],[844,390,1],[768,1024,1],[1024,768,1],[1280,720,1],[393,873,2]];
const sampleTimes=[-50,0,1500,4200,10000,11150,11200,14000,17000,19150,19200,19950];
for(const[width,height,dpr]of viewports)test(`Mochi combined media ${width}x${height} DPR ${dpr}`,async({browser},info)=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<1100,hasTouch:width<1100});const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(`${info.project.use.baseURL}/__mochi_qa__/index.html`);await page.waitForFunction(()=>window.mochiQA?.ready);const results=[];
 for(const sourceMs of sampleTimes){
  await page.evaluate(t=>window.mochiQA.seek(t),sourceMs);await page.waitForFunction(t=>window.mochiQA.diagnostics().painted?.sourceMs===t,sourceMs);
  const d=await page.evaluate(()=>window.mochiQA.diagnostics());expect(d.errors).toEqual([]);expect(d.painted.targetInstances).toBe(1);expect(d.painted.otherInstances).toBe(1);expect(d.horizontalOverflow).toBe(false);
  expect(d.retainedPages).toBeLessThanOrEqual(3);expect(d.decodedBytes+d.pendingBytes).toBeLessThanOrEqual(64*1048576);expect(d.pendingDecodes).toBeLessThanOrEqual(1);
  for(const b of d.buttons){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}
  const inside=sourceMs>=0&&sourceMs<19200;expect(d.painted.targetHidden).toBe(inside?'target-toy':null);results.push({sourceMs,...d.painted});
  if([0,4200,10000,19200].includes(sourceMs))await info.attach(`mochi-${width}x${height}-${sourceMs}`,{body:await page.screenshot(),contentType:'image/png'});
 }
 // Repeated navigation and resize reuse the same source plan and owner slot.
 for(const name of ['Entry','Rest','Entry','Exit','Rest'])await page.getByRole('button',{name,exact:true}).click();
 await page.waitForFunction(()=>window.mochiQA.diagnostics().painted?.sourceMs===10600);await page.setViewportSize({width:height,height:width});await page.waitForFunction(w=>window.mochiQA.diagnostics().painted?.width===w&&window.mochiQA.diagnostics().painted?.sourceMs===10600,height);
 expect((await page.evaluate(()=>window.mochiQA.diagnostics())).horizontalOverflow).toBe(false);await page.setViewportSize({width,height});
 await page.reload();await page.waitForFunction(()=>window.mochiQA?.diagnostics().painted?.sourceMs===0);expect(errors).toEqual([]);
 await info.attach('mochi-source-ownership-and-budget',{body:Buffer.from(JSON.stringify(results,null,2)),contentType:'application/json'});await context.close();
});
