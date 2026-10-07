import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as engine from '../src/game-core/bubbo/engine.js';
import * as aim from '../src/games/bubbo/bubboAim.js';
import * as motion from '../src/games/bubbo/bubboMotion.js';
import {composeBubbo,bubboFieldGeometry} from '../src/games/bubbo/bubboComposition.js';
import defaults from '../src/app/hud-layout/defaultLayouts/bubbo.json' with {type:'json'};
const require=createRequire(import.meta.url);
const reference=require('./fixtures/bubbo-v2-preview-reference.cjs')(engine,defaults);
const clean=value=>JSON.parse(JSON.stringify(value));
const same=(actual,expected)=>assert.deepEqual(clean(actual),clean(expected));
const viewports=[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873],[520,216]];
test('geometry/composition preserves frozen preview except corrected visual loss boundary',()=>{
 for(const[width,height]of viewports)for(const safe of [{},{top:24,bottom:34,left:16,right:16}]){
  same(composeBubbo({width,height,safe}),reference.compose({width,height,safe}));
  const field=composeBubbo({width,height,safe}).field;
  const {dangerY,...geometry}=bubboFieldGeometry(field.width,field.height);
  const {dangerY:oldLine,...original}=reference.geometry(field.width,field.height);
  same(geometry,original);
  assert.ok(dangerY>oldLine);
  assert.ok(Math.abs(dangerY-(geometry.top+9*geometry.step+geometry.radius))<1e-8);
 }
});
test('recovered aim/collision matches frozen preview across 15840 seeded traces',()=>{
 let count=0;
 for(let seed=0;seed<20;seed++)for(const[width,height]of viewports){
  const field=composeBubbo({width,height}).field,geometry=bubboFieldGeometry(field.width,field.height);
  const run=engine.advanceBubboPressure(engine.createBubboRun('differential-'+seed),seed*437);
  for(let step=0;step<72;step++){
   const angle=-Math.PI+.18+step*(Math.PI-.36)/71,state={...run,current:engine.BUBBO_COLORS[seed%5],aimAssist:seed%2===0};
   same(aim.traceBubboShot(state,geometry,angle),reference.trace(state,geometry,angle));count++;
  }
 }
 assert.equal(count,15840);
});
test('path interpolation, keyboard controls and resizing match the frozen preview',()=>{
 const old=bubboFieldGeometry(304,360),next=bubboFieldGeometry(400,590),run=engine.createBubboRun('motion');
 for(let angle=-2.9;angle<-.2;angle+=.07){
  const shot=aim.traceBubboShot(run,old,angle);if(!shot)continue;
  same(aim.remapBubboPath(shot.path,old,next),reference.remap(shot.path,old,next));
  for(const progress of [-1,0,.1,.5,.99,1,2])same(aim.pointAlongBubboPath(shot.path,progress),reference.point(shot.path,progress));
  const flight=motion.createBubboFlight(shot,old,'mint','bomb');same(flight,reference.flight(shot,old,'mint','bomb'));
  for(const dt of [0,16,90,1000])for(const playing of[false,true])same(motion.advanceBubboFlight(flight,dt,playing),reference.advance(flight,dt,playing));
  same(motion.resizeBubboFlight(flight,next),reference.resize(flight,next));
 }
 for(const key of['ArrowLeft','ArrowRight','Enter',' ','Escape','x'])for(const shiftKey of[false,true])for(const repeat of[false,true])same(aim.bubboKeyboardIntent(key,-1.5,{shiftKey,repeat}),reference.keyboard(key,-1.5,{shiftKey,repeat}));
});
test('elapsed clock matches preview through fractional time, pauses, deferred pressure and frame caps',()=>{
 let clock={timedDebt:0,pressureDebt:0},timeLeft=90;
 for(let step=0;step<1000;step++){
  const elapsed=[-2,0,16,99,101,333,999,5000][step%8],opts={mode:step%17?'timed':'classic',timeLeft,flightBusy:step%5!==0,playing:step%11!==0};
  const actual=motion.advanceBubboClock(clock,elapsed,opts);same(actual,reference.clock(clock,elapsed,opts));clock=actual.clock;timeLeft=actual.timeLeft;
 }
 let state={timedDebt:0,pressureDebt:0};let remaining=90;
 for(let i=0;i<25;i++){const tick=motion.advanceBubboClock(state,400,{mode:'timed',timeLeft:remaining});state=tick.clock;remaining=tick.timeLeft;}
 assert.equal(remaining,80,'frequent score renders cannot reset the countdown');
 const paused=motion.advanceBubboClock(state,9999,{mode:'timed',timeLeft:remaining,playing:false});assert.equal(paused.timeLeft,80);
});

test('production shell consumes all four safe insets exactly once',async()=>{
 const {remainingBubboSafeInsets}=await import('../src/games/bubbo/bubboBoundary.js');
 assert.deepEqual(remainingBubboSafeInsets({top:24,bottom:34,left:20,right:16}),{top:0,bottom:0,left:0,right:0});
 assert.deepEqual(remainingBubboSafeInsets({left:-2,right:'8'}),{top:0,bottom:0,left:0,right:0});
});

