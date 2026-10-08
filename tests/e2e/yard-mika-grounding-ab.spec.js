import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startSwFixture} from './helpers/swFixture.mjs';
import {applyActionWithReceipt} from '../../routes/player.js';
const SHA='2249774f8ced124451d3c46a8a69bc06a9889c7d9cc31c836a6dd868fd96f084',ASSET='/assets/yard-mika-p2-qa/p2.glb',ENCODED=3671320;
const read=page=>page.evaluate(()=>window.__yardMikaQa?.snapshot());
const qa=async page=>(await read(page))?.scene?.qaMika;
async function setup(page){
 const fixture=await startSwFixture({gameActions:true,gardenMode:'r2'}),receipts=[],errors=[],commands=[],assetResponses=[],assetRequests=[];
 try{
  // Existing source actions, ephemeral account only. Do not edit placement arrays.
  for(const [goodieId,slotId,x,y]of [['yarn_mouse','qa-mouse',45,45],['sun_cushion','qa-cushion',54,66]]){
   const payload={goodieId,slotId,x,y},result=await applyActionWithReceipt(fixture.player('account-a'),'yard.placeGoodie',payload,{clientActionId:'yard-v2:mika-fixture-'+slotId,gardenR2Enabled:true});
   receipts.push({action:'yard.placeGoodie',payload,status:result.status,body:result.body});assert.equal(result.status,200);assert.equal(result.body.error,undefined);
  }
  const initial=structuredClone(fixture.player('account-a').yard);assert.equal(initial.placedGoodies.length,2);
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',request=>{if(new URL(request.url()).pathname===ASSET)assetRequests.push(request.url());});page.on('response',response=>{if(new URL(response.url()).pathname===ASSET)assetResponses.push(response);});
  await page.route('**/api/player/mutate',async route=>{const body=route.request().postDataJSON();if(body?.action?.startsWith('yard.')){commands.push(body);return route.abort('blockedbyclient');}return route.continue();});
  await page.addInitScript(()=>{window.__mikaNormalCanvasDraws=0;const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){const result=original.apply(this,args);if(this.canvas.matches?.('.cy-scene canvas'))window.__mikaNormalCanvasDraws++;return result;};});
  await page.addInitScript(()=>{localStorage.setItem('gh_dev_user_id','fixture-a');localStorage.setItem('garden_shelf_language','en');});
  return{fixture,receipts,initial,errors,commands,assetResponses,assetRequests};
 }catch(e){try{await fixture.close();}catch(cleanup){e.fixtureCleanupError=String(cleanup.stack||cleanup);}e.seedReceipts=receipts;throw e;}
}
async function readyRunning(page){
 await expect(page.locator('.cy-app')).toBeVisible({timeout:30000});
 await expect.poll(async()=>{const d=await qa(page);if(d&&['blocked','unavailable','aborted','complete'].includes(d.phase))throw Error('Cruise never observed running: '+JSON.stringify(d));return d?.phase==='running'&&d.frames>0;},{timeout:30000,intervals:[25,50,100]}).toBe(true);
 const d=await qa(page);assert.equal(d.normalCamera,true);assert.equal(d.diagnosticCameraFit,false);assert.equal(d.rootOwner,'navigation');assert.equal(d.assetSha256,SHA);assert.equal(d.bones,22);
 const view=(await read(page)).scene.view;assert.equal(view.props.length,2);return d;
}
function unchanged(context){assert.deepEqual(context.commands,[],'No browser Yard commands');assert.deepEqual(context.fixture.player('account-a').yard,context.initial,'No Yard mutation after source-backed fixture setup');assert.deepEqual(context.errors,[]);}

function installStillProbe(){
 const native=new WeakSet(),get=HTMLCanvasElement.prototype.getContext,draw=CanvasRenderingContext2D.prototype.drawImage;
 HTMLCanvasElement.prototype.getContext=function(type,...args){const value=get.call(this,type,...args);if(value&&/^(webgl|webgl2)$/.test(type))native.add(this);return value;};
 CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
  const value=draw.call(this,image,...args);
  if(window.__groundingStill||!this.canvas.matches?.('.cy-scene canvas')||!native.has(image))return value;
  const d=window.__yardMikaQa?.snapshot()?.scene?.qaMika;
  if(d?.phase!=='running'||d.frames<2)return value;
  const canvas=this.canvas,scratch=document.createElement('canvas');scratch.width=image.width;scratch.height=image.height;
  draw.call(get.call(scratch,'2d'),image,0,0);const alpha=scratch.toDataURL('image/png').split(',')[1];
  queueMicrotask(()=>{window.__groundingStill={diagnostics:structuredClone(d),normal:canvas.toDataURL('image/png').split(',')[1],alpha,canvas:{width:canvas.width,height:canvas.height},native:{width:scratch.width,height:scratch.height}};});return value;
 };
}
for(const variant of ['baseline','warm','contact','combined'])for(const sampleTime of [.2,2,3.6])test(`Mika grounding ${variant} pose ${sampleTime}`,async({page},info)=>{
 const c=await setup(page);let error;
 try{
  await page.addInitScript(installStillProbe);
  await page.goto(c.fixture.origin+`/?tab=room&mikaGrounding=${variant}&mikaGroundingTime=${sampleTime}`);
  await readyRunning(page);await expect.poll(()=>page.evaluate(()=>Boolean(window.__groundingStill)),{timeout:10000}).toBe(true);
  const result=await page.evaluate(()=>window.__groundingStill),d=result.diagnostics;
  assert.equal(d.comparison.variant,variant);assert.equal(d.comparison.sampleTime,sampleTime);assert.equal(d.resources.rasterDpr,1);
  assert.equal(d.assetSha256,SHA);assert.equal(c.assetResponses.length,1);assert.equal(createHash('sha256').update(await c.assetResponses[0].body()).digest('hex'),SHA);unchanged(c);
  await info.attach(`${info.project.name}-${variant}-${sampleTime}-normal.png`,{body:Buffer.from(result.normal,'base64'),contentType:'image/png'});
  await info.attach(`${info.project.name}-${variant}-${sampleTime}-actor.png`,{body:Buffer.from(result.alpha,'base64'),contentType:'image/png'});
  delete result.normal;delete result.alpha;
  await info.attach('grounding-receipt.json',{body:Buffer.from(JSON.stringify({base:'99e2aa0a101687a19126cb2b623619548ba4b555',revision:process.env.GITHUB_SHA,project:info.project.name,variant,sampleTime,seedReceipts:c.receipts,initialYard:c.initial,commands:c.commands,errors:c.errors,result,scope:'Exact fixed sampler instants in normal Yard; camera, GLB, gait, route, props and raster DPR unchanged. No live shipping, motion, performance, whole-Yard or physical-device acceptance.'},null,2)),contentType:'application/json'});
 }catch(e){error=e;throw e;}finally{try{await c.fixture.close();}catch(e){if(!error)throw e;}}
});
