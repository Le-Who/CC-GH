/** Ordinary built App + production action dispatcher. No preview URL, store setter,
 * authored visitor plan, renderer substitution, or test-owned camera transform. */
import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {openHome} from '../e2e/helpers/home.js';
import {mountHomePlayerFixture} from '../e2e/helpers/homePlayerFixture.js';
import geometry from '../../game-logic/yard-v2/canonical-location-geometry.json' with {type:'json'};
const OUT='test-results/development-batch/yard-framing';
const readScene=page=>page.evaluate(()=>window.__yardPipIntegration?.snapshot()?.scene??null);
function project(scene,point){
 const c=geometry.composition.camera,q=[point.x-c.projectionOriginCanonical[0],point.y-c.projectionOriginCanonical[1],point.z??0].map(v=>v/geometry.composition.canonicalPerSceneUnit),a=scene.projection.art;
 return{x:a.x+scene.projection.scale*(c.projectionOriginCss[0]+q.reduce((n,v,i)=>n+v*c.right[i],0)*c.pixelsPerSceneUnitCss),y:a.y+scene.projection.scale*(c.projectionOriginCss[1]+q.reduce((n,v,i)=>n+v*c.down[i],0)*c.pixelsPerSceneUnitCss)};
}
function bodyEnvelope(scene){
 const root=scene.lastFrame?.root;if(!root||!['pet','both'].includes(scene.lastFrame?.visibility))return null;
 // Same conservative full-volume envelope as assertCleanComposition; this is
 // a geometry warning, never a substitute for actual gameplay-scale images.
 const size=scene.actorUnitsPerSource,points=[];
 for(const x of [-size,size])for(const y of [-size,size])for(const z of [0,1.5*size])points.push(project(scene,{x:root.x+x,y:root.y+y,z:(root.z??0)+z}));
 const bounds={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
 return{basis:'Existing composition conservative volume, not actual posed mesh bounds; image review required',...bounds,fullyInside:bounds.left>=0&&bounds.top>=0&&bounds.right<=scene.projection.width&&bounds.bottom<=scene.projection.height};
}
async function measure(page){
 const scene=await readScene(page),dom=await page.evaluate(()=>{
  const rect=selector=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,visibility:s.visibility,display:s.display};};
  return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},app:rect('.cy-app'),header:rect('.cy-header'),stage:rect('.cy-scene'),canvas:rect('.cy-scene > canvas'),directCanvas:rect('.cy-pip-direct-layer canvas'),status:rect('.cy-status'),controls:rect('.cy-placement'),nav:rect('.cy-actions'),horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 return{dom,scene,bodyEnvelope:scene?.projection?bodyEnvelope(scene):null};
}
async function capture(page,proof,name){
 const row=await measure(page);proof.captures.push({name,...row});await page.screenshot({path:`${OUT}/${proof.id}-${name}.png`});return row;
}
async function transact(page,action,click){
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action===action);response.catch(()=>{});
 await click();const result=await response;expect(result.status()).toBe(200);const body=await result.json();expect(body.error).toBeFalsy();return body;
}
for(const [width,height,mobile] of [[612,982,false],[320,568,true],[568,320,true]])test(`Yard initial framing ordinary shell ${width}x${height}`,async({browser},info)=>{
 const id=`${width}x${height}`,context=await browser.newContext({baseURL:info.project.use.baseURL,viewport:{width,height},deviceScaleFactor:width===320?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),page=await context.newPage();
 const proof={id,scope:'Actual normal app viewport. Telegram outer chrome is not emulated.464x458 is only an inferred reference stage, never an asserted DOM size.',status:'failed',captures:[],commands:[],errors:[]};
 await fs.mkdir(OUT,{recursive:true});
 page.on('pageerror',error=>proof.errors.push(String(error)));
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/player/mutate'){const body=request.postDataJSON();proof.commands.push({action:body.action,payload:body.payload,clientActionId:body.clientActionId});}});
 await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','yard_framing_batch');localStorage.setItem('garden_shelf_language','en');});
 const fixturePlayer=await mountHomePlayerFixture(page);
 fixturePlayer.yard.currencies.treats=200;
 proof.fixtureFunding={treats:200,purpose:'Disposable visual QA funding before first snapshot; not new-player economy acceptance'};
 try{
  await page.goto('/');await expect(page.locator('.gs2-stage')).toBeVisible();await openHome(page);
  await page.locator('[data-home-game="room"]').click();await expect(page.locator('.cy-app')).toBeVisible();
  await expect(page.locator('[data-yard-action="open-canonical-yard"]')).toBeEnabled();await page.locator('[data-yard-action="open-canonical-yard"]').click();
  await expect.poll(async()=>{const s=await readScene(page);return s?.ready===true&&!s.viewportBlocked&&s.lastFrame?.canonicalState==='ready'&&s.canonicalFood?.loading===false&&s.renderer?.canonicalFood?.pending===0;},{timeout:30000}).toBe(true);
  expect(new URL(page.url()).search).toBe('');
  await expect(page.locator('.cy-app')).toHaveAttribute('data-canonical-items','true');
  const empty=await capture(page,proof,'empty-default');expect(empty.scene.canonicalRecords).toHaveLength(0);
  expect(empty.dom.horizontalOverflow).toBe(false);expect(empty.dom.canvas.width).toBeCloseTo(empty.scene.projection.width,1);expect(empty.dom.canvas.height).toBeCloseTo(empty.scene.projection.height,1);
  const p=empty.scene.projection;expect(p.art.y).toBeLessThanOrEqual(0);expect(p.fit).toContain('top-biased');
  const bowl=project(empty.scene,{x:80,y:82});expect(bowl.y).toBeGreaterThan(0);expect(bowl.y+24*p.scale).toBeLessThanOrEqual(p.height+0.01);
  // Buy and place through visible UI. Fixture executes production dispatch.
  await page.locator('[data-pip-control="inventory"]').click();await page.locator('[data-decor-tab="shop"]').click();
  await page.locator('.cy-catalog-choice[data-goodie-id="leaf_pot"]').click();
  await transact(page,'yard.buyGoodie',()=>page.locator('[data-yard-action="buy-goodie"]').click());
  expect(fixturePlayer.yard.currencies.treats).toBe(60);expect(fixturePlayer.yard.goodieInventory.leaf_pot).toBe(1);
  await page.locator('[data-decor-tab="inventory"]').click();await page.locator('.cy-catalog-choice[data-goodie-id="leaf_pot"]').click();await page.locator('[data-yard-action="place"]').click();
  await expect(page.locator('.cy-dialog')).not.toBeVisible();
  await expect.poll(async()=>(await readScene(page))?.lastFrame?.ghost?.valid).toBe(true);
  await capture(page,proof,'placement-preview');
  await transact(page,'yard.placeGoodie',()=>page.locator('[data-yard-action="commit-placement"]').click());
  await expect.poll(async()=>(await readScene(page))?.canonicalRecords?.length).toBe(1);
  await expect.poll(async()=>{const s=await readScene(page);return s?.lastFrame?.visibility==='both'&&s.lastFrame?.committed===true;},{timeout:20000}).toBe(true);
  for(let i=0;i<4;i++){await capture(page,proof,`one-pot-motion-${i}`);await page.waitForTimeout(650);}
  await expect.poll(async()=>{const s=await readScene(page);return ['inspecting','settled'].includes(s?.interaction?.phase);},{timeout:25000}).toBe(true);
  const placed=await capture(page,proof,'one-pot-interaction');expect(placed.dom.horizontalOverflow).toBe(false);
  expect(placed.dom.directCanvas.visibility).toBe('visible');expect(placed.scene.renderer.lastFrame.rasterPolicy).toBe('garden-reference-grid-v1');
  // Entrance may legitimately be partially outside the stage. Record the
  // existing conservative envelope, but only actual posed pixels or qualified
  // posed mesh bounds can establish full-body visual acceptance.
  proof.visualAcceptance='Pending inspection of captured actual gameplay frames; conservative envelopes are diagnostics only';
  expect(placed.bodyEnvelope).not.toBeNull();
  const placementCommands=proof.commands.filter(x=>x.action==='yard.placeGoodie');expect(placementCommands).toHaveLength(1);
  expect(placementCommands[0].clientActionId).toMatch(/^yard-v2:canonical-v2\//);
  expect(fixturePlayer.yard.goodieInventory.leaf_pot??0).toBe(0);expect(fixturePlayer.yard.currencies.treats).toBe(60);
  proof.fixtureFinal={treats:fixturePlayer.yard.currencies.treats,leafPotInventory:fixturePlayer.yard.goodieInventory.leaf_pot??0};
  expect(proof.errors).toEqual([]);proof.status='passed';
 }catch(error){
  proof.failure=String(error?.stack||error);try{await capture(page,proof,'failure');}catch(captureError){proof.captureFailure=String(captureError);}
  try{proof.failureText=await page.locator('body').innerText();}catch{}
  throw error;
 }finally{await fs.writeFile(`${OUT}/${id}-proof.json`,JSON.stringify(proof,null,2));await context.close();}
});
