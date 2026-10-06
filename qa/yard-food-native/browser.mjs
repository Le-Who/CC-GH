import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {YARD_FOODS} from '../../game-logic/yard-catalog.js';
import {ORIGIN} from './fixtures.mjs';
import {report,init,observe,waitForYardReady,enter,scene,closePanel} from '../yard-canonical-acceptance/browser-helpers.mjs';
import {LIMITS} from './identity.mjs';
export const URL=ORIGIN+'/?tab=room&yardPipPreview=1&yardCanonicalFood=1&yardPipGrounding=pip-garden-grounding-v1';
export async function openFoodContext(browser,f,{recordVideo,...options}={}){
 const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block',...options,...recordVideo?{recordVideo}:{}});
 await init(c,f,'ru');await c.route(/^https?:\/\//,route=>{if(new globalThis.URL(route.request().url()).origin===ORIGIN)return route.continue();report.errors.push({type:'external-request',url:route.request().url()});return route.abort('blockedbyclient');});
 const p=await c.newPage();observe(p,'food',['yard.buyFood','yard.setFood']);return {c,p};
}
export async function bootFood(p,f){await waitForYardReady(p,f,()=>p.goto(URL));await enter(p);await ready(p);}
export async function ready(p){await expect.poll(async()=>{const s=await scene(p);return s?.ready===true&&!s.viewportBlocked&&s.lastFrame?.canonicalState==='ready';}).toBe(true);}
export async function foodState(p,state){await expect.poll(async()=>{const s=await scene(p),food=s?.renderer?.canonicalFood;return s?.canonicalFood?.state===state&&s?.canonicalFood?.reserved===true&&food?.binding?.visible===true&&food.binding.state===state&&food.selection.state===state&&food.pending===0;}).toBe(true);return scene(p);}
export function caps(s){
 assert(s.peakRgba<=LIMITS.rgba);assert(s.knownCPUBufferPeak<=LIMITS.knownCPU);assert.equal(s.savedVisitor,false);
 const f=s.renderer?.canonicalFood,l=f?.ledger;assert(l,'Food must contribute to the host resource ledger');
 for(const key of ['rgba','knownCPU','estimatedGPU']){assert(l.total[key]<=LIMITS[key]);assert(l.peak[key]<=LIMITS[key]);assert.equal(l.limits[key],LIMITS[key]);}
 assert.equal(l.visibleOwners,1);assert.equal(l.rgbaAdded,0);assert.equal(f.binding.runtimeActivated,false);assert.equal(f.binding.visitAdmission,false);assert.equal(f.binding.presentationReady,false);
 return {peak:s.peakRgba,base:s.resources,food:s.foodResources,ledger:l,driverAllocationKnown:false,physicalDevicePerformance:'NOT_MEASURED'};
}
export async function buyFill(p,f,owner,id){
 const before=await owner.saved(f),catalog=YARD_FOODS[id];assert(catalog);
 await p.locator('[data-nav-item="food"]').click();await expect(p.locator('[data-canonical-food-status="true"]')).toBeVisible();
 const buy=p.locator(`[data-yard-action="buy-food"][data-food-id="${id}"]`);await expect(buy).toBeEnabled();
 const buying=p.waitForResponse(r=>new globalThis.URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='yard.buyFood');buying.catch(()=>{});await buy.click();const purchased=await buying;assert.equal(purchased.status(),200);const purchase=await purchased.json();assert.equal(purchase.success,true);
 await expect.poll(async()=>{const s=await owner.saved(f);return s.yard.foodInventory[id]===1&&['treats','shinyTreats'].every(k=>s.yard.currencies[k]===before.yard.currencies[k]-(catalog.cost[k]||0));}).toBe(true);
 await p.locator('.cy-dialog select').selectOption(id);const fill=p.locator('[data-yard-action="set-food"][data-bowl-id="bowl-1"]');await expect(fill).toBeEnabled();
 const filling=p.waitForResponse(r=>new globalThis.URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='yard.setFood');filling.catch(()=>{});await fill.click();const refilled=await filling;assert.equal(refilled.status(),200);const response=await refilled.json();assert.equal(response.success,true);
 await expect.poll(async()=>{const s=await owner.saved(f),b=s.yard.bowls[0];return s.yard.bowls.length===1&&b.id==='bowl-1'&&b.foodId===id&&b.servings===catalog.servings&&(s.yard.foodInventory[id]||0)===0;}).toBe(true);
 const after=await owner.saved(f),bowl=after.yard.bowls[0];assert.equal(bowl.expiresAt-bowl.placedAt,catalog.durationMs);assert.deepEqual(after.yard.goodieInventory,before.yard.goodieInventory);assert.deepEqual(after.yard.pendingGifts,before.yard.pendingGifts);assert.deepEqual(after.yard.album,before.yard.album);
 for(const r of [purchased,refilled]){const command=r.request().postDataJSON();assert.match(command.clientActionId,/^yard-v2:/);report.food.transactions.push({action:command.action,payload:command.payload,clientActionId:command.clientActionId,status:r.status(),serverSnapshotSequence:(await r.json()).snapshot?.player?.syncSeq});}
 await closePanel(p);const s=await foodState(p,id);report.food.states.push({state:id,bowl:structuredClone(bowl),wallet:structuredClone(after.yard.currencies),inventory:structuredClone(after.yard.foodInventory),resources:caps(s)});return s;
}
