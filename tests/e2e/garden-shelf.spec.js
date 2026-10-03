import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { measurePlantTranslation } from "./helpers/plantPixelMotion.js";
import { fitArtwork } from "../../src/games/garden-shelf/living/plant-presentation-contract.mjs";
import { gardenDiagnostics } from "./helpers/gardenDiagnostics.js";
import { exitBlox } from "./helpers/blox-v2.js";
import { GARDEN_ECONOMY_VERSION, createGardenEconomyState, createDefaultPlayer, getGardenLevelReward, getGardenXpRequired, buildGardenDailyQuests } from "../../game-logic.js";
import { formatGardenGoldAmount, PLANT_TYPES } from "../../game-logic/garden-shelf-plants.js";
import { applyActionWithReceipt, buildSnapshot } from "../../routes/player.js";
import { useLegacyGardenClient } from './helpers/legacyGardenClient.js';

// These tests mount the production App through the normal Playwright web server.
// Fixture-backed layout cases call production actions/receipts; live save cases
// below do not intercept either player endpoint. The discovery-only compatibility
// bridge models a cached legacy client; all economic responses stay authoritative.
// Enabled-default R2 motion/loading/layout coverage lives in garden-r2.spec.js.
const MATRIX = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
const uid = () => `garden_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const plant = (id, index=0, extra={}) => ({id,type:index % 2 ? 'basil':'daisy',level:12,shelfIndex:Math.floor(index/2),spotIndex:index%2,phase:3,phaseProgress:0,lastTapped:0,lastWatered:0,...extra});
const panel = (page,kind) => page.locator(`.gs2-dialog[data-garden-panel="${kind}"]`);
const state = page => page.evaluate(() => {
  const cache = Object.keys(localStorage).find(key => key.startsWith('game_hub_garden_state_v1:'));
  return cache ? JSON.parse(localStorage.getItem(cache)).state : null;
});
function parse(request) { try { return request.postDataJSON() || {}; } catch { return {}; } }
async function initialize(page, userId=uid(), language='en') {
  await useLegacyGardenClient(page);
  await page.addInitScript(({userId,language}) => {
    localStorage.setItem('gh_dev_user_id',userId);
    if (!sessionStorage.getItem('garden-release-initialized')) {
      localStorage.removeItem('terrarium_save');localStorage.removeItem('garden_shelf_name');
      localStorage.setItem('garden_shelf_language',language);
      sessionStorage.setItem('garden-release-initialized','true');
    }
  }, {userId,language});
  return userId;
}
async function boot(page) {
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});
  await expect(page.locator('.gs2-stage')).toBeVisible();
  await expect(page.locator('.telegram-app')).toHaveAttribute('data-garden-presentation','living');
}
function makePlayer(overrides={}) {
  const now=Date.now(),p=createDefaultPlayer(uid(),'Garden release',now);
  p.resources.gold=100000;
  p.garden={...createGardenEconomyState(now),level:31,xp:getGardenXpRequired(31),xpRequired:getGardenXpRequired(31),levelReady:true,shelvesUnlocked:4,plants:Array.from({length:8},(_,i)=>plant(`plant-${i}`,i)),...overrides};
  return p;
}
async function mountFixture(page, player, {delayAction=()=>false,failAction=()=>false}={}) {
  const requests=[];
  await page.route('**/api/player/snapshot',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(buildSnapshot(player))}));
  await page.route('**/api/player/mutate',async route=>{
    const body=parse(route.request());requests.push(body);
    if(delayAction(body))await new Promise(resolve=>setTimeout(resolve,250));
    if(failAction(body)){await route.abort('failed');return;}
    const result=await applyActionWithReceipt(player,body.action,body.payload||{},{clientActionId:body.clientActionId});
    await route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});
  });
  return requests;
}
async function closePanel(page) {
  await page.locator('.gs2-dialog .gs2-close').click();
  await expect(page.locator('.gs2-dialog')).toHaveCount(0);
  await expect.poll(()=>page.locator('.telegram-app').evaluate(node=>!!node.closest('[inert]'))).toBe(false);
}
async function assertShellFit(page) {
  // The keyed frame slides in on every tab return. Measure its settled bounds,
  // including reduced-motion mode, without changing the geometry tolerance.
  await page.locator('.active-game-frame').evaluate(async node => {
    await Promise.all(node.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity
    ).map(animation => animation.finished.catch(() => {})));
  });
  const result=await page.evaluate(()=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const stage=rect(document.querySelector('.gs2-stage')),dock=rect(document.querySelector('.bottom-tabs'));
    const targets=[...document.querySelectorAll('.bottom-tabs button')].map(node=>({label:node.textContent,box:rect(node),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth}));
    return {stage,dock,targets,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth};
  });
  expect(result.scrollWidth).toBeLessThanOrEqual(result.width+1);
  for(const r of [result.stage,result.dock]){expect(r.left).toBeGreaterThanOrEqual(-1);expect(r.right).toBeLessThanOrEqual(result.width+1);expect(r.top).toBeGreaterThanOrEqual(-1);expect(r.bottom).toBeLessThanOrEqual(result.height+1);}
  expect(result.stage.bottom).toBeLessThanOrEqual(result.dock.top+1);
  expect(result.stage.height).toBeGreaterThan(44);expect(result.targets).toHaveLength(8);
  for(const target of result.targets){expect(target.box.width,target.label).toBeGreaterThanOrEqual(44);expect(target.box.height,target.label).toBeGreaterThanOrEqual(44);expect(target.scrollWidth,target.label).toBeLessThanOrEqual(target.clientWidth+1);}
  await expect(page.locator('.stats-row')).not.toBeVisible();
}
async function assertDialogFit(page,dialog) {
  await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('aria-modal','true');
  await expect.poll(()=>dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  const result=await dialog.evaluate(node=>{
    const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const view=visualViewport||{offsetTop:0,offsetLeft:0,width:innerWidth,height:innerHeight};
    const scroll=node.querySelector('.gs2-dialog-scroll'),close=node.querySelector('.gs2-close');
    const before=rect(close);scroll.scrollTop=scroll.scrollHeight;const after=rect(close);scroll.scrollTop=0;
    const small=[...node.querySelectorAll('button')].filter(n=>n.getClientRects().length).filter(n=>n.getBoundingClientRect().width<43.9||n.getBoundingClientRect().height<43.9).map(n=>n.getAttribute('aria-label')||n.textContent);
    return {box:rect(node),before,after,view:{left:view.offsetLeft,top:view.offsetTop,width:view.width,height:view.height},small,scrollable:['auto','scroll'].includes(getComputedStyle(scroll).overflowY),hubInert:!!document.querySelector('.telegram-app').closest('[inert]'),focusInside:node.contains(document.activeElement),filter:getComputedStyle(node).backdropFilter};
  });
  expect(result.small).toEqual([]);expect(result.scrollable).toBe(true);expect(result.hubInert).toBe(true);expect(result.focusInside).toBe(true);expect(result.filter).toBe('none');
  for(const r of [result.box,result.before,result.after]){expect(r.left).toBeGreaterThanOrEqual(result.view.left-1);expect(r.right).toBeLessThanOrEqual(result.view.left+result.view.width+1);expect(r.top).toBeGreaterThanOrEqual(result.view.top-1);expect(r.bottom).toBeLessThanOrEqual(result.view.top+result.view.height+1);}
  expect(result.before).toEqual(result.after);
  await page.keyboard.press('Shift+Tab');await expect.poll(()=>dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');await expect.poll(()=>dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
}
async function assertFlowRows(page, rowSelector) {
  const errors=await page.locator(rowSelector).evaluateAll(rows=>{
    const errors=[];
    for(const row of rows){const r=row.getBoundingClientRect();
      for(const child of row.children){const c=child.getBoundingClientRect();if(c.width&&c.height&&(c.left<r.left-1||c.right>r.right+1||c.top<r.top-1||c.bottom>r.bottom+1))errors.push(`${row.className}:child escapes row`);}
      const children=[...row.children].filter(c=>c.getClientRects().length);
      for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){const a=children[i].getBoundingClientRect(),b=children[j].getBoundingClientRect();if(Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))>4)errors.push(`${row.className}:siblings overlap`);}
    }return errors;
  });
  expect(errors).toEqual([]);
}
async function tapOrClick(locator,touch) { if(touch)await locator.tap();else await locator.click(); }
async function shot(page,testInfo,name){await testInfo.attach(name,{body:await page.screenshot({fullPage:false}),contentType:'image/png'});}
async function dragTouch(page,from,to){
  const client=await page.context().newCDPSession(page);
  try{await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
    for(let i=1;i<=10;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:Math.round(from.x+(to.x-from.x)*i/10),y:Math.round(from.y+(to.y-from.y)*i/10),id:1}]});await page.waitForTimeout(16);}
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await client.detach();}
}

test.describe('Garden Living production-source flow',()=>{
  for(const [width,height] of MATRIX)test.describe(`viewport ${width}x${height}`,()=>{
   const touch=width<1100;
   test.use({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:touch,hasTouch:touch});
   // The built-in page/context fixture owns teardown after the test body, so
   // context.close cannot overwrite a failed assertion in a finally block.
   test(`full Hub ${width}x${height}: art, dock, dialogs, post-30 level and exits`,async({page},testInfo)=>{
    const diagnostics=gardenDiagnostics(page,testInfo),errors=diagnostics.errors;
    const player=makePlayer();player.garden.plants[0].level=42;const originalPlant=structuredClone(player.garden.plants[0]);
    try{
      diagnostics.mark('boot');await initialize(page);await mountFixture(page,player);await boot(page);await assertShellFit(page);
      await expect(page.locator('.gs2-live-plant').first()).toBeVisible();
      await expect.poll(()=>page.locator('.gs2-live-plant img').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
      await shot(page,testInfo,'shelf');diagnostics.mark('shelf-verified');
      const xp=page.locator('.gs2-stage [data-garden-xp]');await xp.scrollIntoViewIfNeeded();
      await expect(xp).toBeEnabled();await expect(xp).toHaveAttribute('aria-label',new RegExp('Level Up'));
      const reward=getGardenLevelReward(31);await tapOrClick(xp,touch);
      await expect(panel(page,'reward')).toContainText(formatGardenGoldAmount(reward));await assertDialogFit(page,panel(page,'reward'));await closePanel(page);
      expect(player.garden.level).toBe(32);expect(player.garden.plants[0].level).toBe(42);await expect(xp).toContainText('32');diagnostics.mark('level-reward-verified');
      const trigger=page.locator('[data-plant-details-button]').first();await trigger.scrollIntoViewIfNeeded();await tapOrClick(trigger,touch);
      await assertDialogFit(page,panel(page,'plant-detail'));await expect(page.getByTestId('garden-care-level')).toContainText('42');await shot(page,testInfo,'care');
      await closePanel(page);await expect(trigger).toBeFocused();diagnostics.mark('care-close-focus-verified');
      await tapOrClick(trigger,touch);await page.keyboard.press('Escape');await expect(page.locator('.gs2-dialog')).toHaveCount(0);await expect(trigger).toBeFocused();diagnostics.mark('care-escape-focus-verified');
      await page.locator('.gs2-stage button[aria-label="Garden quests"]').click();await assertDialogFit(page,panel(page,'quests'));await assertFlowRows(page,'.gs2-quest-card');await shot(page,testInfo,'quests');await closePanel(page);diagnostics.mark('quests-verified');
      await page.locator('.gs2-empty-target').first().click();await assertDialogFit(page,panel(page,'seed-shop-inventory'));await expect(page.locator('.gs2-catalog-row')).toHaveCount(14);await assertFlowRows(page,'.gs2-catalog-row');await shot(page,testInfo,'shop');await closePanel(page);diagnostics.mark('shop-verified');
      // The host and its state remain intact after dismissals and tab changes.
      diagnostics.mark('exit-to-blox');await page.locator('[data-hud-region="bottomDock.blox"]').click();
      await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','blox');
      await expect(page.locator('[data-game-shell="blox"] .bx-dialog')).toBeVisible();
      await expect(page.locator('.bottom-tabs')).toBeHidden();
      await expect(page.locator('.gs2-stage')).toHaveCount(0);
      await expect(page.locator('.telegram-app')).not.toHaveAttribute('data-garden-presentation','living');
      // Blox owns an immersive shell; its visible Exit action returns to Garden.
      // Clicking the global dock here races entry and eventually targets hidden UI.
      diagnostics.mark('return-to-garden');await exitBlox(page);
      await expect(page.locator('.telegram-app')).toHaveAttribute('data-active-tab','garden');
      await expect(page.locator('.telegram-app')).toHaveAttribute('data-garden-presentation','living');
      await expect(page.locator('.gs2-stage')).toBeVisible();await assertShellFit(page);
      await expect(page.locator('.gs2-stage [data-garden-xp]')).toContainText('32');
      expect(player.garden.plants.find(p=>p.id===originalPlant.id)?.level).toBe(42);expect(errors).toEqual([]);diagnostics.complete();
    }catch(error){diagnostics.fail(error);throw error;}finally{diagnostics.dispose();}
   });
  });

  test('touch scrolling from plant cancels the tap and never opens Care',async({browser})=>{
    const context=await browser.newContext({baseURL:test.info().project.use.baseURL,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const page=await context.newPage();
    try{await initialize(page);const player=makePlayer({levelReady:false,xp:0});await mountFixture(page,player);await boot(page);
      const scroller=page.locator('.gs2-shelf-viewport');await expect.poll(()=>scroller.evaluate(n=>n.scrollHeight-n.clientHeight)).toBeGreaterThan(100);
      const before=(await state(page)).plants[0].lastTapped;const box=await page.locator('.gs2-plant-target').first().boundingBox();expect(box).not.toBeNull();
      await dragTouch(page,{x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height*.8)},{x:Math.round(box.x+box.width/2),y:Math.round(box.y-70)});
      await expect.poll(()=>scroller.evaluate(n=>n.scrollTop)).toBeGreaterThan(40);await expect(page.locator('.gs2-dialog')).toHaveCount(0);expect((await state(page)).plants[0].lastTapped).toBe(before);
    }finally{await context.close();}
  });

  test('new runtime art loads without legacy base PNG requests',async({page})=>{
    await initialize(page);const requests=[];page.on('request',r=>{if(/\/games\/garden-shelf\/assets_[^/?]+\.png(?:\?|$)/.test(r.url()))requests.push(r.url());});
    await boot(page);await expect(page.locator('.gs2-backdrop img')).toHaveAttribute('src','/games/garden-v2/background.webp');
    await expect.poll(()=>page.locator('.gs2-shelf-art').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(page.locator('.gs2-name-art')).toHaveCSS('border-image-source',/garden-v2\/sign\.webp/);expect(requests).toEqual([]);
  });

  test('live purchase, shared gold, locked shop items, growth Care and localization',async({page})=>{
    await initialize(page);await boot(page);await expect(page.locator('.gs2-name')).toContainText('My Garden');await expect(page.locator('.gs2-stage [data-garden-gold]')).toContainText('10,000');
    await page.locator('.gs2-empty-target').first().click();const shop=panel(page,'seed-shop-inventory');
    const lavender=shop.locator('.gs2-catalog-row').filter({has:page.getByRole('heading',{name:'Lavender',exact:true})});await expect(lavender).toContainText('Unlocks at Lv 4');await expect(lavender.locator('button')).toBeDisabled();
    const sync=page.waitForResponse(r=>r.url().includes('/api/player/mutate')&&parse(r.request()).action==='garden.sync'&&parse(r.request()).payload?.state?.plants?.length>0);
    await shop.locator('.gs2-catalog-row').filter({has:page.getByRole('heading',{name:'Daisy',exact:true})}).locator('button').click();await sync;
    await expect(panel(page,'plant-detail')).toContainText('Growing');await expect(page.locator('.gs2-stage [data-garden-gold]')).toContainText('7,500');await closePanel(page);
    await expect(page.locator('.gs2-water-ready').first()).toBeVisible();expect((await state(page)).plants).toHaveLength(1);
    await page.getByRole('button',{name:'Garden settings',exact:true}).click();await page.getByRole('button',{name:'Russian',exact:true}).click();
    await expect(panel(page,'settings')).toContainText('Настройки');await panel(page,'settings').getByRole('button',{name:'Готово',exact:true}).click();
    await expect(page.locator('.gs2-name')).toContainText('Мой сад');await expect(page.locator('[data-hud-region="bottomDock.blox"]')).toContainText('Блоки');await expect(page.locator('[data-hud-region="bottomDock.match3"]')).toContainText('Камни');
  });

  test('mature Care retains action feedback, water state, scrim exit and static inventory art',async({page},testInfo)=>{
    await initialize(page);await mountFixture(page,makePlayer({levelReady:false,xp:0}));await boot(page);
    await page.locator('.gs2-plant-target').first().click();await expect(page.locator('.gs2-status')).toContainText('Tap to collect gold');
    await page.locator('[data-plant-details-button]').first().click();let care=panel(page,'plant-detail');await assertDialogFit(page,care);
    const id=(await state(page)).plants[0].id;await care.getByRole('button',{name:'Care water',exact:false}).click();await expect.poll(async()=>(await state(page)).plants.find(p=>p.id===id).lastWatered).toBeGreaterThan(0);
    await expect(care.getByRole('button',{name:/Care water/})).toBeDisabled();
    await care.getByRole('button',{name:'Stash',exact:true}).click();await expect(page.locator('.gs2-dialog')).toHaveCount(0);
    await page.locator('.gs2-empty-target').first().click();await page.getByRole('tab',{name:/Inventory/}).click();
    const thumb=page.locator('.gs2-catalog .gs2-live-plant');await expect(thumb).toHaveCount(1);await expect(thumb).toHaveAttribute('data-living-mode','static-catalog');
    await expect.poll(()=>thumb.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0&&getComputedStyle(img).visibility==='visible')).toBe(true);await shot(page,testInfo,'inventory-static');
    await panel(page,'seed-shop-inventory').getByRole('button',{name:'Place',exact:true}).click();await expect(page.locator('.gs2-dialog')).toHaveCount(0);await expect(page.locator(`[data-plant-id="${id}"]`)).toBeVisible();
    await page.locator(`[data-plant-id="${id}"] [data-plant-details-button]`).click();await page.mouse.click(2,2);await expect(page.locator('.gs2-dialog')).toHaveCount(0);
  });

  test('daily priority, readable quest text and immediate repeated-claim suppression',async({page})=>{
    await initialize(page,uid(),'ru');const player=makePlayer({level:2,xp:0,xpRequired:getGardenXpRequired(2),levelReady:false,shelvesUnlocked:1,plants:[plant('daily-daisy',0,{level:2})],claimedQuests:['first_plant']});
    player.garden.dailyQuests={date:new Date().toISOString().slice(0,10),claimed:[],stats:{taps:12,waters:12,plantsBought:4,upgrades:3,goldEarned:80,xpEarned:80,levelUps:2}};
    const ready=buildGardenDailyQuests(player.garden).filter(q=>q.unlocked&&q.complete);expect(ready.length).toBeGreaterThan(1);player.garden.dailyQuests.claimed=[ready[0].id];const claim=ready[1],reason=`quest:${claim.id}`;
    const requests=await mountFixture(page,player,{delayAction:body=>body.action==='garden.claimQuest'&&body.payload?.questId===claim.id});await boot(page);await page.getByRole('button',{name:'Квесты сада',exact:true}).click();
    const cards=page.locator('.gs2-quest-card');const order=await cards.evaluateAll(cards=>cards.map(c=>({kind:c.dataset.questKind,claimed:c.dataset.questClaimed==='true',locked:c.dataset.questLocked==='true'})));
    const index=fn=>order.findIndex(fn);expect(index(q=>q.kind==='daily'&&!q.claimed&&!q.locked)).toBeGreaterThanOrEqual(0);expect(index(q=>q.kind==='story'&&!q.claimed)).toBeGreaterThan(index(q=>q.kind==='daily'&&!q.claimed&&!q.locked));expect(index(q=>q.kind==='daily'&&q.claimed)).toBeGreaterThan(index(q=>q.kind==='story'&&!q.claimed));expect(index(q=>q.kind==='story'&&q.claimed)).toBeGreaterThan(index(q=>q.kind==='daily'&&q.claimed));
    const contrast=await cards.first().evaluate(card=>{const rgb=v=>v.match(/[\d.]+/g).slice(0,3).map(Number),l=v=>rgb(v).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0),a=l(getComputedStyle(card.querySelector('h3')).color),b=l(getComputedStyle(card).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);
    const button=page.locator(`.gs2-quest-card[data-quest-id="${claim.id}"] button`);await button.dblclick();await expect(button).toHaveText('Получено');
    await page.waitForTimeout(2200);expect(requests.filter(r=>r.action==='garden.claimQuest'&&r.payload?.questId===claim.id)).toHaveLength(1);
    // The direct quest credit must not be duplicated through passive-earnings sync.
    expect(player.garden.dailyQuests.claimed.filter(id=>id===claim.id)).toHaveLength(1);
    expect(player.gardenAccounting.creditedTotal).toBeGreaterThanOrEqual(claim.reward);
    expect(requests.filter(r=>r.action==='garden.goldDelta'&&r.payload?.reason===reason)).toHaveLength(0);
  });

  test('living surfaces draw, retain bounded resources, and dispose repeated Care views',async({page})=>{
    await initialize(page);await mountFixture(page,makePlayer({levelReady:false,xp:0}));await boot(page);
    const diagnostics=()=>page.evaluate(()=>window.__GARDEN_LIVING_QA__?.snapshot());
    await expect.poll(async()=>((await diagnostics())?.surfaces||[]).some(surface=>surface.rootKind==='shelf'&&surface.frames>0&&surface.textures>0)).toBe(true);
    const initial=await diagnostics(),shelfId=initial.surfaces.find(surface=>surface.rootKind==='shelf').id;
    for(let i=0;i<3;i++){
      await page.locator('[data-plant-details-button]').first().click();await expect.poll(async()=>((await diagnostics())?.surfaces||[]).some(surface=>surface.rootKind==='care'&&surface.frames>0)).toBe(true);
      await closePanel(page);await expect.poll(async()=>(await diagnostics()).surfaces.length).toBe(1);
      const current=await diagnostics();expect(current.surfaces[0].id).toBe(shelfId);expect(current.surfaces[0].textures).toBeLessThanOrEqual(16);expect(current.surfaces[0].failed).toEqual([]);
    }
    await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(async()=>(await diagnostics()).surfaces.every(surface=>surface.reducedMotion)).toBe(true);
    await page.locator('[data-hud-region="bottomDock.blox"]').click();await expect.poll(async()=>(await diagnostics()).surfaces.length).toBe(0);
  });

  test('interrupted request releases busy state and lets the player dismiss and retry',async({page})=>{
    await initialize(page);const player=makePlayer({levelReady:false,xp:0});let fail=true;
    await mountFixture(page,player,{failAction:body=>body.action==='garden.upgradePlant'&&fail});await boot(page);
    await page.locator('[data-plant-details-button]').first().click();const care=panel(page,'plant-detail'),upgrade=care.getByRole('button',{name:/Increase income/});
    const before=(await state(page)).plants[0].level;await upgrade.click();await expect(care.locator('[role="alert"]')).toBeVisible();await expect(upgrade).toBeDisabled();expect((await state(page)).plants[0].level).toBe(before);
    await closePanel(page);fail=false;await expect.poll(async()=>(await state(page)).plants[0].level).toBe(before+1);
  });
});

// Live server/save cases intentionally do not route or fake player endpoints.
test.describe('Garden live server persistence',()=>{
  test('purchase survives another device with the same identity and no local save',async({browser})=>{
    const userId=uid();let first,second;
    try{
      first=await browser.newContext({baseURL:test.info().project.use.baseURL});const a=await first.newPage();await initialize(a,userId);await boot(a);await a.locator('.gs2-empty-target').first().click();
      const sync=a.waitForResponse(r=>r.url().includes('/api/player/mutate')&&parse(r.request()).action==='garden.sync'&&parse(r.request()).payload?.state?.plants?.length>0);
      await panel(a,'seed-shop-inventory').locator('.gs2-catalog-row').filter({has:a.getByRole('heading',{name:'Daisy',exact:true})}).locator('button').click();await sync;const purchased=(await state(a)).plants[0];await first.close();first=null;
      second=await browser.newContext({baseURL:test.info().project.use.baseURL});const b=await second.newPage();await initialize(b,userId);await boot(b);await expect(b.locator(`[data-plant-id="${purchased.id}"]`)).toBeVisible();
      await expect(b.locator('.gs2-stage [data-garden-gold]')).toContainText('7,500');expect((await state(b)).plants[0].type).toBe(purchased.type);expect((await state(b)).level).toBe(1);
    }finally{await first?.close();await second?.close();}
  });

  async function seedLive(page,garden) {
    const result=await page.evaluate(async state=>{
      const id=localStorage.getItem('gh_dev_user_id');const response=await fetch('/api/player/mutate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`dev ${id}`},body:JSON.stringify({action:'garden.sync',payload:{state}})});
      const body=await response.json();if(!response.ok)throw Error(JSON.stringify(body));localStorage.removeItem('terrarium_save');return body;
    },garden);expect(result.snapshot?.garden||result.garden).toBeTruthy();await page.reload();await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});await expect(page.locator('.gs2-stage')).toBeVisible();
  }
  test('collected offline fields in shared state are never replayed',async({page})=>{
    await initialize(page);await boot(page);await seedLive(page,{...createGardenEconomyState(Date.now()),level:2,xp:80,xpRequired:getGardenXpRequired(2),offlineEarnings:50,offlineXp:10});
    await expect(panel(page,'offline-reward')).toHaveCount(0);await expect(page.locator('.gs2-stage [data-garden-xp]')).toBeVisible();
  });
  test('generated offline reward persists until collection and stays collected after reload',async({page})=>{
    await initialize(page);await boot(page);await seedLive(page,{...createGardenEconomyState(Date.now()-31*60000),level:13,xp:100,xpRequired:getGardenXpRequired(13),plants:[plant('offline-daisy',0,{level:13})]});
    await expect(panel(page,'offline-reward')).toBeVisible({timeout:8000});await page.waitForTimeout(4200);await expect(panel(page,'offline-reward')).toBeVisible();
    await panel(page,'offline-reward').getByRole('button',{name:'Collect Gold',exact:true}).click();await expect(panel(page,'offline-reward')).toHaveCount(0);await page.reload();await expect(page.locator('.status-dot.ready')).toBeVisible();await expect(panel(page,'offline-reward')).toHaveCount(0);
  });
  test('short background pause produces no offline reward dialog',async({page})=>{
    await initialize(page);await boot(page);await seedLive(page,{...createGardenEconomyState(Date.now()-2*60000),level:13,xp:100,xpRequired:getGardenXpRequired(13),plants:[plant('short-pause-daisy',0,{level:13})]});await expect(panel(page,'offline-reward')).toHaveCount(0);
  });
  // Verifies the receipt API with an explicit test-supplied ID. This does not
  // prove GardenShelfGame currently supplies IDs or makes purchase/sync atomic.
  test('live server receipt API deduplicates an explicitly identified gold action',async({page})=>{
    await initialize(page);await boot(page);
    const result=await page.evaluate(async()=>{
      const auth=`dev ${localStorage.getItem('gh_dev_user_id')}`,headers={'Content-Type':'application/json',Authorization:auth};
      const before=await (await fetch('/api/player/snapshot',{headers})).json();const body={action:'garden.goldDelta',payload:{amount:7,reason:'release-receipt-check'},clientActionId:`garden-release:${crypto.randomUUID()}`};
      const send=async()=>{const r=await fetch('/api/player/mutate',{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
      return {before,first:await send(),second:await send()};
    });
    expect(result.first.status).toBe(200);expect(result.second.status).toBe(200);expect(result.second.body.duplicate).toBe(true);expect(result.second.body.snapshot.resources.gold).toBe(result.before.resources.gold+7);expect(result.first.body.snapshot.resources.gold).toBe(result.second.body.snapshot.resources.gold);
  });
});


// These compare composited browser pixels, including the real WebGL surface.
// No frame/mode flag is accepted as evidence that the plant is visibly moving.
test.describe('Garden quiet feedback and visible motion',()=>{
  test.use({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  async function seedMotion(page,{fallback=false,reduced=false}={}) {
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    if(fallback)await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...options){
        if(type==='webgl'&&this.classList.contains('gs2-live-surface'))return null;
        return original.call(this,type,...options);
      };
    });
    await initialize(page);
    await mountFixture(page,makePlayer({levelReady:false,xp:0,plants:[plant('motion-daisy',0,{level:2})],shelvesUnlocked:1}));
    await boot(page);await assertShellFit(page);
    const art=page.locator('.gs2-spot .gs2-live-plant').first();
    await expect.poll(()=>art.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(art).toHaveAttribute('data-living-mode',fallback?'static-fallback':reduced?'reduced':'animated');
    // In compact landscape, the shelf initially clips the bottom of the target.
    // Establish the same visible target position before baseline and tap samples;
    // otherwise locator.tap scrolls it after the baseline and invalidates crops.
    await page.locator('.gs2-plant-target').first().scrollIntoViewIfNeeded();
    if(!fallback)await expect.poll(()=>page.evaluate(()=>{
      const node=document.querySelector('[data-plant-id="motion-daisy"] .gs2-live-plant');
      const entry=window.__GARDEN_LIVING_QA__.snapshot().surfaces.find(surface=>surface.rootKind==='shelf')?.plants.find(plant=>plant.id==='motion-daisy');
      return !!entry?.slot&&Math.abs(entry.slot.top-node.getBoundingClientRect().top)<.01;
    })).toBe(true);
    return art;
  }
  async function regions(page,art){
    const box=await art.boundingBox(),aspect=await art.locator('img').evaluate(img=>img.naturalWidth/img.naturalHeight);
    const fit=fitArtwork({left:box.x,top:box.y,right:box.x+box.width,bottom:box.y+box.height,width:box.width,height:box.height},aspect);
    const rect=(x,y,w,h)=>({x:fit.left+fit.width*x,y:fit.top+fit.height*y,width:fit.width*w,height:fit.height*h});
    const crops={blossom:rect(.34,0,.4,.32),foliage:rect(.12,.05,.76,.55),pot:rect(.43,.78,.14,.08),control:await page.getByRole('button',{name:'Garden settings',exact:true}).boundingBox()};
    const shelf=await page.locator('.gs2-shelf-viewport').boundingBox(),viewport=page.viewportSize();
    for(const [name,crop] of Object.entries(crops)){
      const bounds=name==='control'?{x:0,y:0,width:viewport.width,height:viewport.height}:shelf;
      expect(crop.x,`${name} crop left`).toBeGreaterThanOrEqual(bounds.x);
      expect(crop.y,`${name} crop top`).toBeGreaterThanOrEqual(bounds.y);
      expect(crop.x+crop.width,`${name} crop right`).toBeLessThanOrEqual(bounds.x+bounds.width);
      expect(crop.y+crop.height,`${name} crop bottom`).toBeLessThanOrEqual(bounds.y+bounds.height);
    }
    return crops;
  }
  async function capture(page,testInfo,label,crops){
    const png=await page.screenshot({path:testInfo.outputPath(`${label}.png`),animations:'allow'});
    const {width}=await sharp(png).metadata(),scale=width/page.viewportSize().width,result={sizes:{}};
    for(const [name,r] of Object.entries(crops)){
      const crop={left:Math.round(r.x*scale),top:Math.round(r.y*scale),width:Math.floor(r.width*scale),height:Math.floor(r.height*scale)};
      result[name]=await sharp(png).extract(crop).removeAlpha().raw().toBuffer();result.sizes[name]={width:crop.width,height:crop.height,scale};
    }
    return result;
  }
  function changedPixels(a,b){
    expect(a.length).toBe(b.length);let count=0;
    for(let i=0;i<a.length;i+=3)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)count++;
    return count;
  }
  function stableReference(a,b){expect(changedPixels(a.pot,b.pot),'opaque pot remains fixed').toBe(0);expect(changedPixels(a.control,b.control),'visible Settings control remains fixed').toBe(0);}
  const diagnostics=page=>page.evaluate(()=>window.__GARDEN_LIVING_QA__.snapshot());
  for(const [width,height] of [[320,568],[390,844],[568,320],[1280,720]])test.describe(`visible idle ${width}x${height}`,()=>{
   test.use({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:width<1100,hasTouch:width<1100});
   test('normal motion changes real foliage pixels at idle and after a tap while pot and UI stay fixed',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));const art=await seedMotion(page),crops=await regions(page,art);
    const initialScroll=await page.locator('.gs2-shelf-viewport').evaluate(node=>node.scrollTop);
    const initial=await capture(page,testInfo,'normal-idle-before',crops),started=(await diagnostics(page)).surfaces[0].presentationSeconds;
    const shifts=[0],measurements=[];let idle=initial,maxChanged=0;
    // Sample more than one primary5.8s cycle in actual presentation time. Wall
    // time and frame-count flags alone cannot prove visible plant movement.
    for(let sample=1;sample<=7;sample++){
      await expect.poll(async()=>(await diagnostics(page)).surfaces[0].presentationSeconds,{timeout:5000}).toBeGreaterThanOrEqual(started+sample*.9);
      idle=await capture(page,testInfo,`normal-idle-${sample}`,crops);stableReference(initial,idle);
      const shift=measurePlantTranslation(initial.blossom,idle.blossom,initial.sizes.blossom);shifts.push(shift.x);measurements.push(shift);
      maxChanged=Math.max(maxChanged,changedPixels(initial.foliage,idle.foliage));
    }
    const excursion=Math.max(...shifts)-Math.min(...shifts);
    await testInfo.attach('idle-pixel-measurements',{body:Buffer.from(JSON.stringify({width,height,excursion,measurements},null,2)),contentType:'application/json'});
    expect(excursion,'visible flower excursion in CSS pixels').toBeGreaterThanOrEqual(2);
    expect(excursion,'bounded flower excursion in CSS pixels').toBeLessThanOrEqual(5);
    expect(maxChanged,'idle foliage has visible pixel movement').toBeGreaterThan(20);
    const touches=(await diagnostics(page)).surfaces[0].touches,lastTapped=(await state(page)).plants[0].lastTapped;
    await tapOrClick(page.locator('.gs2-plant-target').first(),width<1100);
    await expect(page.locator('.gs2-spot').first()).toHaveAttribute('data-gs2-tapped','true');
    await expect.poll(async()=>(await diagnostics(page)).surfaces[0].touches).toBe(touches+1);
    await expect.poll(async()=>(await state(page)).plants[0].lastTapped).toBeGreaterThan(lastTapped);
    // Let the stationary acknowledgement disappear before comparing motion pixels.
    await expect(page.locator('.gs2-spot').first()).not.toHaveAttribute('data-gs2-tapped','true');
    expect(await page.locator('.gs2-shelf-viewport').evaluate(node=>node.scrollTop),'tap must not move the sampling viewport').toBe(initialScroll);
    expect(await regions(page,art),'tap must not move the plant or UI sampling rectangles').toEqual(crops);
    const tapped=await capture(page,testInfo,'normal-after-tap',crops);
    expect(changedPixels(idle.foliage,tapped.foliage),'foliage still moves after the actual plant tap').toBeGreaterThan(5);stableReference(idle,tapped);expect(errors).toEqual([]);
    await page.getByRole('button',{name:'Garden settings',exact:true}).click();await expect(page.locator('[data-garden-motion="on"]')).toContainText('device settings');
   });
  });
  for(const fallback of [false,true])test(`${fallback?'failed WebGL initialization':'device reduced motion'} keeps art still, explains it in Settings and acknowledges working taps`,async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));const art=await seedMotion(page,{fallback,reduced:!fallback}),crops=await regions(page,art);
    const before=await capture(page,testInfo,fallback?'fallback-before':'reduced-before',crops);
    await page.waitForTimeout(750);const idle=await capture(page,testInfo,fallback?'fallback-idle':'reduced-idle',crops);
    expect(changedPixels(before.foliage,idle.foliage)).toBe(0);stableReference(before,idle);
    const lastTapped=(await state(page)).plants[0].lastTapped;await page.locator('.gs2-plant-target').first().tap();
    await expect(page.locator('.gs2-spot').first()).toHaveAttribute('data-gs2-tapped','true');
    await expect.poll(async()=>(await state(page)).plants[0].lastTapped).toBeGreaterThan(lastTapped);
    await expect(page.locator('.gs2-spot').first()).not.toHaveAttribute('data-gs2-tapped','true');
    const after=await capture(page,testInfo,fallback?'fallback-after-tap':'reduced-after-tap',crops);
    expect(changedPixels(before.foliage,after.foliage)).toBe(0);stableReference(before,after);
    await page.getByRole('button',{name:'Garden settings',exact:true}).click();
    await expect(page.locator(`[data-garden-motion="${fallback?'fallback':'reduced'}"]`)).toContainText(fallback?'this view':'reduced motion');
    expect(errors).toEqual([]);
  });
  test('context loss restores visible fallback and a working non-motion tap response',async({page})=>{
    const art=await seedMotion(page);await page.locator('.gs2-stage canvas.gs2-live-surface').evaluate(canvas=>{
      const extension=canvas.getContext('webgl').getExtension('WEBGL_lose_context');if(!extension)throw Error('Context-loss test requires WEBGL_lose_context');extension.loseContext();
    });
    await expect(art).toHaveAttribute('data-living-mode','static-fallback');await expect(art.locator('img')).toHaveCSS('visibility','visible');
    await page.locator('.gs2-plant-target').first().tap();await expect(page.locator('.gs2-spot').first()).toHaveAttribute('data-gs2-tapped','true');
    await page.getByRole('button',{name:'Garden settings',exact:true}).click();await expect(page.locator('[data-garden-motion="fallback"]')).toBeVisible();
  });
});

for(const [width,height] of [[320,568],[390,844],[568,320]])test.describe(`Garden stable saving ${width}x${height}`,()=>{
  test.use({viewport:{width,height},deviceScaleFactor:width===390?2:1,isMobile:true,hasTouch:true});
  test('saving and an actionable error do not move shelf, dialog contents or controls',async({page},testInfo)=>{
    const player=makePlayer({levelReady:false,xp:0});
    // This geometry case owns the pending upgrade. Keep passive earnings from
    // starting a credit request between actionability checks and the user click.
    // Timers and animations still run; only Date is fixed to the fixture epoch.
    await page.clock.setFixedTime(player.garden.lastTick);
    await initialize(page);await mountFixture(page,player);await boot(page);await assertShellFit(page);
    await page.locator('[data-plant-details-button]').first().click();const care=panel(page,'plant-detail');
    const boxes=()=>page.evaluate(()=>Object.fromEntries(['.gs2-shelf-viewport','.gs2-status','.gs2-dialog-heading','.gs2-detail-stage','.gs2-detail-stat','.gs2-close'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
    const upgrade=care.getByRole('button',{name:/Increase income/});await upgrade.scrollIntoViewIfNeeded();
    const primaryGeometry=()=>care.locator('.gs2-primary').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect(),css=getComputedStyle(button);return {width:r.width,height:r.height,borderTop:css.borderTopWidth,borderBottom:css.borderBottomWidth};}));
    const before=await boxes(),buttonsBefore=await primaryGeometry();let release;const held=new Promise(resolve=>{release=resolve;});
    await page.route('**/api/player/mutate',async route=>{if(parse(route.request()).action==='garden.upgradePlant'){await held;await route.abort('failed');}else await route.fallback();});
    try{
      await Promise.all([
        page.waitForRequest(request=>request.url().endsWith('/api/player/mutate')&&parse(request).action==='garden.upgradePlant',{timeout:5000}),
        upgrade.click()
      ]);
      await expect(care.locator('.gs2-pending')).toHaveText('Saving…');expect(await primaryGeometry()).toEqual(buttonsBefore);expect(await boxes()).toEqual(before);
      await expect(page.locator('.gs2-status')).not.toContainText('Saving');
      await shot(page,testInfo,'saving-reserved');release();
      await expect(care.locator('[role="alert"]')).toBeVisible();expect(await boxes()).toEqual(before);
      await care.locator('[role="alert"]').getByRole('button',{name:'Close',exact:true}).click();
      await expect(care.locator('[role="alert"]')).toHaveCount(0);expect(await boxes()).toEqual(before);
    }finally{release();}
  });
});


test.describe('Garden shelf image demand loading',()=>{
  for(const mode of ['animated','reduced','static-fallback'])test(`keeps first shelf eager and loads distant art on scroll in ${mode} mode`,async({page},testInfo)=>{
    await page.setViewportSize({width:390,height:844});
    if(mode==='reduced')await page.emulateMedia({reducedMotion:'reduce'});
    if(mode==='static-fallback')await page.addInitScript(()=>{
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^(webgl|experimental-webgl|webgl2)$/.test(kind)?null:original.call(this,kind,...args);};
    });
    const paths=new Set();page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/games/garden-living/'))paths.add(path);});
    const species=Object.keys(PLANT_TYPES);
    const plants=Array.from({length:15},(_,i)=>plant(`load-${i}`,i,{type:species[i%species.length],shelfIndex:Math.floor(i/3),spotIndex:i%3,phase:i===14?0:3}));
    await initialize(page);await mountFixture(page,makePlayer({levelReady:false,xp:0,shelvesUnlocked:5,plants}));await boot(page);
    const first=page.locator('[data-plant-id="load-0"] .gs2-live-plant'),last=page.locator('[data-plant-id="load-14"] .gs2-live-plant');
    await expect(first).toHaveAttribute('data-art-requested','true');
    await expect.poll(()=>first.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(last).toHaveAttribute('data-art-requested','false');
    expect(await last.locator('img').getAttribute('src')).toBeNull();
    const lastPath='/games/garden-living/daisy-seedling-r1.webp';
    expect(paths.has(lastPath)).toBe(false);
    const before=[...paths];
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute('data-art-requested','true');
    await expect(last.locator('img')).toHaveAttribute('src',lastPath);
    await expect.poll(()=>last.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(last).toHaveAttribute('data-living-mode',mode);
    expect(paths.has(lastPath)).toBe(true);
    await page.context().setOffline(true);
    await first.scrollIntoViewIfNeeded();
    await expect(last).toHaveAttribute('data-art-requested','true');
    await last.scrollIntoViewIfNeeded();
    await expect.poll(()=>last.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.context().setOffline(false);
    await testInfo.attach('garden-image-loading-diagnostics',{body:JSON.stringify({mode,before,after:[...paths],firstShelfEager:true,lastShelfDeferred:true}),contentType:'application/json'});
  });
});
