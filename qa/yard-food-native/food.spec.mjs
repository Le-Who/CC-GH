/** Finite native qualification of the actual inactive food host. No fake snapshots or store setters. */
import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {foodFixtureOwner,canonicalRows} from './fixtures.mjs';
import {realMutation,ORIGIN} from '../yard-canonical-acceptance/fixtures.mjs';
import {OUT,WORK,report,restoreEvidence,scene,place,move,pickup,dragTo,placedPanel,closePanel,outbox,waitForYardReady,enter,capture,captureFailureDiagnostics,layout,checkLayout,project} from '../yard-canonical-acceptance/browser-helpers.mjs';
import {auditDialogControls,reachableControl} from '../yard-canonical-acceptance/scroll-reachability.mjs';
import {openFoodContext,bootFood,foodState,buyFill,ready,caps} from './browser.mjs';
import {recordFood} from './recorded-flow.mjs';
import {YARD_STATUS,observeFoodHUD} from './selectors.mjs';
import {initializeFoodReport} from './food-report.mjs';
let owner;
async function write(){report.status=report.errors.length?'FAILED_OR_INCOMPLETE':'FOOD_MECHANICAL_GATES_PENDING_ENCODED_AND_VISUAL_REVIEW';await fs.writeFile(path.join(OUT,'browser.json'),JSON.stringify(report,null,2)+'\n');}
async function view(p){const row=await layout(p);checkLayout(row);assert(row.stage.w>=280&&row.stage.h>=192);return row;}
test.beforeAll(async()=>{await fs.mkdir(OUT,{recursive:true});await fs.mkdir(WORK,{recursive:true});const prior=await fs.readFile(path.join(OUT,'browser.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});restoreEvidence(report,prior,process.env.GITHUB_SHA);initializeFoodReport(report);report.controlAudits??=[];owner=await foodFixtureOwner();});
test.afterEach(async({},info)=>{if(info.status!=='passed'){report.sections.food='failed';report.errors.push({type:'food-test-status',title:info.title,status:info.status,message:info.error?.message});}await write();});
test.afterAll(async()=>{try{await owner?.close();}finally{if(report.requests.some(r=>r.status>=400))report.errors.push({type:'food-asset-request',message:'Native requested asset failed'});if(report.console.entries.some(e=>e.scope==='food'&&e.type==='error'&&/THREE\.WebGLProgram|VALIDATE_STATUS|shader.*error|shader.*compile|WebGL.*INVALID_OPERATION/i.test(e.text)))report.errors.push({type:'food-renderer-console',message:'Shader/WebGL error in food context'});report.sections.food=report.sections.food!=='failed'&&Object.values(report.food.sections).every(v=>v==='passed')?'passed':'failed';await write();}});

test('one continuous genuine Food purchase/refill and obstacle-avoiding manual route',async({browser})=>{test.setTimeout(80000);try{await recordFood(browser,owner);report.food.sections.recording='passed';}catch(e){report.food.sections.recording='failed';throw e;}});

test('device-scale same-scene empty and all three current foods',async({browser})=>{
 test.setTimeout(35000);const f=await owner.seed(),{c,p}=await openFoodContext(browser,f);
 try{await bootFood(p,f);const initial=await foodState(p,'empty'),projection=structuredClone(initial.projection);await view(p);const stage=await p.locator('.cy-scene').boundingBox(),anchor=project(initial,80,82,0),clip={x:Math.floor(stage.x+anchor.x-88),y:Math.floor(stage.y+anchor.y-92),width:176,height:128};assert(clip.x>=stage.x&&clip.y>=stage.y&&clip.x+clip.width<=stage.x+stage.width&&clip.y+clip.height<=stage.y+stage.height,'True-scale contact crop must remain inside the actual stage');await capture(p,'food-state-composition-reference-390x844-dpr2');
  for(const state of ['empty','kibble','berry_plate','bonito_bowl']){
   const s=state==='empty'?initial:await buyFill(p,f,owner,state);assert.deepEqual(s.projection,projection,'State comparisons must retain the same camera and crop');caps(s);
   const file='food-state-'+state+'-390x844-dpr2-native.png';await p.screenshot({path:path.join(OUT,file),clip,scale:'device'});const metadata=await sharp(path.join(OUT,file)).metadata();assert.equal(metadata.width,352);assert.equal(metadata.height,256);report.captures.push(file);report.food.nativeStateCaptures.push({state,file,viewport:{width:390,height:844},deviceScaleFactor:2,clip,encodedPixels:{width:352,height:256},projection:s.projection,food:s.renderer.canonicalFood.binding,worldRaster:{policy:s.resources.rasterPolicy,width:s.resources.backingWidth,height:s.resources.backingHeight,rendererPixelRatio:1},contact:'Unaltered device-scale screenshot crop, no enlargement. World model remains the fixed DPR1 reference raster; this is not a native-DPR2 model claim. Human review required.'});
  }
  report.food.sections.states='passed';
 }catch(e){report.food.sections.states='failed';await captureFailureDiagnostics(p,'food-states-failure');throw e;}finally{await c.close();}
});

async function occupied(browser,request,width,height,escape){
 const f=await owner.seed({food:false});await realMutation(request,f,'yard.placeGoodie',{slotId:'canonical:prior-food-overlap',goodieId:'leaf_pot',x:80,y:82});const before=structuredClone(canonicalRows(await owner.saved(f)));assert.equal(before.length,1);await owner.mode(f,true);
 const {c,p}=await openFoodContext(browser,f,{viewport:{width,height},deviceScaleFactor:width===390?2:1}),label=`food-occupied-${width}x${height}-ru`;
 try{await bootFood(p,f);await expect.poll(async()=>(await scene(p))?.canonicalFood?.reason).toBe('CANONICAL_FOOD_SOCKET_OCCUPIED');assert.deepEqual(canonicalRows(await owner.saved(f)),before);const screen=await view(p);(report.food.domObservations??=[]).push(await observeFoodHUD(p,label+'-occupied'));await expect(p.locator(YARD_STATUS)).toHaveText('Место миски занято');await capture(p,label+'-stage');
  await p.locator('[data-nav-item="food"]').click();const note=p.locator('[data-canonical-food-status="true"]');await expect(note).toBeVisible();await expect(note).toContainText('canonical:prior-food-overlap');await expect(p.locator('[data-yard-action="set-food"]')).toBeDisabled();await expect(p.locator('.cy-dialog select')).toBeDisabled();await capture(p,label+'-food-reason');await auditDialogControls(p,label+'-food',report.controlAudits);await closePanel(p);
  await placedPanel(p);await expect(p.locator('[data-canonical-food-conflict="true"]')).toContainText('canonical:prior-food-overlap');for(const action of ['move','pickup']){const button=p.locator(`[data-yard-action="${action}"]`);await expect(button).toBeEnabled();await button.click({trial:true});}await capture(p,label+'-decor-escape');await auditDialogControls(p,label+'-decor',report.controlAudits);await closePanel(p);
  if(escape==='move'){await move(p,0,98,118);await expect.poll(async()=>canonicalRows(await owner.saved(f))[0]?.x).toBe(98);}else{await pickup(p);await expect.poll(async()=>canonicalRows(await owner.saved(f)).length).toBe(0);}
  await foodState(p,'empty');const saved=await owner.saved(f);assert.equal(saved.yard.currencies.treats,280);assert.equal(saved.yard.currencies.shinyTreats,2);assert.equal(saved.yard.bowls.length,1);
  report.food.affectedHud.push({label,status:'passed',case:'pre-existing v1 overlap',screen,originalRow:before[0],actualEscape:escape,retainedUntilExplicitAction:true});
 }catch(e){await captureFailureDiagnostics(p,label+'-failure');throw e;}finally{await c.close();}
}
async function retained(browser){
 const f=await owner.seed({food:false}),{c,p}=await openFoodContext(browser,f),attempts=[],attemptWires=[];const pattern=ORIGIN+'/api/player/mutate';let blocked=true;
 try{await bootFood(p,f);await p.route(pattern,async route=>{const command=route.request().postDataJSON();if(blocked&&command.action==='yard.placeGoodie'){attempts.push(structuredClone(command));attemptWires.push(route.request().postData());return route.abort('connectionfailed');}return route.continue();});
  await place(p,98,118);await expect.poll(()=>attempts.length).toBeGreaterThan(0);await expect.poll(async()=>{const data=await outbox(p,f.id);return data?.items?.some(i=>i.clientActionId===attempts[0].clientActionId&&i.status==='pending');}).toBe(true);
  const original=attempts[0];assert.match(original.clientActionId,/^yard-v2:canonical-v1\//);assert.equal(canonicalRows(await owner.saved(f)).length,0);const superseded=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.clientActionId===original.clientActionId&&r.status()===400);superseded.catch(()=>{});await owner.mode(f,true);blocked=false;
  await waitForYardReady(p,f,()=>p.reload());await enter(p);await ready(p);await expect.poll(async()=>{const data=await outbox(p,f.id);return data?.items?.find(i=>i.clientActionId===original.clientActionId)?.requiresUserDecision;},{timeout:18000}).toBe(true);
  const rejectedResponse=await superseded,replayWire=rejectedResponse.request().postData(),replayCommand=rejectedResponse.request().postDataJSON(),rejectionBody=await rejectedResponse.json();assert.equal(replayWire,attemptWires[0]);assert.deepEqual(replayCommand,original);assert.equal(rejectionBody.error,'CANONICAL_COMMAND_SUPERSEDED');assert.equal(rejectionBody.details.disposition,'retained-user-decision');assert.equal(rejectionBody.details.actionId,original.clientActionId);const replayEvidence={httpStatus:400,byteIdenticalToOriginal:true,requestSha256:createHash('sha256').update(replayWire).digest('hex'),responseSha256:createHash('sha256').update(await rejectedResponse.body()).digest('hex'),response:rejectionBody};
  const rejected=structuredClone((await outbox(p,f.id)).items.find(i=>i.clientActionId===original.clientActionId));assert.equal(rejected.status,'failed');assert.equal(rejected.blockedReason,'CANONICAL_COMMAND_SUPERSEDED');assert.deepEqual(rejected.payload,original.payload);assert.equal(canonicalRows(await owner.saved(f)).length,0);
  await waitForYardReady(p,f,()=>p.reload());await enter(p);await ready(p);assert.deepEqual((await outbox(p,f.id)).items.find(i=>i.clientActionId===original.clientActionId),rejected);
  for(const[width,height]of [[320,568],[390,844],[568,320]]){
   await p.setViewportSize({width,height});await ready(p);const screen=await view(p),label=`food-retained-${width}x${height}-ru`;await p.locator('[data-nav-item="decor"]').click();await expect(p.locator('[data-yard-rejected-intent]')).toHaveCount(1);
   const notice=p.locator(`[data-yard-rejected-intent="${original.clientActionId}"]`);await expect(notice).toBeVisible();const disclosure=notice.locator('summary'),disclosureAudit={label:label+'-disclosure'};await reachableControl(disclosure,disclosureAudit);report.controlAudits.push(disclosureAudit);await disclosure.focus();await expect(disclosure).toBeFocused();await disclosure.press('Enter');await expect(notice).toHaveAttribute('open','');await expect(notice).toContainText(original.clientActionId);await capture(p,label+'-rejection');await p.locator('[data-decor-tab="inventory"]').click();await p.locator('.cy-catalog-choice[data-goodie-id="leaf_pot"]').click();await expect(p.locator('[data-yard-action="place"]')).toBeEnabled();await auditDialogControls(p,label,report.controlAudits);await closePanel(p);report.food.affectedHud.push({label,status:'passed',case:'durable stale-v1 rejection',screen,originalNonce:original.clientActionId,freshExplicitActionEnabled:true});
  }
  await p.setViewportSize({width:390,height:844});await ready(p);
  const mutation=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/player/mutate'&&r.request().postDataJSON()?.action==='yard.placeGoodie');mutation.catch(()=>{});await place(p,98,118);const response=await mutation;assert.equal(response.status(),200);const next=response.request().postDataJSON();assert.match(next.clientActionId,/^yard-v2:canonical-v2\//);assert.notEqual(next.clientActionId,original.clientActionId);await expect.poll(async()=>canonicalRows(await owner.saved(f)).length).toBe(1);assert.deepEqual((await outbox(p,f.id)).items.find(i=>i.clientActionId===original.clientActionId),rejected);
  // UI prevents a fresh command from occupying the food union. This is a user gesture, not a synthetic store edit.
  await placedPanel(p);await p.locator('[data-yard-action="move"]').click();await dragTo(p,80,82);await expect(p.locator('[data-yard-action="commit-placement"]')).toBeDisabled();assert.equal((await scene(p)).lastFrame.ghost.valid,false);await capture(p,'food-reserved-union-invalid-placement');await p.locator('[data-yard-action="cancel-placement"]').click();assert.equal(canonicalRows(await owner.saved(f))[0].x,98);
  report.food.retainedIntent={original,rejected,replayEvidence,freshCommand:next,preservedAfterReload:true,preservedAfterFreshSuccess:true,unionBlockedInActualEditor:true};
 }catch(e){await captureFailureDiagnostics(p,'food-retained-failure');throw e;}finally{await c.close();}
}

test('occupied and retained-error controls at320,390 and568landscape RU with real escape',async({browser,request})=>{
 test.setTimeout(90000);try{await occupied(browser,request,320,568,'move');await occupied(browser,request,390,844,'pickup');await occupied(browser,request,568,320,'move');await retained(browser);report.food.sections.errors='passed';}catch(e){report.food.sections.errors='failed';throw e;}
});
