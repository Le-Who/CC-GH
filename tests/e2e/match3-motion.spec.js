import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { mountHomePlayerFixture } from './helpers/homePlayerFixture.js';
import { selectHomeGame, openHome } from './helpers/home.js';
import { match3MotionBoard as fixtureBoard, armMatch3RefillSeed, installMatch3RefillSeed } from './helpers/match3MotionFixture.js';
import { MATCH3_RENDER_PIXEL_BUDGET, match3RenderResolution } from '../../src/games/match3/match3RenderBudget.js';

// Real app, renderer, inputs, controller and production action dispatcher.
// Only the initial player/board and refill RNG are deterministic test inputs.
// Videos run at normal wall-clock speed; no clock mocking, CSS speed-up, or scene injection.
test.use({ serviceWorkers: 'block', video: 'on', trace: 'retain-on-failure', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const viewports = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
const fixturePlayers = new WeakMap();
test.afterEach(async ({page},testInfo)=>{
  const observed = await page.evaluate(()=>{
    const canvas=document.querySelector('[data-game-shell="match3"] canvas');
    return {seed:window.__match3RefillSeed,phases:window.__match3MotionPhases,samples:window.__match3MotionSamples,canvas:canvas?{...canvas.dataset,pixelWidth:canvas.width,pixelHeight:canvas.height}:null};
  }).catch(error=>({captureError:error.message}));
  const game=fixturePlayers.get(page)?.match3?.currentGame;
  const evidence={title:testInfo.title,retry:testInfo.retry,status:testInfo.status,game:game?{score:game.score,movesLeft:game.movesLeft,combo:game.combo}:null,...observed};
  const path=testInfo.outputPath('match3-motion-diagnostics.json');
  await writeFile(path,JSON.stringify(evidence,null,2));
  await testInfo.attach('match3-motion-diagnostics',{path,contentType:'application/json'});
});
async function loadFixture(page, player) {
  // The fixture intentionally aborts realtime transport. "ready" is transient:
  // a successful HTTP snapshot is followed by the expected offline socket state.
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/player/snapshot'),
    page.goto('/'),
  ]);
  expect(response.status()).toBe(200);
  expect((await response.json()).player.id).toBe(player.id);
}
async function boot(page, viewport, reduced = false, moves = 30, initialBoard = fixtureBoard()) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('gh_dev_user_id','match3-motion-ci'));
  await page.addInitScript(installMatch3RefillSeed);
  const player = await mountHomePlayerFixture(page);
  fixturePlayers.set(page,player);
  player.match3.currentGame = { board:initialBoard,mode:'classic',score:0,movesLeft:moves,combo:0,boosters:{bomb:3,lightning:3,rainbow:2,hammer:3} };
  await page.route('**/api/leaderboard',route=>route.fulfill({contentType:'application/json',body:'[]'}));
  await loadFixture(page, player);
  await selectHomeGame(page,'match3');
  const stage=page.locator('[data-game-shell="match3"]'),canvas=stage.locator('canvas');
  await expect(stage).toHaveAttribute('data-m3-phase','playing');
  await expect(canvas).toHaveAttribute('data-match3-motion-phase','idle');
  await expect(canvas).toHaveAttribute('data-match3-input-locked','false');
  await canvas.evaluate(node=>{
    window.__match3MotionPhases=[];
    window.__match3MotionSamples=[];
    let previous='';
    const record=()=>{
      const d=node.dataset,phase=d.match3MotionPhase;
      window.__match3MotionSamples.push({phase,id:d.match3MotionId,elapsed:Number(d.match3MotionElapsed),duration:Number(d.match3MotionDuration),at:performance.now()});
      if(phase!==previous){window.__match3MotionPhases.push(phase);previous=phase;}
    };
    record();new MutationObserver(record).observe(node,{attributes:true,attributeFilter:['data-match3-motion-phase']});
  });
  return {stage,canvas,player};
}
async function cell(page,canvas,x,y) {
  const point=await canvas.evaluate((node,{x,y})=>{const r=node.getBoundingClientRect(),d=node.dataset,c=Number(d.match3BoardSize)/8;return{x:r.x+Number(d.match3BoardLeft)+(x+.5)*c,y:r.y+Number(d.match3BoardTop)+(y+.5)*c};},{x,y});
  await page.touchscreen.tap(point.x,point.y);
}
async function swap(page,canvas,from,to,seed=null) {
  await cell(page,canvas,from.x,from.y);
  if(seed!==null) await page.evaluate(armMatch3RefillSeed,seed);
  await cell(page,canvas,to.x,to.y);
}
async function settled(canvas) {
  await expect(canvas).toHaveAttribute('data-match3-motion-phase','idle',{timeout:10000});
  await expect(canvas).toHaveAttribute('data-match3-input-locked','false');
}
async function seedRestored(page) {
  await expect.poll(()=>page.evaluate(()=>window.__match3RefillSeed.used && window.__match3RefillSeed.restored)).toBe(true);
}
async function attachFrame(page,testInfo,name) {
  // Explicit device-scale PNGs are preserved separately from downscaled video.
  const path=testInfo.outputPath(`${name}.png`);
  await page.screenshot({path,scale:'device'});
  await testInfo.attach(name,{path,contentType:'image/png'});
}

for(const [width,height] of viewports) test(`Match3 1x swap invalid cascade and refill ${width}x${height}`,async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const {canvas,stage,player}=await boot(page,{width,height});
  await attachFrame(page,testInfo,'before-motion');
  await swap(page,canvas,{x:5,y:0},{x:6,y:0});
  await expect.poll(()=>page.evaluate(()=>window.__match3MotionPhases.includes('invalid'))).toBe(true);
  await settled(canvas);
  expect(player.match3.currentGame.movesLeft).toBe(30);
  await swap(page,canvas,{x:1,y:6},{x:1,y:7},2);
  await expect.poll(()=>page.evaluate(()=>window.__match3MotionPhases.includes('fall'))).toBe(true);
  await settled(canvas);
  await expect.poll(()=>player.match3.currentGame.movesLeft).toBe(29);
  expect(player.match3.currentGame.score).toBe(90);
  await seedRestored(page);
  const phases=await page.evaluate(()=>window.__match3MotionPhases);
  expect(phases).toContain('swap');expect(phases.filter(p=>p==='clear').length).toBeGreaterThanOrEqual(2);
  expect(phases.filter(p=>p==='fall').length).toBeGreaterThanOrEqual(2);
  const timing=await page.evaluate(()=>{
    const samples=window.__match3MotionSamples,start=samples.findIndex(s=>s.id?.startsWith('cascade_'));
    const end=samples.slice(start+1).find(s=>s.phase==='idle');
    return {wallMs:end.at-samples[start].at,plannedMs:samples[start].duration};
  });
  // Allow one late recording frame, never the old 6–7 second slow-motion plan.
  expect(timing.wallMs).toBeLessThanOrEqual(timing.plannedMs+500);
  await testInfo.attach('motion-timing',{body:JSON.stringify(timing),contentType:'application/json'});
  const bounds=await canvas.evaluate(node=>{const r=node.getBoundingClientRect(),d=node.dataset;return {left:r.x+Number(d.match3BoardLeft),top:r.y+Number(d.match3BoardTop),size:Number(d.match3BoardSize),overflow:document.documentElement.scrollWidth>innerWidth};});
  expect(bounds.overflow).toBe(false);expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.left+bounds.size).toBeLessThanOrEqual(width+1);
  const hud=await stage.locator('.m3-hud').boundingBox();
  expect(bounds.top>=hud.y+hud.height || bounds.left+bounds.size<=hud.x || hud.x+hud.width<=bounds.left).toBe(true);
  await attachFrame(page,testInfo,'after-cascade');
  expect(errors).toEqual([]);
});

for(const [width,height] of [[320,568],[390,844],[1280,720]]) test(`Match3 native-DPR crystal frame and special-art sharpness ${width}x${height}`,async({page},testInfo)=>{
  const board=fixtureBoard();
  ['special_row','special_column','special_blast','special_colour'].forEach((type,x)=>{board[2][x]=type;});
  ['drop_gold','drop_seeds','drop_energy'].forEach((type,x)=>{board[4][x]=type;});
  const {canvas}=await boot(page,{width,height},false,30,board);
  await settled(canvas);
  const render=await canvas.evaluate(node=>{
    const r=node.getBoundingClientRect(),gl=node.getContext('webgl2')||node.getContext('webgl');
    return {cssWidth:r.width,cssHeight:r.height,pixelWidth:node.width,pixelHeight:node.height,dpr:devicePixelRatio,antialias:gl.getContextAttributes().antialias};
  });
  expect(render.dpr).toBe(2);expect(render.antialias).toBe(false);
  await expect(canvas).toHaveAttribute('data-match3-chrome-cached','true');
  expect(render.pixelWidth/render.cssWidth).toBeCloseTo(match3RenderResolution(render.cssWidth,render.cssHeight,2),2);
  expect(render.pixelWidth*render.pixelHeight).toBeLessThanOrEqual(MATCH3_RENDER_PIXEL_BUDGET+4000);
  if(width<500) expect(render.pixelWidth/render.cssWidth).toBeCloseTo(2,2);
  await attachFrame(page,testInfo,'native-dpr-specials-ready');
  await testInfo.attach('render-policy',{body:JSON.stringify(render),contentType:'application/json'});
});

test('Match3 live cascade pauses across Home reentry and resize then resumes without early input',async({page},testInfo)=>{
  const {stage,canvas,player}=await boot(page,{width:390,height:844});
  const pause=await stage.locator('[data-game-pause="true"]').boundingBox();
  await swap(page,canvas,{x:1,y:6},{x:1,y:7},2);
  // The static control was measured before the move. Dispatch the next native
  // touch immediately, without adding polling/actionability frames mid-cascade.
  await page.touchscreen.tap(pause.x+pause.width/2,pause.y+pause.height/2);
  await expect(stage).toHaveAttribute('data-m3-phase','paused');
  await expect(canvas).toHaveAttribute('data-match3-input-locked','true');
  const age=await canvas.getAttribute('data-match3-motion-elapsed');
  await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute('data-match3-motion-elapsed',age);
  await page.setViewportSize({width:844,height:390});
  await expect(canvas).toHaveAttribute('data-match3-motion-elapsed',age);
  await attachFrame(page,testInfo,'paused-after-resize');
  await openHome(page);
  await expect(page.getByTestId('home-catalogue')).toBeVisible();
  await page.waitForTimeout(350);
  await selectHomeGame(page,'match3');
  await expect(stage).toHaveAttribute('data-m3-phase','paused');
  await expect(canvas).toHaveAttribute('data-match3-motion-elapsed',age);
  await stage.getByRole('button',{name:/^(Resume|Продолжить)$/}).click();
  await settled(canvas);
  await seedRestored(page);
  await expect.poll(()=>player.match3.currentGame.movesLeft).toBe(29);
  expect(player.match3.currentGame.score).toBe(90);
  await attachFrame(page,testInfo,'resumed-final-board');
});

test('Match3 reduced-motion cascade settles and final-move animation finishes before the result menu',async({page},testInfo)=>{
  const {stage,canvas,player}=await boot(page,{width:360,height:800},true,1);
  await expect(canvas).toHaveAttribute('data-match3-reduced-motion','true');
  await swap(page,canvas,{x:1,y:6},{x:1,y:7},2);
  await expect.poll(()=>page.evaluate(()=>window.__match3MotionPhases.includes('clear'))).toBe(true);
  await expect(stage).toHaveAttribute('data-m3-phase','menu',{timeout:10000});
  await expect(canvas).toHaveAttribute('data-match3-motion-phase','idle');
  await expect.poll(()=>player.match3.currentGame).toBeNull();
  await seedRestored(page);
  await attachFrame(page,testInfo,'reduced-motion-final-result');
});

test('Match3 reload of a final accepted zero-move save cannot grant an extra scoring move',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('gh_dev_user_id','match3-terminal-reload-ci'));
  const player=await mountHomePlayerFixture(page);
  // This is the production syncMode projection: metrics in currentGame, board in savedModes.
  player.match3.currentGame={mode:'classic',score:90,movesLeft:0,combo:2};
  player.match3.savedModes=JSON.stringify({classic:{board:fixtureBoard(),score:90,movesLeft:0,combo:2}});
  const mutations=[];page.on('request',request=>{if(request.url().endsWith('/api/player/mutate'))mutations.push(request.postDataJSON());});
  await loadFixture(page, player);
  await selectHomeGame(page,'match3');
  const stage=page.locator('[data-game-shell="match3"]');
  await expect(stage).toHaveAttribute('data-m3-phase','menu');
  await expect.poll(()=>player.match3.currentGame).toBeNull();
  expect(mutations.filter(item=>item.action==='match3.end')).toHaveLength(1);
  expect(mutations.find(item=>item.action==='match3.end').payload.score).toBe(90);
  expect(mutations.filter(item=>item.action==='match3.syncMode')).toHaveLength(0);
});
