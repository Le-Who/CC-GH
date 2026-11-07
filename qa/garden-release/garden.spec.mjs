/** Exact image, real server/auth, disposable isolated CI database; no API mocks. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import {fixture,insertFixture,auth,origin,DATABASE_URL,saved,assertDevelopmentEnvironment} from './image-helpers.mjs';
import {createGardenEconomyState,getGardenXpRequired} from '../../game-logic.js';
import {migrateGardenR2,validateGardenR2Player} from '../../game-logic/garden-r2/domain.js';
assertDevelopmentEnvironment();
test('Garden actual-image terrarium, care and all menu tabs across four viewports',async({browser})=>{
 test.setTimeout(90000);
 const OUT=path.resolve(process.env.YARD_DEVELOPMENT_EVIDENCE),runId=process.env.YARD_DEVELOPMENT_RUN_ID;
 const runtime=JSON.parse(await fs.readFile(path.join(OUT,'runtime.json'),'utf8'));assert.equal(runtime.runId,runId);
 const sql=postgres(DATABASE_URL,{max:1,prepare:false,connect_timeout:5,statement_timeout:5000});
 const proof={head:process.env.GITHUB_SHA,status:'failed',cases:[],captures:[],auth:'signed Telegram disposable CI account; production auth middleware',mockedApi:false};
 try{
  const [db]=await sql`SELECT current_database() AS name`;assert.equal(db.name,'ccgh_yard_production_ci');
  const f=fixture(),now=Date.now();f.initial.resources.gold=100000;
  f.initial.garden={...createGardenEconomyState(now),name:'Release Garden',level:30,xp:0,xpRequired:getGardenXpRequired(30),levelReady:false,shelvesUnlocked:2,plants:[{id:'garden-release-daisy',type:'daisy',level:12,shelfIndex:0,spotIndex:0,phase:3,phaseProgress:0,lastTapped:0,lastWatered:now}]};
  f.initial=migrateGardenR2(f.initial,{now,legacyRevision:0,acknowledgedTotal:0});validateGardenR2Player(f.initial);
  await insertFixture(sql,f,runId);const initData=await auth(f);
  for(const [width,height]of [[320,568],[390,844],[568,320],[1280,720]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<800,hasTouch:true,deviceScaleFactor:width===390?2:1,serviceWorkers:'block'});
   let page;
   try{
    page=await context.newPage();const assets=[],requests=[];
    page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/games/garden-v2/terrarium/'))assets.push({path:new URL(r.url()).pathname,status:r.status()});});
    page.on('request',r=>{if(new URL(r.url()).pathname==='/api/player/mutate'){const b=r.postDataJSON();requests.push({action:b.action,command:b.payload?.command});}});
    await page.addInitScript(({initData,id,parentOrigin})=>{if(location.origin!==parentOrigin)return;window.Telegram={WebApp:{initData,initDataUnsafe:{user:{id,first_name:'Disposable development fixture'}}}};localStorage.setItem('garden_shelf_language','en');},{initData,id:Number(f.externalId),parentOrigin:origin('origin')});
    await page.goto(origin('origin')+'/#tgWebAppPlatform=android&tgWebAppVersion=8.0',{waitUntil:'domcontentloaded'});
    await expect.poll(()=>page.evaluate(()=>window.__APP_BUILD_ID__)).toBe(runtime.inputs.candidate.commit);
    await expect(page.locator('.gs2-stage')).toBeVisible();await expect(page.locator('.gs2-terrarium')).toBeVisible();
    await expect(page.locator('[data-plant-id="garden-release-daisy"]')).toBeVisible();
    await expect.poll(()=>requests.some(r=>r.action==='garden.r2'&&r.command==='resume')).toBe(true);
    await expect(page.locator('.gs2-settings')).toBeEnabled();
    await page.evaluate(()=>document.fonts.ready);
    const capture=async suffix=>{const name=`garden-${width}x${height}-${suffix}.png`;await page.screenshot({path:path.join(OUT,name)});proof.captures.push(name);};
    const fits=async()=>{const box=await page.locator('.gs2-dialog').boundingBox();assert(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1,'Dialog must fit viewport');await expect(page.locator('.gs2-dialog .gs2-close')).toBeInViewport();};
    const close=async()=>{await page.locator('.gs2-dialog .gs2-close').click();await expect(page.locator('.gs2-dialog')).toHaveCount(0);};
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
    await expect(page.locator('[data-garden-substrate] .gs2-art')).toHaveAttribute('src',/pot\.webp$/);
    await expect(page.locator('[data-garden-substrate] strong')).toHaveText(/\d+\/\d+/);
    assert(await page.locator('.gs2-metric').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)),'Resource counters fit their actual cells');
    await capture('terrarium');
    const details=page.locator('[data-plant-id="garden-release-daisy"] [data-plant-details-button]');await details.scrollIntoViewIfNeeded();await details.click();await expect(page.locator('[data-garden-panel="plant-detail"]')).toBeVisible();await fits();await close();
    await page.locator('.gs2-empty-target').first().click();await expect(page.locator('[data-garden-panel="seed-shop-inventory"]')).toBeVisible();await expect(page.locator('.gs2-catalog-row')).toHaveCount(14);await fits();await capture('shop');await close();
    await page.locator('.gs2-progression').click();
    for(const tab of ['overview','research','collections']){await page.locator(`[data-menu-tab="${tab}"]`).click();await expect(page.locator(`#garden-progress-${tab}`)).toBeVisible();await fits();}
    await capture('progress');await page.locator('[data-menu-tab="overview"]').click();await page.getByRole('button',{name:'Garden quests',exact:true}).click();
    for(const tab of ['daily','story']){await page.locator(`#garden-quests-tabs-${tab}`).click();await expect(page.locator(`#garden-quests-tabs-${tab}`)).toHaveAttribute('aria-selected','true');await fits();}await capture('quests');await close();
    await page.locator('.gs2-settings').click();await expect(page.locator('[data-garden-panel="settings"]')).toBeVisible();await fits();await close();
    // All seven independent runtime skins must load successfully from the image.
    const expected=['conservatory.webp','glass-frame.webp','hud-rail.webp','menu-button.webp','menu-panel.webp','shelf.webp','sign.webp'];
    await expect.poll(()=>[...new Set(assets.filter(a=>a.status===200).map(a=>a.path.split('/').pop()))].sort()).toEqual(expected);
    assert.deepEqual(assets.filter(a=>a.status>=400),[]);
    assert(!requests.some(r=>/garden\.sync|resetEconomy|creditEarned/.test(r.action)));
    validateGardenR2Player(await saved(sql,f,runId));
    proof.cases.push({viewport:`${width}x${height}`,status:'passed',care:true,shop:true,progressTabs:['overview','research','collections'],questTabs:['daily','story'],settings:true,assets,requests});
   }catch(error){
    try{const name=`garden-${width}x${height}-failure.png`;await page?.screenshot({path:path.join(OUT,name)});proof.captures.push(name);proof.failure={message:String(error),url:page?.url(),observation:await page?.evaluate(()=>({dialogs:[...document.querySelectorAll('[role="dialog"]')].map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON()})),buttons:[...document.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({name:n.getAttribute('aria-label'),text:n.textContent,disabled:n.disabled}))}))};}catch(captureError){proof.captureFailure=String(captureError);}throw error;
   }finally{await context.close();}
  }
  proof.status='passed';
 }finally{await fs.writeFile(path.join(OUT,'garden-proof.json'),JSON.stringify(proof,null,2)+'\n');await sql.end({timeout:5});}
});
