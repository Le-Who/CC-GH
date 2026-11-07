import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {openHome} from '../e2e/helpers/home.js';
import {mountHomePlayerFixture} from '../e2e/helpers/homePlayerFixture.js';
const OUT='test-results/leaderboard-privacy';
const SECRET='SYNTHETIC_PRIVATE_HANDLE';
async function setup(page,language='ru') {
 await fs.mkdir(OUT,{recursive:true});
 await page.addInitScript(language=>{localStorage.setItem('gh_dev_user_id','privacy_browser_fixture');localStorage.setItem('garden_shelf_language',language);},language);
 await mountHomePlayerFixture(page);
 let nickname='';
 await page.route(url=>url.pathname==='/api/profile/nickname',async route=>{
  if(route.request().method()==='POST')nickname=route.request().postDataJSON().nickname;
  await route.fulfill({contentType:'application/json',body:JSON.stringify({nickname,displayName:nickname||'Анна'})});
 });
 await page.route(url=>['/api/leaderboard','/api/blox/leaderboard'].includes(url.pathname),route=>route.fulfill({contentType:'application/json',body:JSON.stringify([
  {rank:1,displayName:nickname||'Анна',publicNameVersion:1,isSelf:true,highScore:900,totalGames:3},
  {rank:2,username:SECRET,displayName:SECRET,telegramId:'123456789',highScore:800},
  {rank:3,displayName:'<img src=x onerror=alert(1)>',publicNameVersion:1,isSelf:false,highScore:700},
 ])}));
}
const matrix=[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
for(const [width,height] of matrix)test(`profile nickname ${width}x${height}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:width<1100,hasTouch:width<1100});
 const page=await context.newPage();await setup(page);
 await page.goto('/');await openHome(page);const summary=page.locator('.home-profile summary');await summary.scrollIntoViewIfNeeded();await summary.click();
 const input=page.getByRole('textbox',{name:'Никнейм в игре',exact:true});await expect(input).toBeEnabled();await input.fill('Лиса 🦊');
 const save=page.getByRole('button',{name:'Сохранить никнейм',exact:true});await save.scrollIntoViewIfNeeded();await save.click();await expect(page.getByText('Никнейм сохранён',{exact:true})).toBeVisible();await expect(summary).toContainText('Лиса 🦊');
 await input.scrollIntoViewIfNeeded();await expect(input).toHaveValue('Лиса 🦊');
 for(const control of [input,save,page.getByRole('button',{name:'Использовать имя',exact:true})]){
  await control.scrollIntoViewIfNeeded();const rect=await control.boundingBox();expect(rect.height).toBeGreaterThanOrEqual(44);expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width+1);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`${OUT}/profile-${width}x${height}.png`});
 await page.getByRole('button',{name:'Использовать имя',exact:true}).click();await expect(input).toHaveValue('');await expect(summary).toContainText('Анна');
 await input.fill('я'.repeat(33));await save.click();await expect(page.getByText('До 32 символов, без управляющих символов.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Закрыть главную',exact:true}).click();await expect(page.getByTestId('home-catalogue')).toHaveCount(0);
 await context.close();
});
for(const [game,css] of [['match3','.m3-leaders'],['blox','.bx-leaders']])test(`${game} public and historical names, safe HTML and self label`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.goto(`/?tab=${game}`);
 const leaders=page.locator(css);await expect(leaders).toBeVisible();await expect(leaders).toContainText('Анна (вы)');await expect(leaders).toContainText('Игрок');await expect(leaders).not.toContainText(SECRET);await expect(leaders.locator('img')).toHaveCount(0);await expect(leaders).toContainText('<img src=x onerror=alert(1)>');await expect(leaders.locator('[aria-current="true"]')).toHaveCount(1);
 await page.screenshot({path:`${OUT}/${game}-safe-names.png`});
 await openHome(page);const summary=page.locator('.home-profile summary');await summary.scrollIntoViewIfNeeded();await summary.click();const input=page.getByRole('textbox',{name:'Никнейм в игре',exact:true});await expect(input).toBeEnabled();await input.fill('Новый ник');await page.getByRole('button',{name:'Сохранить никнейм',exact:true}).click();await expect(page.getByText('Никнейм сохранён',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрыть главную',exact:true}).click();await expect(leaders).toContainText('Новый ник (вы)');
 await openHome(page);await summary.scrollIntoViewIfNeeded();await summary.click();await expect(input).toBeEnabled();await input.fill('Ш'.repeat(32));await page.getByRole('button',{name:'Сохранить никнейм',exact:true}).click();await expect(page.getByText('Никнейм сохранён',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Закрыть главную',exact:true}).click();await page.setViewportSize({width:320,height:568});await expect(leaders).toContainText('Ш'.repeat(32));expect(await leaders.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);for(const row of await leaders.locator('.m3-leader-row, .bx-leader-row').all()) {
  await row.scrollIntoViewIfNeeded();
  const box=await row.boundingBox();const viewport=page.viewportSize();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
  const within=await row.evaluate(node=>{const row=node.getBoundingClientRect(),scroll=node.closest('.m3-dialog-scroll,.bx-dialog-scroll').getBoundingClientRect();return row.top>=scroll.top-1 && row.bottom<=scroll.bottom+1;});expect(within).toBe(true);
 }
 await page.screenshot({path:`${OUT}/${game}-long-unicode-320.png`});
});
test('Trivia public history and lobby render safe names and reject old username/winner snapshots',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);
 const players=[{publicNameVersion:1,displayName:'Анна',isSelf:true,score:4,ready:false},{publicNameVersion:1,displayName:'Лиса',isSelf:false,score:9,ready:false}];
 await page.route(url=>url.pathname==='/api/trivia/duel/history',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({entries:[{roomId:'SAFE',publicNameVersion:1,players,winner:'Лиса',winnerIndex:1,isTie:false},{roomId:'OLD',players:[{username:SECRET,displayName:SECRET,score:7}],winner:SECRET}]})}));
 await page.route(url=>url.pathname==='/api/trivia/duel/create',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({roomId:'SAFE',inviteCode:'SAFE',success:true})}));
 await page.route(url=>url.pathname==='/api/trivia/duel/status/SAFE',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({publicNameVersion:1,roomId:'SAFE',status:'lobby',players,winner:null,isTie:false})}));
 await page.goto('/?tab=trivia');const history=page.getByTestId('trv2-history');await expect(history).toContainText('Лиса');await expect(history).toContainText('Игрок');await expect(history).not.toContainText(SECRET);
 for(const row of await history.locator('li').all()){await row.scrollIntoViewIfNeeded();const box=await row.boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(845);}
 await page.screenshot({path:`${OUT}/trivia-history.png`});
 await page.getByRole('button',{name:'Создать дуэль',exact:true}).click();
 const lobby=page.locator('.trv2-room');await expect(lobby).toContainText('Анна (Вы)');await expect(lobby).toContainText('Лиса');await expect(lobby).not.toContainText(SECRET);await page.screenshot({path:`${OUT}/trivia-lobby.png`});
});
