import {test,expect} from '@playwright/test';
import {startSwFixture,registerWorker} from './helpers/swFixture.mjs';
import {openHome} from './helpers/home.js';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

test.use({serviceWorkers:'allow'});
test('worker activation preserves an already opened catalogue and the current document',async({page})=>{
 const fixture=await startSwFixture({gameActions:true});
 try{
  await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});
  await page.goto(fixture.origin+'/sw-proof.html');await registerWorker(page,'/legacy-sw.js');
  fixture.holdResources(['/sw.js']);
  await page.goto(fixture.origin+'/?tab=garden');await expect(page.locator('.gs2-stage')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByTestId('home-catalogue')).toBeVisible();
  const before=await page.evaluate(()=>{document.body.dataset.documentProof='same-document';return performance.timeOrigin;});
  await expect.poll(()=>fixture.pendingResources()).toContain('/sw.js');
  fixture.releaseResources(['/sw.js']);
  await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
  // A reload can follow controllerchange; observe the completed activation task too.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(before);
  await expect(page.getByTestId('home-catalogue')).toBeVisible();
  expect(await page.evaluate(()=>document.body.dataset.documentProof)).toBe('same-document');
 }finally{await fixture.close();}
});

test('real A assets can retire without stranding a lazy game: confirm Update & open into B',async({page},testInfo)=>{
 test.setTimeout(180000);
 const oldDist=await mkdtemp(resolve(tmpdir(),'ccgh-update-version-a-'));
 let fixture;
 try{
 execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',oldDist],{env:{...process.env,NODE_ENV:'production',VITE_BUILD_ID:'update-regression-a'},timeout:120000,maxBuffer:8*1024*1024});
 const graph=JSON.parse(await readFile(resolve(oldDist,'game-loading-graph.json'),'utf8'));
 const oldBlox=graph.chunks.find(chunk=>/\/BloxGame-[^/]+\.js$/.test(chunk.file))?.file;
 expect(oldBlox).toBeTruthy();
 fixture=await startSwFixture({gameActions:true,initialDist:oldDist,initialBuildId:'update-regression-a'});const requested=[];
 page.on('request',request=>requested.push(new URL(request.url()).pathname));
  await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});
  await page.goto(fixture.origin+'/?tab=garden');await expect(page.locator('.gs2-stage')).toBeVisible();await openHome(page);
  const before=await page.evaluate(()=>performance.timeOrigin);
  fixture.deployBuild('update-regression-b');
  expect((await fetch(fixture.origin+'/'+oldBlox)).status).toBe(404);
  await page.locator('[data-home-game="blox"]').click();
  await expect(page.getByRole('button',{name:'Update & open',exact:true})).toBeEnabled();
  await expect(page.locator('main[data-active-tab]')).toHaveAttribute('data-active-tab','garden');
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(before);expect(requested).not.toContain('/'+oldBlox);
  await expect(page.locator('.game-load-error')).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Update & open',exact:true})).toHaveCount(0);
  await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await page.locator('[data-home-game="blox"]').click();await expect(page.getByRole('button',{name:'Update & open',exact:true})).toBeEnabled();
  await page.screenshot({path:testInfo.outputPath('version-a-update-confirmation.png')});
  await page.getByRole('button',{name:'Update & open',exact:true}).click();
  await expect(page).toHaveURL(/tab=blox.*build=update-regression-b/);
  await expect(page.locator('[data-game-shell="blox"]')).toHaveAttribute('data-bx-phase','menu');
  expect(await page.evaluate(()=>window.__APP_BUILD_ID__)).toBe('update-regression-b');
  expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(before);
  await expect(page.locator('.game-load-error')).toHaveCount(0);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const hashes={};for(const file of ['index.html','sw.js','game-loading-graph.json'])hashes[file]={a:hash(await readFile(resolve(oldDist,file))),b:hash(await readFile(resolve(fixture.dist,file)))};
  expect(hashes['index.html'].a).not.toBe(hashes['index.html'].b);expect(hashes['sw.js'].a).not.toBe(hashes['sw.js'].b);
  await testInfo.attach('version-transition.json',{body:Buffer.from(JSON.stringify({oldBlox,oldBloxRetired:true,requested,hashes,buildRecipe:'Same production Vite source and public art; A uses VITE_BUILD_ID=update-regression-a, B is the normal dist under test.'},null,2)),contentType:'application/json'});
 }finally{
  await fixture?.close();
  if(dirname(oldDist)!==resolve(tmpdir())||!basename(oldDist).startsWith('ccgh-update-version-a-'))throw Error('Refuse cleanup outside the owned temporary build');
  await rm(oldDist,{recursive:true,force:true});
 }
});

test('a new build leaves Home open until its safe explicit update button is pressed',async({page})=>{
 const fixture=await startSwFixture({gameActions:true});
 try{
  await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});
  await page.goto(fixture.origin+'/?tab=garden');await expect(page.locator('.gs2-stage')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByTestId('home-catalogue')).toBeVisible();
  const before=await page.evaluate(()=>performance.timeOrigin);fixture.setBuildId('sw-proof-next');
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  const update=page.getByRole('button',{name:'Update app',exact:true});await expect(update).toBeVisible({timeout:10000});await expect(update).toBeEnabled();
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(before);
  await update.click();await expect(page).toHaveURL(/build=sw-proof-next/);
  await expect(page.locator('.gs2-stage')).toBeVisible();
  expect(await page.evaluate(()=>window.__APP_BUILD_ID__)).toBe('sw-proof-next');
  expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(before);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Update app',exact:true})).toHaveCount(0);
 }finally{await fixture.close();}
});

test('an update offer cannot interrupt an active Blox round',async({page})=>{
 const fixture=await startSwFixture({gameActions:true});
 try{
  await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});
  await page.goto(fixture.origin+'/?tab=blox');
  const shell=page.locator('[data-game-shell="blox"]');await expect(shell).toHaveAttribute('data-bx-phase','menu');
  await shell.getByRole('button',{name:'Start',exact:true}).click();await expect.poll(()=>fixture.player('account-a').blox.activeGame).toBe(true);
  await openHome(page);const before=await page.evaluate(()=>performance.timeOrigin);
  fixture.setBuildId('sw-proof-next');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  const update=page.getByRole('button',{name:'Update app',exact:true});await expect(update).toBeVisible();await expect(update).toBeDisabled();
  expect(await page.evaluate(()=>performance.timeOrigin)).toBe(before);expect(fixture.player('account-a').blox.activeGame).toBe(true);
  await page.getByRole('button',{name:'Close Home',exact:true}).click();await expect(shell).toBeVisible();expect(fixture.player('account-a').blox.activeGame).toBe(true);
 }finally{await fixture.close();}
});

test('the update action fits the complete Home viewport matrix without moving Bentoku below the fold',async({browser},testInfo)=>{
 test.setTimeout(120000);const fixture=await startSwFixture({gameActions:true});
 try{
  for(const [width,height]of [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[430,932]]){
   fixture.setBuildId('sw-proof');const context=await browser.newContext({viewport:{width,height},isMobile:width<1024,hasTouch:true,deviceScaleFactor:width===390?2:1,serviceWorkers:'allow'});
   try{
    const page=await context.newPage();await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','ru');});
    await page.goto(fixture.origin+'/?tab=garden');await expect(page.locator('.gs2-stage')).toBeVisible();await openHome(page);
    const before=await page.evaluate(()=>performance.timeOrigin);fixture.setBuildId('sw-proof-next');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    const update=page.getByRole('button',{name:'Обновить приложение',exact:true});await expect(update).toBeEnabled();
    const box=await update.boundingBox(),close=await page.getByRole('button',{name:'Закрыть главную',exact:true}).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x+box.width).toBeLessThanOrEqual(close.x);
    for(const target of [page.locator('[data-home-game="bentoku"] .home-thumbnail'),page.locator('[data-home-game="bentoku"] strong')]){const r=await target.boundingBox();expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(height+1);}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>performance.timeOrigin)).toBe(before);
    await expect(page.locator('[data-home-game="bentoku"] img')).toHaveJSProperty('naturalWidth',512);
    await page.screenshot({path:testInfo.outputPath(`update-home-${width}x${height}.png`)});
   }finally{await context.close();}
  }
 }finally{await fixture.close();}
});
