import {test,expect} from '@playwright/test';
import path from 'node:path';
const route='/__pip_qa__/index.html';
const matrix=[{name:'320x568',width:320,height:568,mobile:true,dpr:1},{name:'360x800-dpr2',width:360,height:800,mobile:true,dpr:2},{name:'390x844-dpr2',width:390,height:844,mobile:true,dpr:2},{name:'414x896',width:414,height:896,mobile:true,dpr:1},{name:'568x320',width:568,height:320,mobile:true,dpr:1},{name:'844x390',width:844,height:390,mobile:true,dpr:1},{name:'768x1024',width:768,height:1024,mobile:true,dpr:1},{name:'1024x768',width:1024,height:768,mobile:true,dpr:1},{name:'1280x720',width:1280,height:720,mobile:false,dpr:1},{name:'375x812',width:375,height:812,mobile:true,dpr:1},{name:'393x873',width:393,height:873,mobile:true,dpr:1}];
const snapshot=page=>page.evaluate(()=>window.pipQA.snapshot());
const bootDiagnostics=new WeakMap();
async function openFixture(page,info){
 const diagnostics={http:[],pageErrors:[],consoleErrors:[],requestFailures:[]};bootDiagnostics.set(page,diagnostics);
 page.on('pageerror',e=>diagnostics.pageErrors.push(e.stack||e.message));
 page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push(m.text());});
 page.on('requestfailed',r=>diagnostics.requestFailures.push({url:r.url(),failure:r.failure()}));
 page.on('response',r=>{if(r.status()>=400)diagnostics.http.push({url:r.url(),status:r.status()});});
 try{const response=await page.goto(route);expect(response?.status(),`Fixture entry failed: ${JSON.stringify(diagnostics)}`).toBe(200);await ready(page);}
 catch(error){await info.attach('pip-boot-diagnostics',{body:JSON.stringify(diagnostics,null,2),contentType:'application/json'});throw error;}
}
async function ready(page){await expect.poll(async()=>{
 const diagnostics=bootDiagnostics.get(page);if(diagnostics?.pageErrors.length)throw Error(`Fixture module boot failed: ${JSON.stringify(diagnostics)}`);
 return page.evaluate(()=>!!window.pipQA);
},{timeout:15000}).toBe(true);await expect(page.locator('#status')).toContainText('frame ready',{timeout:15000});}
async function jump(page,phase){await page.getByLabel('Jump to phase').selectOption(phase);await expect(page.locator('#status')).toContainText('frame ready',{timeout:15000});await expect.poll(async()=>{const s=await snapshot(page);return s.lastDraw?.at===s.at;}).toBe(true);}
async function bounded(page){const s=await snapshot(page);expect(s.runtimeActivated).toBe(false);expect(s.cache.decodedBytes+s.cache.reservedBytes).toBeLessThanOrEqual(32*1024*1024);expect(s.cache.retained).toBeLessThanOrEqual(3);expect(s.cache.active).toBeLessThanOrEqual(1);expect(s.loadedURLs.length).toBeLessThan(s.manifestPages);expect(s.viewport.overflow).toBe(false);return s;}
for(const v of matrix)test(`Pip full-visit surfaces ${v.name}`,async({browser,baseURL},info)=>{
 const context=await browser.newContext({baseURL,viewport:{width:v.width,height:v.height},deviceScaleFactor:v.dpr,isMobile:v.mobile,hasTouch:v.mobile});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await openFixture(page,info);let s=await bounded(page);expect(s.lastDraw.targetHidden).toBe('pip-snack-test');expect(s.lastDraw.sourceRole).toBe('nibble');expect(s.lastDraw.groundSupportCount).toBe(2);await page.screenshot({path:info.outputPath(`${v.name}-nibble.png`)});
 await jump(page,'rest');s=await bounded(page);expect(s.lastDraw.targetHidden).toBe('pip-snack-test');expect(s.lastDraw.sourceRole).toBe('rest-loop');expect(s.lastDraw.groundSupportCount).toBe(4);await page.screenshot({path:info.outputPath(`${v.name}-rest.png`)});
 await jump(page,'depart');s=await bounded(page);expect(s.lastDraw.targetHidden).toBeNull();expect(s.lastDraw.phase).toBe('depart');await page.screenshot({path:info.outputPath(`${v.name}-depart.png`)});
 await jump(page,'done');s=await bounded(page);expect(s.lastDraw.phase).toBe('complete');expect(s.lastDraw.targetHidden).toBeNull();expect(errors).toEqual([]);
 const sizes=await page.locator('button,select').evaluateAll(nodes=>nodes.map(n=>({h:n.getBoundingClientRect().height,w:n.getBoundingClientRect().width})));expect(sizes.every(n=>n.h>=44&&n.w>=44)).toBe(true);
 if(v.name==='320x568')await info.attach('pip-identity-at-game-scale',{path:path.join(process.cwd(),'recovery-tools/yard-pip-snack-qa/public/pip-identity-and-scale-review.png'),contentType:'image/png'});
 await info.attach('diagnostics',{body:JSON.stringify(s,null,2),contentType:'application/json'});
 }finally{await context.close();}
});
test('Pip exact rest seam, stepping, repeated controls and page-aware cache',async({page},info)=>{
 await openFixture(page,info);await jump(page,'seam');const before=await snapshot(page);await page.getByRole('button',{name:'+40 ms',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).lastDraw?.at).toBe(before.at+40);const after=await bounded(page);expect(before.lastDraw.index).toBe(479);expect(after.lastDraw.index).toBe(448);expect(after.lastDraw.targetHidden).toBe('pip-snack-test');
 await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Play',exact:true}).click();await page.getByRole('button',{name:'Pause',exact:true}).click();await bounded(page);
 await page.screenshot({path:info.outputPath('rest-seam.png')});
});
test('Pip delayed and failed page preserves the coherent canvas and recovers',async({page},info)=>{
 await openFixture(page,info);await page.getByRole('button',{name:'Delay decode',exact:true}).click();const before=await page.locator('canvas').evaluate(c=>c.toDataURL());const h=(await snapshot(page)).holdCount;await page.getByLabel('Jump to phase').selectOption('turn');await expect.poll(async()=>(await snapshot(page)).holdCount).toBeGreaterThan(h);expect(await page.locator('canvas').evaluate(c=>c.toDataURL())).toBe(before);await ready(page);await bounded(page);
 await page.getByRole('button',{name:'Decode delayed',exact:true}).click();await page.getByRole('button',{name:'Fail one page',exact:true}).click();const stable=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.getByRole('button',{name:'Retry / clear',exact:true}).click();await expect(page.locator('#status')).toContainText('Last coherent frame retained');expect(await page.locator('canvas').evaluate(c=>c.toDataURL())).toBe(stable);await page.screenshot({path:info.outputPath('expected-page-failure.png')});
 await page.getByRole('button',{name:'Retry / clear',exact:true}).click();await ready(page);const s=await bounded(page);expect(s.lastDraw.sourceRole).toBe('turn-away');expect(s.errors.some(e=>e.includes('503'))).toBe(true);await page.screenshot({path:info.outputPath('page-failure-recovered.png')});
});
test('Pip one real complete accelerated visit stays demand-scoped',async({page},info)=>{
 test.setTimeout(80000);await openFixture(page,info);await page.getByRole('button',{name:'Restart',exact:true}).click();await page.getByLabel('Playback speed').selectOption('4');await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).lastDraw?.phase,{timeout:65000,intervals:[250]}).toBe('complete');const s=await bounded(page);expect(s.at).toBe(180000);expect(s.lastDraw.targetHidden).toBeNull();expect(s.errors).toEqual([]);expect(s.loadedURLs.length).toBeGreaterThan(20);await info.attach('full-visit-diagnostics',{body:JSON.stringify(s,null,2),contentType:'application/json'});await page.screenshot({path:info.outputPath('full-visit-complete.png')});
});
test('Pip normative-speed interaction movie exposes contact and motion continuity',async({browser,baseURL},info)=>{
 test.setTimeout(45000);const context=await browser.newContext({baseURL,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,recordVideo:{dir:info.outputPath('normative-video'),size:{width:390,height:844}}});const page=await context.newPage(),video=page.video();
 try{await openFixture(page,info);await jump(page,'action');const start=(await snapshot(page)).at;await page.getByLabel('Playback speed').selectOption('1');await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(async()=>(await snapshot(page)).at,{timeout:30000,intervals:[200]}).toBeGreaterThanOrEqual(start+19240);await page.getByRole('button',{name:'Pause',exact:true}).click();const s=await bounded(page);expect(s.errors).toEqual([]);expect(s.lastDraw.sourceRole).toBe('rest-loop');expect(s.lastDraw.groundSupportCount).toBe(4);await info.attach('normative-speed-diagnostics',{body:JSON.stringify(s,null,2),contentType:'application/json'});}finally{await context.close();if(video)await info.attach('pip-normal-speed-motion',{path:await video.path(),contentType:'video/webm'});}
});
