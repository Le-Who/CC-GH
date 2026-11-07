/** Reachable production Courtyard route, real hub/API/IDB/renderer/socket client.
 * HTTP uses the existing ephemeral fixture's real applyActionWithReceipt; only
 * transport ordering and one explicit rejection are injected. No deployed DB,
 * full-actor-stay or same-document login-switch claim is made. The exact
 * ec815 live-parity slice preserves VITE_YARD_PIP_PREVIEW=true; saved and
 * painted trial flags remain false. The default route stays in legacy mode. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {startSwFixture} from './helpers/swFixture.mjs';

const matrix=[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720]];
const profiles=[{name:'diagnostic compact320',width:320,height:568},...matrix.map(([width,height])=>({name:`acceptance ${width}x${height}`,width,height}))];
function observeCanvasDraws(){
  const ids=new WeakMap();let next=0,frame=0,rows=[];
  const clear=CanvasRenderingContext2D.prototype.clearRect,draw=CanvasRenderingContext2D.prototype.drawImage;
  const ours=context=>context.canvas?.matches?.('.cy-scene canvas');
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(ours(this)){frame++;rows=[];}return clear.apply(this,args);};
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
    if(ours(this)){if(!ids.has(image))ids.set(image,++next);rows.push({bitmap:ids.get(image),alpha:this.globalAlpha,args:args.map(Number)});}
    return draw.call(this,image,...args);
  };
  // Read-only Canvas2D draw observation. Does not alter pixels or game state.
  window.__yardDrawProof=()=>({frame,rows:rows.map(row=>({...row,args:[...row.args]}))});
}
async function journal(page,account){return page.evaluate(async account=>{
  const key='game_hub_yard_outbox_v2:'+encodeURIComponent(account),fallback=localStorage.getItem(key);
  if(fallback!==null)throw Error('Expected actual IndexedDB journal, found fallback');
  return new Promise((resolve,reject)=>{const open=indexedDB.open('keyval-store');open.onerror=()=>reject(open.error);open.onsuccess=()=>{
    const db=open.result,request=db.transaction('keyval','readonly').objectStore('keyval').get(key);
    request.onsuccess=()=>{resolve(request.result||null);db.close();};request.onerror=()=>{reject(request.error);db.close();};
  };});
},account);}
const commandFields=item=>({accountId:item.accountId,action:item.action,payload:item.payload,clientActionId:item.clientActionId});
const uiState=page=>page.evaluate(()=>({canonicalItems:document.querySelector('.cy-app')?.dataset.canonicalItems,pipPreview:document.querySelector('.cy-app')?.dataset.pipPreview,dialogOpen:!!document.querySelector('.cy-dialog')?.open,catalogSlots:[...document.querySelectorAll('.cy-catalog-choice[data-slot-id]')].map(node=>node.dataset.slotId)}));
const draws=page=>page.evaluate(()=>window.__yardDrawProof?.());
const waitJournal=(page,account,count)=>expect.poll(async()=>(await journal(page,account))?.items?.length||0).toBe(count);
async function ready(page){
  await expect(page.locator('.cy-app')).toBeVisible({timeout:30000});
  await expect(page.locator('.cy-scene canvas')).toBeVisible();
  await expect.poll(async()=>{const d=await draws(page);return d?.frame>1&&d.rows.length>0;},{timeout:30000}).toBe(true);
  await expect(page.locator('.cy-app')).toHaveAttribute('data-pip-preview','false');
  await expect(page.locator('[data-pip-control]')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>Object.hasOwn(window,'__yardPipIntegration')),true,'preserve existing live optional-scene owner exposure without reading its diagnostics');
  await expect(page.locator('[data-yard-action="open-canonical-yard"]')).toBeVisible();
  await expect(page.locator('.cy-app')).toHaveAttribute('data-canonical-items','false');
}
async function catalogRows(page,count){
  await page.locator('[data-nav-item="decor"]').click();await page.locator('[data-decor-tab="placed"]').click();
  const rows=page.locator('.cy-catalog-choice[data-slot-id]');await expect(rows).toHaveCount(count);
  const slots=await rows.evaluateAll(nodes=>nodes.map(node=>node.dataset.slotId));
  await page.locator('.cy-dialog > header > button').click();await expect(page.locator('.cy-dialog')).not.toBeVisible();
  return slots;
}
async function place(page,id){
  await page.locator('[data-nav-item="decor"]').click();await page.locator('[data-decor-tab="inventory"]').click();
  await page.locator(`.cy-catalog-choice[data-goodie-id="${id}"]`).click();
  const action=page.locator('[data-yard-action="place"]');await expect(action).toBeEnabled();await action.click();
  const commit=page.locator('[data-yard-action="commit-placement"]');await expect(commit).toBeEnabled();await commit.click();
}

for(const profile of profiles)test.describe(profile.name,()=>{
  test.use({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:profile.width===390?2:1,isMobile:profile.width<1280,hasTouch:profile.width<1280,serviceWorkers:'block'});
  test('normal-release Courtyard journal, ordering, rollback and account recovery',async({page},info)=>{
  test.setTimeout(120000);
  const fixture=await startSwFixture({gameActions:true,gardenMode:'r2'}),commands=[],held=[],errors=[],sockets=[],syncFrames=[];
  page.on('websocket',socket=>{const socketIndex=sockets.length;sockets.push(socket);socket.on('framereceived',({payload})=>{try{const packet=String(payload);if(packet.startsWith('42')){const [name,event]=JSON.parse(packet.slice(2));if(name==='player_sync')syncFrames.push({...event,socketIndex});}}catch{}});});
  let mode='hold',closing=false;
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(observeCanvasDraws);
  await page.addInitScript(()=>{if(!localStorage.getItem('gh_dev_user_id'))localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});
  await page.route('**/api/player/mutate',async route=>{
    const command=route.request().postDataJSON();if(!['yard.placeGoodie','yard.moveGoodie'].includes(command.action))return route.continue();
    commands.push(command);const behavior=mode;mode='pass';
    if(behavior==='pass')return route.continue();
    let send,deliver;const sendGate=new Promise(resolve=>send=resolve),deliverGate=new Promise(resolve=>deliver=resolve);
    const control={command,send,deliver,body:null,behavior};held.push(control);
    await sendGate;if(closing)return route.abort();
    if(behavior==='reject'){await deliverGate;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'fixture definitive placement rejection'})});}
    const response=await route.fetch();control.body=await response.json();await deliverGate;if(closing)return route.abort();
    if(behavior==='lost')return route.abort('failed');
    return route.fulfill({response});
  });
  try{
    await page.goto(fixture.origin+'/?tab=room');await ready(page);
    await expect.poll(()=>fixture.realtimeConnections()).toBeGreaterThan(0);
    await expect.poll(()=>sockets.some(socket=>!socket.isClosed())).toBe(true);
    const initial=structuredClone(fixture.player('account-a').yard);
    assert.equal(initial.placedGoodies.length,0);assert.equal(initial.goodieInventory.yarn_mouse,1);
    await place(page,'yarn_mouse');await expect.poll(()=>held.length).toBe(1);
    const first=held[0];assert.equal(first.command.accountId,'account-a');assert.equal(first.command.action,'yard.placeGoodie');
    await waitJournal(page,'account-a',1);assert.deepEqual(commandFields((await journal(page,'account-a')).items[0]),commandFields(first.command));
    await expect(page.locator('[data-yard-action="commit-placement"]')).toHaveCount(0);
    await expect(page.locator('.cy-status')).toContainText(/saving/i);
    await expect.poll(async()=>(await draws(page)).rows.filter(row=>row.alpha===.65).length).toBe(1);
    const pendingDraw=(await draws(page)).rows.find(row=>row.alpha===.65);
    assert.equal(fixture.player('account-a').yard.placedGoodies.length,0,'pending visual appears before request reaches authoritative fixture');
    assert.deepEqual(fixture.player('account-a').yard.goodieInventory,initial.goodieInventory);
    await page.screenshot({path:info.outputPath('placement-pending-before-send.png')});
    first.send();await expect.poll(()=>first.body?.success).toBe(true);
    const committed=first.body.snapshot;
    fixture.emitPlayerSync({...committed,accountId:'account-a',syncSeq:committed.player.syncSeq,qaDelivery:'first-commit-before-http'});
    await expect.poll(()=>syncFrames.some(event=>event?.payload?.qaDelivery==='first-commit-before-http')).toBe(true);
    assert.deepEqual(await catalogRows(page,1),[first.command.payload.slotId]);
    await waitJournal(page,'account-a',1);
    assert.deepEqual(commandFields((await journal(page,'account-a')).items[0]),commandFields(first.command));
    await expect.poll(async()=>(await draws(page)).rows.filter(row=>row.bitmap===pendingDraw.bitmap).length).toBe(1);
    await expect.poll(async()=>(await draws(page)).rows.filter(row=>row.bitmap===pendingDraw.bitmap&&row.alpha===.65).length).toBe(1);
    first.deliver();await waitJournal(page,'account-a',0);
    await expect.poll(async()=>(await draws(page)).rows.filter(row=>row.bitmap===pendingDraw.bitmap&&row.alpha===1).length).toBe(1);
    assert.equal(commands.filter(row=>row.clientActionId===first.command.clientActionId).length,1);
    assert.equal(fixture.player('account-a').yard.goodieInventory.yarn_mouse??0,0);assert.deepEqual(fixture.player('account-a').yard.currencies,initial.currencies);
    await page.screenshot({path:info.outputPath('placement-settled.png')});
    const settledDraw=(await draws(page)).rows.find(row=>row.bitmap===pendingDraw.bitmap&&row.alpha===1);assert(settledDraw);

    // Real move UI; injected definitive server denial must restore the original
    // authoritative placement after the hub performs its normal snapshot read.
    const original=structuredClone(fixture.player('account-a').yard.placedGoodies[0]);mode='reject';
    await page.locator('[data-nav-item="decor"]').click();await page.locator('[data-decor-tab="placed"]').click();
    await page.locator(`.cy-catalog-choice[data-slot-id="${original.slotId}"]`).click();
    await page.locator('[data-yard-action="move"]').click();
    await page.locator('.cy-scene canvas').press('ArrowRight');await page.locator('[data-yard-action="commit-placement"]').click();
    await expect.poll(()=>held.length).toBe(2);const rejected=held[1];assert.notEqual(rejected.command.payload.x,original.x);
    await waitJournal(page,'account-a',1);await expect.poll(async()=>(await draws(page)).rows.filter(row=>row.alpha===.65).length).toBe(1);
    await expect.poll(async()=>{const moved=(await draws(page)).rows.find(row=>row.bitmap===pendingDraw.bitmap&&row.alpha===.65);return !!moved&&JSON.stringify(moved.args)!==JSON.stringify(settledDraw.args);}).toBe(true);
    rejected.send();rejected.deliver();await waitJournal(page,'account-a',0);
    await expect.poll(async()=>(await draws(page)).rows.filter(row=>row.alpha===.65).length).toBe(0);
    await expect.poll(async()=>JSON.stringify((await draws(page)).rows.find(row=>row.bitmap===pendingDraw.bitmap&&row.alpha===1)?.args)).toBe(JSON.stringify(settledDraw.args));
    assert.deepEqual(await catalogRows(page,1),[original.slotId]);
    assert.deepEqual(fixture.player('account-a').yard.placedGoodies,[original]);

    // Commit on the fixture but lose the HTTP response. The real browser
    // journal must remain owned by A while a new document authenticates B.
    mode='lost';await place(page,'sun_cushion');await expect.poll(()=>held.length).toBe(3);
    const lost=held[2];await waitJournal(page,'account-a',1);lost.send();await expect.poll(()=>lost.body?.success).toBe(true);
    const originalNonce=lost.command.clientActionId;
    const bSocketStart=sockets.length;await page.evaluate(()=>localStorage.setItem('gh_dev_user_id','fixture-b'));lost.deliver();await page.reload();await ready(page);
    await waitJournal(page,'account-a',1);await waitJournal(page,'account-b',0);
    assert.equal((await journal(page,'account-a')).items[0].clientActionId,originalNonce);
    assert.deepEqual(await catalogRows(page,0),[]);
    await expect.poll(()=>sockets.some((socket,index)=>index>=bSocketStart&&!socket.isClosed())).toBe(true);
    fixture.emitPlayerSync({...lost.body.snapshot,accountId:'account-a',syncSeq:lost.body.snapshot.player.syncSeq,qaDelivery:'foreign-a-after-b'});
    await expect.poll(()=>syncFrames.some(event=>event?.payload?.qaDelivery==='foreign-a-after-b'&&event.socketIndex>=bSocketStart)).toBe(true);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.deepEqual(await catalogRows(page,0),[],'foreign realtime cannot leak A placement into B');
    assert.equal(commands.filter(row=>row.clientActionId===originalNonce).length,1,'B must not send A journal');
    await page.evaluate(()=>localStorage.setItem('gh_dev_user_id','fixture-a'));await page.reload();await ready(page);await waitJournal(page,'account-a',0);
    await expect.poll(()=>commands.filter(row=>row.clientActionId===originalNonce).length).toBe(2);
    const retries=commands.filter(row=>row.clientActionId===originalNonce);assert.deepEqual(retries[1],retries[0],'retry keeps the exact original command');
    const finalSlots=await catalogRows(page,2);assert(finalSlots.includes(first.command.payload.slotId));assert(finalSlots.includes(lost.command.payload.slotId));
    await expect.poll(async()=>(await draws(page)).rows.filter(row=>row.alpha===.65).length).toBe(0);
    assert.equal(fixture.player('account-a').yard.goodieInventory.sun_cushion??0,0);
    assert.equal(fixture.player('account-a').yard.placedGoodies.filter(row=>row.slotId===lost.command.payload.slotId).length,1);
    assert.deepEqual(fixture.player('account-a').yard.currencies,initial.currencies);assert.deepEqual(errors,[]);
    await page.screenshot({path:info.outputPath('placement-account-return-settled.png')});
    await info.attach('placement-proof.json',{contentType:'application/json',body:Buffer.from(JSON.stringify({profile,sourceBaseline:'ec815065f6adb7c36d81f97b41d47ad16e614b07',scope:'Exact live preview build flag true; saved/painted flags false; normal default scene unchanged. Actual production Courtyard normal room route in legacy renderer, real hub/API/IDB/Socket.IO and source game action fixture. Delayed HTTP, realtime before HTTP, one sprite draw, explicit rejection, lost response, account-isolated reload and original-nonce replay. Not deployed PostgreSQL, same-document auth switching or full visual acceptance from assertions alone.',commands,foreignRealtimeFrameObserved:syncFrames.some(event=>event?.payload?.qaDelivery==='foreign-a-after-b'&&event.socketIndex>=bSocketStart),ui:await uiState(page),draws:await draws(page)},null,2))});
  }catch(error){await page.screenshot({path:info.outputPath('placement-failure.png')}).catch(()=>{});await info.attach('placement-failure.json',{contentType:'application/json',body:Buffer.from(JSON.stringify({error:String(error.stack),errors,commands,ui:await uiState(page).catch(()=>null),draws:await draws(page).catch(()=>null)},null,2))});throw error;
  }finally{closing=true;for(const control of held){control.send();control.deliver();}await fixture.close();}
});

});
