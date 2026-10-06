import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import sharp from 'sharp';
import {ORIGIN} from './fixtures.mjs';
import geometry from '../../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
export const OUT=path.join(import.meta.dirname,'results'),WORK=path.join(import.meta.dirname,'work');
export const report={status:'RUNNING',cases:[],matrix:[],captures:[],errors:[],requests:[],limits:{artifactBytes:8388608,jobMinutes:10,browserSeconds:220,retries:0},visualAcceptance:'REVIEW_PENDING',devicePerformance:'NOT_MEASURED'};
export const shot=page=>page.evaluate(()=>window.__yardPipIntegration?.snapshot());
export const scene=async page=>(await shot(page))?.scene;
export async function init(context,f,language='en'){
 await context.addInitScript(({id,language})=>{
  localStorage.setItem('gh_dev_user_id',id);localStorage.setItem('garden_shelf_language',language);
  const observed={created:[],terminated:[]};window.__canonicalWorkerObserver=observed;const Native=window.Worker;
  window.Worker=class extends Native{constructor(url,opts){super(url,opts);this.qaURL=String(url);observed.created.push(this.qaURL);}terminate(){observed.terminated.push(this.qaURL);return super.terminate();}};
 },{id:f.externalId,language});
}
export function observe(page){
 page.on('pageerror',e=>report.errors.push({type:'pageerror',message:e.message}));
 page.on('request',r=>{if(new URL(r.url()).pathname==='/api/player/mutate'){const c=r.postDataJSON();if(!['yard.placeGoodie','yard.moveGoodie','yard.pickupGoodie'].includes(c?.action))report.errors.push({type:'unexpected-economy-action',action:c?.action});}});
 page.on('response',r=>{const u=new URL(r.url());if(u.origin===ORIGIN&&(u.pathname.startsWith('/assets/')||/woff2?$/.test(u.pathname)))report.requests.push({url:u.pathname,status:r.status()});});
}
export async function boot(page){
 await page.goto(ORIGIN+'/?tab=room&yardPipPreview=1');await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:20000});
 await expect(page.locator('.cy-app')).toBeVisible();await expect.poll(async()=>(await scene(page))?.ready===true).toBe(true);
 const workers=await page.evaluate(()=>window.__canonicalWorkerObserver);assert.equal(workers.created.filter(s=>s.includes('dynamic-prop-worker')).length,0,'Planner must be lazy');
}
export async function enter(page){await page.locator('[data-pip-control="canonical-items"]').click();await expect(page.locator('[data-canonical-items="true"]')).toBeVisible();await expect.poll(async()=>{const s=await scene(page);return s?.ready||s?.viewportBlocked;}).toBeTruthy();}
export async function placedPanel(page,index=0){
 await page.locator('.cy-actions button').nth(1).click();await page.locator('[data-decor-tab="placed"]').click();
 await page.locator('.cy-catalog-choice').nth(index).click();
}
export async function closePanel(page){await page.locator('.cy-dialog > header button').click();await expect(page.locator('.cy-dialog')).not.toBeVisible();}
export function project(s,x,y,z=0){const c=geometry.composition.camera,a=s.projection.art,q=[x-c.projectionOriginCanonical[0],y-c.projectionOriginCanonical[1],z].map(v=>v/geometry.composition.canonicalPerSceneUnit);return{x:a.x+s.projection.scale*(c.projectionOriginCss[0]+q.reduce((n,v,i)=>n+v*c.right[i],0)*c.pixelsPerSceneUnitCss),y:a.y+s.projection.scale*(c.projectionOriginCss[1]+q.reduce((n,v,i)=>n+v*c.down[i],0)*c.pixelsPerSceneUnitCss)};}
export async function dragTo(page,x,y){
 const canvas=page.locator('.cy-scene > canvas'),box=await canvas.boundingBox(),s=await scene(page),p=project(s,x,y);
 assert(p.x>=0&&p.y>=0&&p.x<=box.width&&p.y<=box.height,'Target must be in actual crop');
 await page.mouse.move(box.x+p.x,box.y+p.y);await page.mouse.down();await page.mouse.up();
 await expect.poll(async()=>{const g=(await scene(page))?.lastFrame?.ghost;return g&&Math.abs(g.x-x)<0.25&&Math.abs(g.y-y)<0.25;}).toBe(true);
}
export async function place(page,x,y){await page.locator('[data-pip-control="inventory"]').click();await page.locator('.cy-catalog-choice').first().click();await page.locator('.cy-selected-actions button').last().click();await dragTo(page,x,y);await page.locator('[data-yard-action="commit-placement"]').click();}
export async function move(page,index,x,y){await placedPanel(page,index);await page.locator('[data-yard-action="move"]').click();await dragTo(page,x,y);await page.locator('[data-yard-action="commit-placement"]').click();}
export async function pickup(page,index){await placedPanel(page,index);await page.locator('[data-yard-action="pickup"]').click();}
export async function inspect(page,index=0){
 await placedPanel(page,index);
 const targetSlotId=await page.locator('.cy-catalog-choice[aria-pressed="true"]').getAttribute('data-slot-id');
 assert(targetSlotId,'Inspect must address one real selected committed slot');
 const before=(await scene(page)).interaction;assert(before&&Number.isInteger(before.planCount));
 await page.locator('[data-pip-control="inspect-selected"]').click();
 await expect.poll(async()=>{
  const current=(await scene(page))?.interaction;
  return current?.targetSlotId===targetSlotId&&current.planCount>before.planCount
   &&['approaching','inspecting','settled','no-path'].includes(current.phase)
   &&(current.phase==='no-path'||current.phase==='settled'||current.planLayoutKey===current.layoutKey);
 },{intervals:[20,50,100]}).toBe(true);
 return scene(page);
}
export async function refresh(page){const response=page.waitForResponse(r=>new URL(r.url()).origin===ORIGIN&&new URL(r.url()).pathname==='/api/player/snapshot'&&r.status()===200);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await response;}
export async function capture(page,name){await fs.mkdir(OUT,{recursive:true});const file=name+'.webp';await sharp(await page.screenshot()).webp({quality:90}).toFile(path.join(OUT,file));report.captures.push(file);return file;}
export async function fonts(page,locale){
 await page.evaluate(()=>document.fonts.ready);const actual=await page.locator('.cy-app').evaluate(e=>getComputedStyle(e).fontFamily);assert.match(actual,/Nunito/i);
 const fonts=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/nunito.*\.woff2?/.test(r.name)).map(r=>({url:new URL(r.name).pathname,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize})));
 assert(fonts.some(r=>r.url.includes(locale==='ru'?'cyrillic':'latin')),'Expected fetched Nunito subset: '+locale);
 assert(await page.evaluate(text=>document.fonts.check('700 16px Nunito',text),locale==='ru'?'Предметы Двор':'Items Yard'));return{family:actual,loaded:fonts};
}
export async function layout(page){
 return page.evaluate(()=>{
  const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
  const visible=e=>{const s=getComputedStyle(e);return e.getClientRects().length&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('dialog:not([open])');};
  const controls=[...document.querySelectorAll('.cy-home,.cy-actions button,.cy-placement button,dialog[open] button')].filter(visible).map(e=>({label:e.getAttribute('aria-label')||e.innerText,rect:r(e),clipped:e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1}));
  return{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,stage:r(document.querySelector('.cy-scene')),dock:r(document.querySelector('.cy-actions')),controls};
 });
}
export function checkLayout(row){assert.equal(row.horizontalOverflow,false);assert(row.dock.y>=row.stage.bottom-1||row.dock.x>=row.stage.right-1||row.dock.right<=row.stage.x+1||row.dock.bottom<=row.stage.y+1,'Dock must not cover gameplay');for(const c of row.controls){assert(c.rect.w>=43&&c.rect.h>=43,'Tap target '+c.label);assert(c.rect.x>=-1&&c.rect.right<=row.width+1&&c.rect.y>=-1&&c.rect.bottom<=row.height+1,'Unreachable control '+c.label);assert.equal(c.clipped,false,'Clipped control '+c.label);}}
export async function outbox(page,id){return page.evaluate(accountId=>new Promise((resolve,reject)=>{const key=`game_hub_yard_outbox_v2:${encodeURIComponent(accountId)}`,fallback=localStorage.getItem(key);if(fallback)return resolve(JSON.parse(fallback));const request=indexedDB.open('keyval-store');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction('keyval','readonly').objectStore('keyval').get(key);read.onsuccess=()=>{db.close();resolve(read.result);};read.onerror=()=>{db.close();reject(read.error);};};}),id);}
