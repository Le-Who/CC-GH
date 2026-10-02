import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeMatch3Boosters} from '../src/game-core/match3/engine.js';
import {estimateMatch3CascadeLockMs} from '../src/game-core/match3/animation.js';
import {selectMatch3InitialRun} from '../src/games/match3/selectMatch3Run.js';
import {getRewardChestProgress} from '../game-logic/hud-bonuses.js';
import {calcGoldReward} from '../game-logic/economy.js';
import {createMatch3Clock,advanceMatch3Clock,match3ClockSeconds} from '../src/games/match3/match3Clock.js';
const require=createRequire(import.meta.url),{acorn}=require('../recovery-tools/ast-recovery.cjs');
const raw=fs.readFileSync(new URL('./fixtures/match3-v2-controller-reference.txt',import.meta.url),'utf8');
const full=fs.readFileSync(new URL('../src/games/match3/Match3Game.jsx',import.meta.url),'utf8');
const ast=acorn.parse(full,{ecmaVersion:'latest',sourceType:'module'});
const source=ast.body.filter(n=>n.type!=='ImportDeclaration').map(n=>full.slice(n.type==='ExportDefaultDeclaration'?n.declaration.start:n.start,n.end)).join('\n');
const plain=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='function'?undefined:v));
const generateBoard=()=>Array.from({length:8},(_,row)=>Array.from({length:8},(_,col)=>['fire','water','earth','air','light','dark'][(row*2+col)%6]));
function harness(original,{saved=null}={}){
 let now=10000,index=0,id=0,tree,alive=true,writes=0;const slots=[],pending=[],timers=new Map(),actions=[],haptics=[];
 const snapshot={match3:{highScore:123,currentGame:saved,savedModes:{}}};
 const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const React={useState(initial){const n=index++;if(!slots[n])slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{writes++;slots[n].value=typeof v==='function'?v(slots[n].value):v}]},useRef(value){const n=index++;return slots[n]??(slots[n]={current:value})},useMemo(fn,deps){const n=index++;if(!slots[n]||!sameDeps(slots[n].deps,deps))slots[n]={value:fn(),deps};return slots[n].value},useCallback(fn,deps){return React.useMemo(()=>fn,deps)},useEffect(fn,deps){const n=index++;if(!slots[n]||!sameDeps(slots[n].deps,deps)){const prev=slots[n];slots[n]={deps};pending.push(()=>{prev?.cleanup?.();slots[n].cleanup=fn()})}}};
 const t=(key,values)=>values?key+JSON.stringify(values):key;
 const performAction=async(name,payload,options)=>{actions.push(plain({name,payload,options}));return{success:true}};
 // Pure engine behavior itself is covered separately; fixed outcomes isolate controller serialization/locking.
 const move=(board,from,to)=>({valid:from.x!==0,totalPoints:120,combo:2,board:board.map(row=>[...row]),steps:[],dropCollected:[]});
 const boost=(board,_id,x)=>({valid:x>=0,totalPoints:90,combo:1,board:board.map(row=>[...row]),steps:[]});
 const canonical={createMatch3Clock,advanceMatch3Clock,match3ClockSeconds,React,jsxRuntime:{jsx:(_type,props)=>props},useState:React.useState,useRef:React.useRef,useMemo:React.useMemo,useCallback:React.useCallback,useEffect:React.useEffect,useSnapshot:()=>snapshot,useAction:()=>performAction,useExitToHub:()=>()=>{},useAppI18n:()=>({t}),useImmersiveGame(){},generateBoard,normalizeMatch3Boosters,getRewardChestProgress,calcGoldReward,loadRuntimeAssetManifest:async()=>null,api:async()=>[],seedDropTokens:board=>board.map((row,y)=>row.map((gem,x)=>y===0&&x<3?'drop_gold':gem)),selectMatch3InitialRun,audioManager:{play(){}},attemptMatch3Move:move,hasValidMoves:()=>true,estimateMatch3CascadeLockMs,applyMatch3Booster:boost,Match3Presentation:'presentation',haptic:kind=>haptics.push(kind)};
 const names={Y:'React',G:'jsxRuntime',vx:'useSnapshot',Sx:'useAction',xx:'useExitToHub',es:'useAppI18n',U0:'generateBoard',jl:'normalizeMatch3Boosters',Pi:'getRewardChestProgress',og:'calcGoldReward',yx:'useImmersiveGame',Yx:'loadRuntimeAssetManifest',Lr:'api',FS:'seedDropTokens',Tx:'selectMatch3InitialRun',pa:'audioManager',ex:'attemptMatch3Move',Y0:'hasValidMoves',q0:'estimateMatch3CascadeLockMs',PS:'applyMatch3Booster',a_:'Match3Presentation'};
 const deterministicMath=Object.create(Math);deterministicMath.random=()=>0.314159;
 const visibilityListeners=new Set();const document={hidden:false,addEventListener:(name,fn)=>visibilityListeners.add(fn),removeEventListener:(name,fn)=>visibilityListeners.delete(fn)};
 const context={...canonical,document,performance:{now:()=>now},Math:deterministicMath,Date:class extends Date{static now(){return now}},window:{setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id},clearTimeout(id){timers.delete(id)},setInterval(fn,ms){timers.set(++id,{fn,at:now+ms,interval:ms});return id},clearInterval(id){timers.delete(id)}}};
 if(original)for(const[short,name]of Object.entries(names))context[short]=canonical[name];
 const component=vm.runInNewContext((original?raw:source)+`;${original?'l_':'Match3Game'}`,context);
 const render=()=>{index=0;tree=component();for(const fn of pending.splice(0))fn();return tree};render();
 return{get tree(){return tree},get writes(){return writes},get timerCount(){return timers.size},get listenerCount(){return visibilityListeners.size},actions,haptics,render,async settle(){await Promise.resolve();render()},
  tick(ms){now+=ms;for(const[k,t]of[...timers])if(t.at<=now){if(t.interval)t.at=now+t.interval;else timers.delete(k);t.fn()}if(alive)render()},
  setHidden(hidden){document.hidden=hidden;for(const fn of [...visibilityListeners])fn();if(alive)render()},
  timerCallbacks(){return [...timers.values()].map(timer=>timer.fn)},
  unmount(){alive=false;for(const slot of slots)slot?.cleanup?.()}
 };
}
const same=(a,b)=>{assert.deepEqual(plain(a.tree),plain(b.tree));assert.deepEqual(a.actions,b.actions)};
test('authored production controller matches frozen preview across classic/drop modes and action boundaries',async()=>{
 for(const mode of['classic','drop']){
  const pair=[harness(true),harness(false)];for(const h of pair){await h.settle();h.tree.onModeChange(mode);h.render();h.tree.onStart();await h.settle();}same(...pair);
  for(const h of pair){h.tree.sceneState.onMatch3Swap({x:0,y:0},{x:1,y:0});h.render();h.tick(100);h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();h.tick(2000)}same(...pair);
  for(const h of pair){h.tree.onBooster('bomb');h.render();h.tree.sceneState.onMatch3Cell(3,3);h.render();h.tick(2000);h.tree.onShuffle();h.render();h.tree.onPause();h.render();h.tick(60000)}same(...pair);
  for(const h of pair){h.tree.onResume();h.render();h.tree.onFinish();h.render()}same(...pair);
  assert.deepEqual(pair[1].haptics,['warning','success','success'],'production haptics are retained although preview stubs removed them');
  assert.equal(pair[1].actions.at(-1).name,'match3.end');
 }
});
test('saved-game restoration and timed expiry retain baseline schema and match frozen preview',async()=>{
 const saved={board:generateBoard(),mode:'timed',score:555,movesLeft:1,combo:3,boosters:{bomb:1,lightning:2,rainbow:0,hammer:3}};
 const pair=[harness(true,{saved}),harness(false,{saved})];for(const h of pair){await h.settle();h.tick(1000)}same(...pair);assert.equal(pair[1].actions.at(-1).name,'match3.end');assert.equal(pair[1].actions.at(-1).payload.score,555);
});

test('timed-mode regression: twenty scored moves in ten active seconds cannot postpone the countdown',async()=>{
 const old=harness(true),current=harness(false);
 for(const h of[old,current]){await h.settle();h.tree.onModeChange('timed');h.render();h.tree.onStart();await h.settle();
  for(let i=0;i<20;i++){h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();h.tick(500)}
 }
 assert.equal(old.tree.movesLeft,90,'frozen preview reproduces the score-dependent timeout defect');
 assert.equal(current.tree.movesLeft,80,'new clock counts all ten active seconds');
 assert.equal(current.tree.score,2400);assert.equal(current.actions.filter(x=>x.name==='match3.end').length,0);
});

test('timed clock preserves partial seconds across pause and excludes hidden wall time',async()=>{
 const h=harness(false);await h.settle();h.tree.onModeChange('timed');h.render();h.tree.onStart();await h.settle();
 h.tick(450);h.tree.onPause();h.render();assert.equal(h.timerCount,0);h.tick(60000);assert.equal(h.tree.movesLeft,90);
 h.tree.onResume();h.render();h.tick(550);assert.equal(h.tree.movesLeft,89);
 h.tick(250);h.setHidden(true);h.tick(60000);assert.equal(h.tree.movesLeft,89);
 h.setHidden(false);h.tick(750);assert.equal(h.tree.movesLeft,88);assert.equal(h.tree.gameActive,true);
});

test('timed expiry clamps at zero, uses latest score and submits once even through stale handlers',async()=>{
 const h=harness(false);await h.settle();h.tree.onModeChange('timed');h.render();h.tree.onStart();await h.settle();
 h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();const staleFinish=h.tree.onFinish,staleSwap=h.tree.sceneState.onMatch3Swap;
 h.tick(95000);assert.equal(h.tree.movesLeft,0);assert.equal(h.tree.gameActive,false);
 staleFinish();staleFinish();staleSwap({x:1,y:0},{x:2,y:0});h.render();h.tick(10000);
 const ends=h.actions.filter(x=>x.name==='match3.end');assert.equal(ends.length,1);assert.equal(ends[0].payload.score,120);assert.equal(h.tree.movesLeft,0);
});

test('unmount clears timers/listeners and late scheduled callbacks cannot write or submit',async()=>{
 const h=harness(false);await h.settle();h.tree.onModeChange('timed');h.render();h.tree.onStart();await h.settle();h.tick(400);
 const stale=h.timerCallbacks();h.unmount();const writes=h.writes,actions=h.actions.length;
 assert.equal(h.timerCount,0);assert.equal(h.listenerCount,0);h.tick(100000);for(const fn of stale)fn();
 assert.equal(h.writes,writes);assert.equal(h.actions.length,actions);
});
