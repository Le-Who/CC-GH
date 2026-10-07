import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {openHome} from '../e2e/helpers/home.js';
import {mountHomePlayerFixture} from '../e2e/helpers/homePlayerFixture.js';
const OUT='test-results/home-theme';
test.beforeEach(async({page})=>{
 await fs.mkdir(OUT,{recursive:true});
 await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','home_theme_preview');localStorage.setItem('garden_shelf_language','en');if(!localStorage.getItem('game_hub_ui_theme'))localStorage.setItem('game_hub_ui_theme','light');});
 await mountHomePlayerFixture(page);
});
const sizes=[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
for (const [width,height] of sizes) test(`Home toggle and Garden persistence ${width}x${height}`,async({browser},info)=>{
 const mobile=width<1100, context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','home_theme_matrix');localStorage.setItem('garden_shelf_language','en');if(!localStorage.getItem('game_hub_ui_theme'))localStorage.setItem('game_hub_ui_theme','light');});
 await mountHomePlayerFixture(page);
 const surface=()=>page.locator('.home-catalogue').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
 const proof={width,height,errors};
 try {
 await page.goto(info.project.use.baseURL+'/');await expect(page.locator('.gs2-stage')).toBeVisible();
 await page.addStyleTag({content:':root{--safe-top:28px!important;--safe-bottom:16px!important}'});
 await openHome(page);await page.locator('.home-profile summary').click();
 proof.before=await surface();
 await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');
 proof.after=await surface();
 expect(proof.after.background).not.toBe(proof.before.background);expect(proof.after.color).not.toBe(proof.before.color);
 await page.locator('.home-catalogue').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:`${OUT}/${width}x${height}-home-dark.png`});
 for(const card of await page.locator('[data-home-game]').all()){
  await card.scrollIntoViewIfNeeded();
  expect(await card.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth+1;})).toBe(true);
 }
 await page.getByRole('button',{name:'Close Home',exact:true}).click();
 await page.locator('.gs2-settings').click();
 await expect(page.getByRole('button',{name:'Dark theme',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Light theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
 proof.gardenLight=await page.locator('.gs2-dialog').evaluate(el=>getComputedStyle(el).backgroundColor);
 await page.getByRole('button',{name:'Dark theme',exact:true}).click();
 proof.gardenDark=await page.locator('.gs2-dialog').evaluate(el=>getComputedStyle(el).backgroundColor);
 expect(proof.gardenDark).not.toBe(proof.gardenLight);
 await page.screenshot({path:`${OUT}/${width}x${height}-garden-settings-dark.png`});
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.reload();await expect(page.locator('.gs2-stage')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-ui-theme','dark');
 await openHome(page);await page.locator('.home-profile summary').click();await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
 await page.locator('.home-catalogue').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${OUT}/${width}x${height}-home-light.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
 } finally {await fs.writeFile(`${OUT}/${width}x${height}-theme-proof.json`,JSON.stringify(proof,null,2));await context.close();}
});
for(const id of ['blox','bubbo','trivia'])test(`capture actual ${id} gameplay`,async({page})=>{
 await page.setViewportSize({width:800,height:600});
 await page.goto(`/?tab=${id}`);
 if(id==='blox'){
  const shell=page.locator('[data-game-shell="blox"]');await expect(shell).toBeVisible();await shell.getByRole('button',{name:'Start',exact:true}).click();
  await expect(page.locator('.bx-keyboard-tray')).toBeVisible();
  const slot=page.locator('.bx-keyboard-slot').first();await slot.focus();await page.keyboard.press('Enter');await page.locator('.bx-keyboard-board').focus();await page.keyboard.press('Enter');
 }else if(id==='bubbo'){
  await page.getByTestId('bb-start').click();await expect(page.getByTestId('bb-fire')).toBeVisible();
 }else{
  await page.getByTestId('trv2-start').click();await expect(page.locator('.trv2-question')).toBeVisible();
 }
 await page.waitForTimeout(600);
 await page.screenshot({path:`${OUT}/${id}-actual-gameplay.png`});
 await fs.writeFile(`${OUT}/${id}-dom.txt`,await page.locator('body').innerText());
});

for(const reducedMotion of ['no-preference','reduce'])test(`static poster loading ${reducedMotion}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion});
 const requests=[];page.on('request',request=>requests.push(request.url()));
 await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();
 const beforeHome=requests.filter(url=>url.includes('/home-thumbnails/'));
 expect(beforeHome).toEqual([]);
 await openHome(page);
 const initial=await page.locator('.home-thumbnail img').evaluateAll(images=>images.map(img=>({src:img.currentSrc||img.src,complete:img.complete,loading:img.loading,decoding:img.decoding})));
 const decode=[];
 for(const card of await page.locator('[data-home-game]').all()){
  await card.scrollIntoViewIfNeeded();
  decode.push(await card.locator('img').evaluate(async img=>{const started=performance.now();await img.decode();return {src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,decodeReadyMs:performance.now()-started,loading:img.loading,decoding:img.decoding};}));
 }
 expect(decode).toHaveLength(7);expect(decode.every(x=>x.width>0&&x.loading==='lazy'&&x.decoding==='async')).toBe(true);
 expect(await page.locator('.home-catalogue video,.home-catalogue audio').count()).toBe(0);
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/home-thumbnails/')).map(x=>({url:x.name,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,duration:x.duration})));
 const gameCode=requests.filter(url=>/\/(?:BloxGame|BubboGame|TriviaGame)-/.test(url));expect(gameCode).toEqual([]);
 await fs.writeFile(`${OUT}/poster-loading-${reducedMotion}.json`,JSON.stringify({scope:'Cold Home opening, static lazy WebP images. decodeReadyMs is readiness wait after scrolling, not an isolated codec benchmark.',reducedMotion,beforeHome,initial,decode,resources,gameCode,estimatedRgbaSurfaceBytes:decode.reduce((n,x)=>n+x.width*x.height*4,0)},null,2));
 await page.locator('[data-home-game="bubbo"]').scrollIntoViewIfNeeded();await page.screenshot({path:`${OUT}/home-real-posters-${reducedMotion}.png`});
});
for(const [width,height] of [[320,568],[844,390]])test(`Russian labels and theme ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.addInitScript(()=>localStorage.setItem('garden_shelf_language','ru'));
 await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();await openHome(page);
 await expect(page.locator('[data-home-game="blox"] strong')).toHaveText('Blox · Блоки');
 await expect(page.locator('[data-home-game="blox"]')).toContainText('Размещайте фигуры');
 await page.screenshot({path:`${OUT}/${width}x${height}-home-ru.png`});
 await page.locator('.home-profile summary').click();await page.getByRole('button',{name:'Переключить на темную тему',exact:true}).click();
 await page.getByRole('button',{name:'Закрыть главную',exact:true}).click();await page.locator('.gs2-settings').click();
 await expect(page.getByRole('button',{name:'Тёмная тема',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Светлая тема',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-ui-theme','light');
 await page.screenshot({path:`${OUT}/${width}x${height}-garden-settings-ru.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('record one genuine Bubbo shot for optional preview',async({browser},info)=>{
 const context=await browser.newContext({viewport:{width:800,height:600},serviceWorkers:'block',recordVideo:{dir:`${OUT}/raw-loop`,size:{width:800,height:600}}});
 const page=await context.newPage();await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','home_bubbo_loop');localStorage.setItem('garden_shelf_language','en');});await mountHomePlayerFixture(page);
 try{
  await page.goto(info.project.use.baseURL+'/?tab=bubbo');await page.getByTestId('bb-start').click();await expect(page.getByTestId('bb-fire')).toBeVisible();
  await page.waitForTimeout(600);await page.getByTestId('bb-fire').click();await page.waitForTimeout(2400);
  await page.screenshot({path:`${OUT}/bubbo-loop-end.png`});
 }finally{const video=page.video();await context.close();await video.saveAs(`${OUT}/bubbo-native-shot.webm`);}
});
test('one explicit Bubbo preview loads only on request and pauses safely',async({page})=>{
 await page.setViewportSize({width:390,height:500});const mediaRequests=[];page.on('request',request=>{if(request.url().endsWith('.mp4'))mediaRequests.push(request.url());});
 await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();await openHome(page);
 expect(mediaRequests).toEqual([]);await expect(page.locator('.home-preview-video')).toHaveCount(0);
 const control=page.getByRole('button',{name:'Preview Bubbo gameplay',exact:true});await control.scrollIntoViewIfNeeded();
 const start=Date.now();await control.click();const video=page.locator('.home-preview-video');await expect(video).toHaveCount(1);
 await expect.poll(()=>video.evaluate(v=>v.readyState>=2&&!v.paused)).toBe(true);const readinessMs=Date.now()-start;
 const before=await video.evaluate(v=>({time:v.currentTime,quality:(()=>{const q=v.getVideoPlaybackQuality();return {totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames};})(),muted:v.muted,inline:v.playsInline,codec:v.canPlayType('video/mp4; codecs="avc1.42E01E"')}));
 await page.waitForTimeout(1300);
 const after=await video.evaluate(v=>({time:v.currentTime,quality:(()=>{const q=v.getVideoPlaybackQuality();return {totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames};})(),width:v.videoWidth,height:v.videoHeight,duration:v.duration}));
 expect(before.muted).toBe(true);expect(before.inline).toBe(true);expect(before.codec).not.toBe('');expect(after.quality.totalVideoFrames).toBeGreaterThan(before.quality.totalVideoFrames);
 await page.screenshot({path:`${OUT}/home-bubbo-preview-playing.png`});
 await page.locator('.home-catalogue').evaluate(el=>el.scrollTop=0);await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(true);
 const pausedTime=await video.evaluate(v=>v.currentTime);await page.waitForTimeout(500);expect(await video.evaluate(v=>v.currentTime)).toBe(pausedTime);
 await page.locator('[data-home-game="bubbo"]').scrollIntoViewIfNeeded();await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(false);
 // Deterministic visibility event exercises the exact browser event handler;
 // this is explicitly a lifecycle simulation, not a physical-device test.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(true);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>video.evaluate(v=>v.paused)).toBe(false);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(video).toHaveCount(0);await expect(page.locator('.home-preview-control')).toHaveCount(0);
 const requestsBeforeReload=mediaRequests.length;await page.reload();await expect(page.locator('.gs2-stage')).toBeVisible();await openHome(page);await page.locator('[data-home-game="bubbo"]').scrollIntoViewIfNeeded();expect(mediaRequests.length).toBe(requestsBeforeReload);
 await fs.writeFile(`${OUT}/one-loop-proof.json`,JSON.stringify({readinessMs,before,after,mediaRequests,offscreenPause:true,backgroundPause:'document.hidden + visibilitychange lifecycle simulation',reducedMotionNoAdditionalRequest:true},null,2));
});
