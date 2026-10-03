import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {openHome,selectHomeGame} from './helpers/home.js';
import {mountHomePlayerFixture} from './helpers/homePlayerFixture.js';
test.use({serviceWorkers:'block'});

test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id',`home_${Date.now()}_${Math.random()}`);localStorage.setItem('garden_shelf_language','en');});});
test('Escape menu fallback opens Home after native dialog handlers have had ownership',async({page})=>{
 await mountHomePlayerFixture(page);await page.goto('/?tab=blox');
 const shell=page.locator('[data-game-shell="blox"]');
 await expect(shell).toHaveAttribute('data-bx-phase','menu');
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('home-catalogue')).toBeVisible();
 await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',true);
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
 await expect(shell).toHaveAttribute('data-bx-phase','menu');
 await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',false);
});
test('Home keeps the same Garden mounted, removes dock, and returns focus',async({page})=>{
 await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();
 await page.locator('.gs2-stage').evaluate(node=>node.dataset.retentionProof='same-stage');
 await openHome(page);await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',true);
 await expect(page.locator('[data-home-game]')).toHaveCount(8);
 await expect(page.locator('.bottom-tabs')).toHaveCount(0);
 await page.locator('[data-home-game="settlement"]').focus();await page.keyboard.press('Tab');
 await expect(page.locator('.home-profile summary')).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.locator('.home-wallet')).toBeVisible();
 await page.keyboard.press('Tab');await expect(page.locator('.home-settings button').first()).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
 await expect(page.locator('.gs2-stage')).toHaveAttribute('data-retention-proof','same-stage');
 await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',false);
 await expect(page.getByRole('button',{name:'All games',exact:true})).toBeFocused();
});
test('Blox Home Escape preserves pause; leaving waits and refuses errors through Forward',async({page})=>{
 await mountHomePlayerFixture(page);
 await page.goto('/?tab=blox');const shell=page.locator('[data-game-shell="blox"]');
 const [start]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/player/mutate')),shell.getByRole('button',{name:'Start',exact:true}).click()]);expect((await start.json()).error).toBeUndefined();
 // Exercise restoration of the real acknowledged fixture run on reload as well.
 await page.reload();await expect(shell.locator('[data-game-pause]')).toBeVisible();
 await shell.evaluate(node=>node.dataset.retentionProof='same-blox');
 await openHome(page);await page.keyboard.press('Escape');await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
 await expect(shell.locator('.bx-dialog')).toBeVisible();await expect(shell).toHaveAttribute('data-retention-proof','same-blox');
 await openHome(page);await page.goBack();await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
 await expect(shell.locator('.bx-dialog')).toBeVisible();await expect(shell).toHaveAttribute('data-retention-proof','same-blox');
 await openHome(page);let release;const gate=new Promise(resolve=>release=resolve);
 const failingLeave=async route=>{if(route.request().postDataJSON()?.action==='blox.end'){await gate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'HOME_TEST_SAVE_FAILED'})});}else await route.fallback();};
 await page.route('**/api/player/mutate',failingLeave);
 await page.locator('[data-home-game="garden"]').click();await page.getByRole('button',{name:'Finish & open'}).click();
 await expect(page.getByTestId('home-catalogue')).toHaveAttribute('aria-busy','true');await expect(shell).toHaveAttribute('data-retention-proof','same-blox');
 await page.keyboard.press('Escape');await expect(page.getByTestId('home-catalogue')).toBeVisible();
 await page.goBack();await expect(page.getByTestId('home-catalogue')).toBeVisible();
 release();await expect(page.getByTestId('home-catalogue').getByRole('alert')).toBeVisible();await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','blox');
 await page.getByRole('button',{name:'Close Home'}).click();await page.goForward();
 await expect(page.getByTestId('home-catalogue')).toHaveCount(0);await expect(shell).toHaveAttribute('data-retention-proof','same-blox');
 await expect(shell.locator('.bx-dialog')).toBeVisible();expect(new URL(page.url()).searchParams.get('tab')).toBe('blox');
 await openHome(page);await page.locator('[data-home-game="garden"]').click();
 await page.unroute('**/api/player/mutate',failingLeave);await page.getByRole('button',{name:'Finish & open'}).click();await expect(page.locator('.gs2-stage')).toBeVisible();await expect(shell).toHaveCount(0);
});
test('Home Forward and repeated owned Back retain the latest game URL through reload',async({page})=>{
 await mountHomePlayerFixture(page);await page.goto('/?tab=blox');
 await expect(page.locator('[data-game-shell="blox"]')).toBeVisible();
 await selectHomeGame(page,'garden');await page.goForward();
 await expect(page.locator('.gs2-stage')).toBeVisible();expect(new URL(page.url()).searchParams.get('tab')).toBeNull();
 await selectHomeGame(page,'match3');await page.goForward();
 for(const move of ['goBack','goBack','goForward','goForward']){
  await page[move]();await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','match3');
  await expect(page.getByTestId('home-catalogue')).toHaveCount(0);expect(new URL(page.url()).searchParams.get('tab')).toBe('match3');
 }
 for(let i=0;i<2;i++){
  await openHome(page);await page.getByRole('button',{name:'Close Home'}).click();await page.goForward();await page.goBack();
  await expect(page.locator('[data-game-shell="match3"]')).toBeVisible();expect(new URL(page.url()).searchParams.get('tab')).toBe('match3');
 }
 await page.reload();await expect(page.locator('[data-game-shell="match3"]')).toBeVisible();
 await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','match3');expect(new URL(page.url()).searchParams.get('tab')).toBe('match3');
});
test('Trivia keeps question on Home close and forfeits once before switching',async({page})=>{
 await page.goto('/?tab=trivia');await page.getByTestId('trv2-start').click();await expect(page.getByTestId('trv2-question')).toBeVisible();
 const question=await page.getByTestId('trv2-question').textContent();
 await page.getByTestId('trv2-pause').click();
 await page.locator('.trv2-dialog').getByRole('button',{name:'All games',exact:true}).click();
 await page.keyboard.press('Escape');await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-paused','true');
 await expect(page.getByTestId('trv2-question')).toHaveText(question);
 await openHome(page);let forfeits=0;page.on('request',request=>{if(request.url().endsWith('/api/trivia/forfeit'))forfeits++;});
 await page.locator('[data-home-game="garden"]').click();await page.getByRole('button',{name:'Finish & open'}).click();
 await expect(page.locator('.gs2-stage')).toBeVisible();expect(forfeits).toBe(1);
});
for(const [id,prefix] of [['match3','m3'],['bubbo','bb']])test(`${id} keeps its mounted run and pause on repeated Home close`,async({page})=>{
 await mountHomePlayerFixture(page);await page.goto(`/?tab=${id}`);
 const shell=page.locator(`[data-game-shell="${id}"]`);
 const ack=page.waitForResponse(r=>r.url().endsWith('/api/player/mutate')&&r.request().postDataJSON()?.action===`${id}.start`);
 await shell.getByRole('button',{name:'Start',exact:true}).click();await ack;
 await expect(shell).toHaveAttribute(`data-${prefix}-phase`,'playing');await shell.evaluate(node=>node.dataset.retentionProof='retained');
 for(let i=0;i<3;i++){
  await openHome(page);
  await expect(shell).toHaveAttribute(`data-${prefix}-phase`,'paused');
  await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',true);
  await page.getByTestId('home-catalogue').focus();await page.keyboard.press('ArrowLeft');
  await expect(shell).toHaveAttribute(`data-${prefix}-phase`,'paused');
  await page.getByRole('button',{name:'Back to game',exact:false}).click();
  // A mounted paused game alone does not mean the async history close has
  // finished. Verify the actual close before initiating the next opening.
  await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
  await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',false);
  await expect(shell).toHaveAttribute('data-retention-proof','retained');
  await expect(shell).toHaveAttribute(`data-${prefix}-phase`,'paused');
 }
 await shell.getByRole('button',{name:'Resume',exact:true}).click();await expect(shell).toHaveAttribute(`data-${prefix}-phase`,'playing');
});
test('Home refuses to abandon a restored Blox run while its lazy controller loads',async({page})=>{
 await mountHomePlayerFixture(page);await page.goto('/?tab=blox');
 const ack=page.waitForResponse(r=>r.url().endsWith('/api/player/mutate')&&r.request().postDataJSON()?.action==='blox.start');
 await page.locator('[data-game-shell="blox"]').getByRole('button',{name:'Start',exact:true}).click();await ack;
 let release,requested;const gate=new Promise(resolve=>release=resolve),loading=new Promise(resolve=>requested=resolve);let ends=0;
 page.on('request',request=>{if(request.url().endsWith('/api/player/mutate')&&request.postDataJSON()?.action==='blox.end')ends++;});
 await page.route(/\/(?:src\/games\/blox\/BloxGame\.jsx|assets\/BloxGame-[^/]+\.js)(?:\?.*)?$/,async route=>{requested();await gate;await route.continue();});
 await page.reload({waitUntil:'domcontentloaded'});await loading;await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','blox');
 await page.keyboard.press('Escape');await expect(page.getByTestId('home-catalogue')).toBeVisible();await expect(page.locator('[data-home-game="garden"]')).toBeDisabled();
 await expect(page.getByTestId('home-catalogue')).toBeVisible();await expect(page.locator('[data-game-shell="blox"]')).toHaveCount(0);expect(ends).toBe(0);
 release();await expect(page.locator('[data-game-shell="blox"]')).toHaveAttribute('data-bx-phase','paused');
 await selectHomeGame(page,'garden');expect(ends).toBe(1);
});
test('Town Home preserves its stage and refuses a failed local save barrier',async({page})=>{
 await page.goto('/?tab=settlement');const town=page.locator('.settlement-game-root');await expect(town).toBeVisible();
 await town.evaluate(node=>node.dataset.retentionProof='same-town');await openHome(page);await expect(page.getByTestId('home-catalogue')).toBeVisible();
 await page.getByRole('button',{name:'Close Home'}).click();await expect(town).toHaveAttribute('data-retention-proof','same-town');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('village-ascend-v11-state'))).toBeTruthy();
 const saved=await page.evaluate(()=>localStorage.getItem('village-ascend-v11-state'));expect(saved).toBeTruthy();
 await page.evaluate(()=>localStorage.setItem('village-ascend-v11-state',JSON.stringify({version:12,state:{}})));
 await openHome(page);await page.locator('[data-home-game="garden"]').click();await expect(page.getByTestId('home-catalogue').getByRole('alert')).toBeVisible();
 await expect(town).toHaveAttribute('data-retention-proof','same-town');await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','settlement');
 await page.evaluate(value=>localStorage.setItem('village-ascend-v11-state',value),saved);await selectHomeGame(page,'garden');
});
for(const id of ['match3','bubbo'])test(`${id} acknowledged saved run leaves safely after reload`,async({page})=>{
 await mountHomePlayerFixture(page);await page.goto(`/?tab=${id}`);
 const shell=page.locator(`[data-game-shell="${id}"]`);
 const ack=page.waitForResponse(r=>r.url().endsWith('/api/player/mutate')&&r.request().postDataJSON()?.action===`${id}.start`);
 await shell.getByRole('button',{name:'Start',exact:true}).click();await ack;await page.reload();
 await expect(shell).toBeVisible();let finishes=0;page.on('request',request=>{if(request.url().endsWith('/api/player/mutate')&&request.postDataJSON()?.action===`${id}.end`)finishes++;});
 await selectHomeGame(page,'garden');await expect(page.locator('.gs2-stage')).toBeVisible();expect(finishes).toBe(1);
});
for(const [id,prefix] of [['blox','bx'],['match3','m3'],['bubbo','bb']])test(`${id} late Start acknowledgment stays paused behind Home`,async({page})=>{
 await mountHomePlayerFixture(page);let release,started;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>started=resolve);
 await page.route('**/api/player/mutate',async route=>{if(route.request().postDataJSON()?.action===`${id}.start`){started();await gate;}await route.fallback();});
 await page.goto(`/?tab=${id}`);const shell=page.locator(`[data-game-shell="${id}"]`);
 await shell.getByRole('button',{name:'Start',exact:true}).click();await requested;await openHome(page);release();
 await expect(shell).toHaveAttribute(`data-${prefix}-phase`,'paused');await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',true);
 await page.getByRole('button',{name:'Close Home'}).click();await expect(shell).toHaveAttribute(`data-${prefix}-phase`,'paused');
});
test('Trivia late Start question freezes until Home is closed and Resume chosen',async({page})=>{
 let release,started;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>started=resolve);
 await page.route('**/api/trivia/start',async route=>{const response=await route.fetch();started();await gate;await route.fulfill({response});});
 await page.goto('/?tab=trivia');await page.getByTestId('trv2-start').click();await requested;await openHome(page);release();
 await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-paused','true');await expect(page.getByTestId('trv2-question')).toHaveCount(1);
 const frozen=await page.getByTestId('trv2-time').textContent();await page.waitForTimeout(1100);expect(await page.getByTestId('trv2-time').textContent()).toBe(frozen);
 await page.getByRole('button',{name:'Close Home'}).click();await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-paused','true');
 await page.getByTestId('trv2-resume').click();await expect(page.getByTestId('trv2-root')).toHaveAttribute('data-paused','false');
});
test('rapid game requests commit one target and restore it on reload',async({page})=>{
 await mountHomePlayerFixture(page);await page.goto('/');
 for(let i=0;i<2;i++)for(const id of ['blox','match3','bubbo','trivia','garden']){await selectHomeGame(page,id);await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab',id);}
 await selectHomeGame(page,'blox');await openHome(page);
 await page.locator('[data-home-game="match3"]').evaluate(node=>{node.click();document.querySelector('[data-home-game="bubbo"]').click();});
 await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','match3');await page.reload();await expect(page.locator('[data-game-shell="match3"]')).toBeVisible();
});
const HOME_VIEWPORTS=[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
for(const [width,height] of HOME_VIEWPORTS)test(`Town header Home ${width}x${height}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:width<1100,hasTouch:true});const page=await context.newPage();
 const language=width===390||width===568?'en':'ru';
 await page.addInitScript(language=>{localStorage.setItem('gh_dev_user_id',`town_home_${Date.now()}_${Math.random()}`);localStorage.setItem('garden_shelf_language',language);},language);
 await page.goto('/?tab=settlement');const town=page.locator('.settlement-game-root');await expect(town).toBeVisible();
 await page.addStyleTag({content:':root{--safe-top:28px!important;--safe-bottom:16px!important}'});
 const launcher=page.getByRole('button',{name:language==='ru'?'Все игры':'All games',exact:true});await expect(launcher).toBeVisible();await launcher.click({trial:true});
 const box=await launcher.boundingBox(),header=await page.locator('.top-hud-final').boundingBox();
 expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
 expect(box.y).toBeGreaterThanOrEqual(header.y);expect(box.y+box.height).toBeLessThanOrEqual(header.y+header.height+1);
 await expect(page.locator('.top-resources-core .resource-pill:visible')).toHaveCount(6);
 for(const pill of await page.locator('.top-resources-core .resource-pill:visible').all()){
  const r=await pill.boundingBox();expect(r.x).toBeGreaterThanOrEqual(box.x+box.width);expect(r.x+r.width).toBeLessThanOrEqual(header.x+header.width+1);
 }
 await mkdir('output/playwright/town',{recursive:true});await page.screenshot({path:`output/playwright/town/town-${width}x${height}.png`});
 await town.evaluate(n=>n.dataset.retentionProof='same-town-matrix');await launcher.click();await expect(page.getByTestId('home-catalogue')).toBeVisible();await expect(page.locator('.telegram-app')).toHaveJSProperty('inert',true);
 await page.getByRole('button',{name:language==='ru'?'Закрыть главную':'Close Home',exact:true}).click();await expect(town).toHaveAttribute('data-retention-proof','same-town-matrix');await context.close();
});
for(const [width,height] of HOME_VIEWPORTS)test(`Home viewport ${width}x${height}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:width<1100,hasTouch:true});const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id',`home_matrix_${Date.now()}_${Math.random()}`);localStorage.setItem('garden_shelf_language','ru');document.documentElement.style.setProperty('--safe-top','28px');document.documentElement.style.setProperty('--safe-bottom','16px');});
 const requests=[];page.on('request',request=>requests.push(request.url()));
 await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();await page.addStyleTag({content:':root{--safe-top:28px!important;--safe-bottom:16px!important}'});const garden=await page.locator('.gs2-stage').boundingBox();await openHome(page);
 await expect(page.locator('[data-home-game]')).toHaveCount(8);
 for(const button of await page.locator('.home-catalogue button:visible').all()){await button.scrollIntoViewIfNeeded();await button.click({trial:true});const r=await button.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);}
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.keyboard.press('Tab');expect(await page.getByTestId('home-catalogue').evaluate(node=>node.contains(document.activeElement))).toBe(true);
 await page.locator('.home-catalogue').evaluate(node=>node.scrollTop=0);await mkdir('output/playwright/final',{recursive:true});await page.screenshot({path:`output/playwright/final/home-${width}x${height}.png`});
 await page.getByRole('button',{name:'Закрыть главную'}).click();await expect(page.locator('.gs2-stage')).toBeVisible();await page.screenshot({path:`output/playwright/final/garden-${width}x${height}.png`});
 const thumbRequests=requests.filter(url=>url.includes('/home-thumbnails/'));
 await writeFile(`output/playwright/final/metrics-${width}x${height}.json`,JSON.stringify({garden,thumbnailRequests:thumbRequests.length,urls:thumbRequests},null,2));await context.close();
});
