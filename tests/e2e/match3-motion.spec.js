import { test, expect } from '@playwright/test';
import { mountHomePlayerFixture } from './helpers/homePlayerFixture.js';
import { selectHomeGame, openHome } from './helpers/home.js';

// Real app, renderer, inputs, controller and production action dispatcher.
// Only the initial player/board and refill RNG are deterministic test inputs.
// Videos run at normal wall-clock speed; no clock mocking, CSS speed-up, or scene injection.
test.use({ serviceWorkers: 'block', video: 'on', trace: 'retain-on-failure', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const viewports = [[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]];
const fixtureBoard = () => {
  const board = Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>['fire','water','earth','air','light','dark'][(x+y*2)%6]));
  board[7][0]='fire'; board[7][1]='water'; board[7][2]='fire'; board[6][1]='fire';
  return board;
};
async function boot(page, viewport, reduced = false, moves = 30) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('gh_dev_user_id','match3-motion-ci'));
  const player = await mountHomePlayerFixture(page);
  player.match3.currentGame = { board:fixtureBoard(),mode:'classic',score:0,movesLeft:moves,combo:0,boosters:{bomb:3,lightning:3,rainbow:2,hammer:3} };
  await page.route('**/api/leaderboard',route=>route.fulfill({contentType:'application/json',body:'[]'}));
  await page.goto('/');
  await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});
  await selectHomeGame(page,'match3');
  const stage=page.locator('[data-game-shell="match3"]'),canvas=stage.locator('canvas');
  await expect(stage).toHaveAttribute('data-m3-phase','playing');
  await expect(canvas).toHaveAttribute('data-match3-motion-phase','idle');
  await expect(canvas).toHaveAttribute('data-match3-input-locked','false');
  await canvas.evaluate(node=>{
    window.__match3MotionPhases=[];
    let previous='';
    const record=()=>{const phase=node.dataset.match3MotionPhase;if(phase!==previous){window.__match3MotionPhases.push(phase);previous=phase;}};
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
  if(seed!==null) await page.evaluate(seed=>{let n=seed;window.__match3OriginalRandom??=Math.random;Math.random=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};},seed);
  await cell(page,canvas,to.x,to.y);
}
async function settled(canvas) {
  await expect(canvas).toHaveAttribute('data-match3-motion-phase','idle',{timeout:10000});
  await expect(canvas).toHaveAttribute('data-match3-input-locked','false');
}
async function attachFrame(page,testInfo,name) {
  await testInfo.attach(name,{body:await page.screenshot(),contentType:'image/png'});
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
  const phases=await page.evaluate(()=>window.__match3MotionPhases);
  expect(phases).toContain('swap');expect(phases.filter(p=>p==='clear').length).toBeGreaterThanOrEqual(2);
  expect(phases.filter(p=>p==='fall').length).toBeGreaterThanOrEqual(2);
  await expect.poll(()=>player.match3.currentGame.movesLeft).toBe(29);
  expect(player.match3.currentGame.score).toBe(90);
  const bounds=await canvas.evaluate(node=>{const r=node.getBoundingClientRect(),d=node.dataset;return {left:r.x+Number(d.match3BoardLeft),top:r.y+Number(d.match3BoardTop),size:Number(d.match3BoardSize),overflow:document.documentElement.scrollWidth>innerWidth};});
  expect(bounds.overflow).toBe(false);expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.left+bounds.size).toBeLessThanOrEqual(width+1);
  const hud=await stage.locator('.m3-hud').boundingBox();
  expect(bounds.top>=hud.y+hud.height || bounds.left+bounds.size<=hud.x || hud.x+hud.width<=bounds.left).toBe(true);
  await attachFrame(page,testInfo,'after-cascade');
  expect(errors).toEqual([]);
});

test('Match3 live cascade pauses across Home reentry and resize then resumes without early input',async({page},testInfo)=>{
  const {stage,canvas,player}=await boot(page,{width:390,height:844});
  await swap(page,canvas,{x:1,y:6},{x:1,y:7},2);
  // Pause as soon as the real controller has accepted the second tap.
  await stage.locator('[data-game-pause="true"]').click();
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
  await page.goto('/');await expect(page.locator('.status-dot.ready')).toBeVisible({timeout:15000});
  await selectHomeGame(page,'match3');
  const stage=page.locator('[data-game-shell="match3"]');
  await expect(stage).toHaveAttribute('data-m3-phase','menu');
  await expect.poll(()=>player.match3.currentGame).toBeNull();
  expect(mutations.filter(item=>item.action==='match3.end')).toHaveLength(1);
  expect(mutations.find(item=>item.action==='match3.end').payload.score).toBe(90);
  expect(mutations.filter(item=>item.action==='match3.syncMode')).toHaveLength(0);
});
