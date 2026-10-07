/** Real App/Home/CourtyardGame/Scene smoke. Only the API reply is fixture-backed;
 * it is an exact prior export from the normal GET /api/player/snapshot handler.
 * No store setter, navigation setter, preview URL, or invented trajectory. */
import{test,expect}from'@playwright/test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';
import{selectHomeGame}from'../e2e/helpers/home.js';
const file=path.resolve(process.env.QUALIFIED_APP_SNAPSHOT||'test-results/normal-runtime/qualified-app-snapshot.json'),bytes=await fs.readFile(file),snapshot=JSON.parse(bytes),fixtureSha256=createHash('sha256').update(bytes).digest('hex');
assert.equal(snapshot.player.onboarded,true);assert.equal(snapshot.yardRuntime.storageVersion,3);assert.equal(snapshot.yardRuntime.canonicalVisitProtocol,'yard-canonical-authoritative/v1');assert.equal(snapshot.yardRuntime.canonicalVisits.length,1);assert.deepEqual(snapshot.yardRuntime.visits,[]);
const plan=snapshot.yardRuntime.canonicalVisits[0].plan,OUT=path.resolve('test-results/saved-visit-app');
const read=page=>page.evaluate(()=>window.__yardPipIntegration?.snapshot());
async function ready(page){await expect.poll(async()=>{const d=await read(page);return d?.mode==='canonical-saved-visits'&&d.scene?.ready===true&&d.scene.canonicalFood?.render?.available===true;},{timeout:25000}).toBe(true);await expect(page.locator('.cy-pip-direct-layer canvas')).toHaveCount(1);await expect(page.locator('.cy-pip-viewport-note')).toHaveCount(0);await expect(page.locator('[data-pip-control]')).toHaveCount(0);}
for(const viewport of[{width:320,height:568,dpr:1},{width:360,height:800,dpr:1},{width:375,height:812,dpr:1},{width:390,height:844,dpr:2},{width:414,height:896,dpr:1},{width:568,height:320,dpr:1},{width:844,height:390,dpr:1},{width:768,height:1024,dpr:1},{width:1024,height:768,dpr:1},{width:1280,height:720,dpr:1},{width:612,height:982,dpr:1,desktop:true}])test(`normal Home to saved Yard and back ${viewport.width}x${viewport.height}`,async({browser},info)=>{
 const id=`${viewport.width}x${viewport.height}-dpr${viewport.dpr}`,context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.dpr,isMobile:!viewport.desktop,hasTouch:!viewport.desktop,serviceWorkers:'block'}),page=await context.newPage(),errors=[],mutations=[],checkpoints=[];await fs.mkdir(OUT,{recursive:true});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','saved_visit_ui_fixture');localStorage.setItem('garden_shelf_language','en');});
 await page.route('**/socket.io/**',route=>route.abort());
 await page.route(url=>url.pathname==='/api/player/snapshot',route=>route.fulfill({status:200,contentType:'application/json',body:bytes}));
 await page.route('**/api/player/mutate',async route=>{mutations.push(route.request().postDataJSON());await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'SAVED_VISIT_UI_SMOKE_READ_ONLY'})});});
 await page.clock.install();
 const capture=async name=>{const d=await read(page);checkpoints.push({name,diagnostics:d});await page.screenshot({path:path.join(OUT,`${id}-${name}.png`),scale:'device'});return d;};
 try{
  await page.goto(info.project.use.baseURL+'/');await expect(page.locator('.gs2-stage')).toBeVisible({timeout:25000});await selectHomeGame(page,'room');await ready(page);
  assert.equal(new URL(page.url()).searchParams.has('yardPipPreview'),false);assert.equal(new URL(page.url()).searchParams.has('yardCanonicalFood'),false);let d=await capture('automatic-normal-entry');assert.equal(d.scene.plannerWorkerActive,false);assert.equal(d.scene.inspectionCount,0);
  await page.clock.fastForward(32000);await expect.poll(async()=>(await read(page))?.scene?.lastFrame?.visibility).toBe('both');d=await capture('on-screen-saved-visitor');assert.equal(d.scene.canonicalRecords[0].uses,1);assert.equal(d.scene.lastFrame.visitId,plan.visitId);assert.equal(d.scene.groundingRecipe,'pip-garden-grounding-v1');
  await page.locator('.cy-home').click();await expect(page.getByTestId('home-catalogue')).toBeVisible();await page.locator('[data-home-game="garden"]').click();await expect(page.locator('.gs2-stage')).toBeVisible();await expect(page.locator('.cy-pip-direct-layer canvas')).toHaveCount(0);
  await selectHomeGame(page,'room');await ready(page);d=await capture('normal-navigation-return');assert.equal(d.scene.lastFrame.visitId,plan.visitId);assert.equal(d.scene.lastFrame.visibility,'both');
  await page.reload();await expect(page.locator('.cy-app')).toBeVisible({timeout:25000});await ready(page);await page.clock.fastForward(32000);await expect.poll(async()=>(await read(page))?.scene?.lastFrame?.visibility).toBe('both');await capture('reload-saved-visitor');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  // GardenR2Provider always resumes on mount and may reconcile its blocked
  // fixture request. Preserve zero Yard commands and reject any other traffic.
  const knownLifecycle=request=>request.accountId===snapshot.player.id&&request.payload?.accountId===snapshot.player.id&&(request.action==='garden.r2.reconcile'||request.action==='garden.r2'&&['resume','heartbeat'].includes(request.payload.command)&&Object.keys(request.payload.input||{}).length===0);
  assert.deepEqual(mutations.filter(request=>!knownLifecycle(request)),[]);assert.deepEqual(mutations.filter(request=>request.action?.startsWith('yard.')),[]);
 }finally{await fs.writeFile(path.join(OUT,`${id}-proof.json`),JSON.stringify({scope:'Actual application build and ordinary Home game-selection navigation with exact normal GET-handler API fixture. Not an end-to-end live backend or uninterrupted duration test.',fixtureSha256,visitId:plan.visitId,viewport,checkpoints,errors,mutations,blockedLifecycleScope:'Only source Garden resume/heartbeat/reconcile are expected and recorded; zero Yard commands and zero unexpected requests.',clockControl:'Playwright monotonic fast-forward advances the existing saved presentation; source plan and API bytes remain unchanged.'},null,2)+'\n');await context.close();}
});
