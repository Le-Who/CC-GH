import { test, expect } from "@playwright/test";
import { gardenDiagnostics } from "./helpers/gardenDiagnostics.js";
import { GARDEN_ECONOMY_VERSION, createGardenEconomyState, createDefaultPlayer, getGardenLevelReward, getGardenXpRequired, buildGardenDailyQuests } from "../../game-logic.js";
import { formatGardenGoldAmount } from "../../game-logic/garden-shelf-plants.js";
import { applyActionWithReceipt, buildSnapshot } from "../../routes/player.js";

// These tests mount the production App through the normal Playwright web server.
// Fixture-backed layout cases call production actions/receipts; live save cases
// below do not intercept either player endpoint. No preview host is imported.
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
      diagnostics.mark('exit-to-blox');await page.locator('[data-hud-region="bottomDock.blox"]').click();await expect(page.locator('.telegram-app')).not.toHaveAttribute('data-garden-presentation','living');
      diagnostics.mark('return-to-garden');await page.locator('[data-hud-region="bottomDock.garden"]').click();await expect(page.locator('.gs2-stage')).toBeVisible();await assertShellFit(page);
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
    await page.locator('[data-plant-details-button]').first().click();const care=panel(page,'plant-detail'),upgrade=care.getByRole('button',{name:/Evolve Production/});
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
