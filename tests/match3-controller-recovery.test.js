import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeMatch3Boosters} from '../src/game-core/match3/engine.js';
import {createMatch3MotionPlan} from '../src/game-core/match3/motion.js';
import {estimateMatch3CascadeLockMs} from '../src/game-core/match3/animation.js';
import {selectMatch3InitialRun} from '../src/games/match3/selectMatch3Run.js';
import {getRewardChestProgress} from '../game-logic/hud-bonuses.js';
import {calcGoldReward} from '../game-logic/economy.js';
import {createMatch3Clock,advanceMatch3Clock,match3ClockSeconds} from '../src/games/match3/match3Clock.js';
import {getQueuedMatch3Action} from '../src/games/match3/match3ActionQueue.js';
import {isGardenR2Action} from '../src/game-state/gardenR2Snapshot.js';
const require=createRequire(import.meta.url),{acorn}=require('../recovery-tools/ast-recovery.cjs');
const raw=fs.readFileSync(new URL('./fixtures/match3-v2-controller-reference.txt',import.meta.url),'utf8');
const full=fs.readFileSync(new URL('../src/games/match3/Match3Game.jsx',import.meta.url),'utf8');
const ast=acorn.parse(full,{ecmaVersion:'latest',sourceType:'module'});
const source=ast.body.filter(n=>n.type!=='ImportDeclaration').map(n=>full.slice(n.type==='ExportDefaultDeclaration'?n.declaration.start:n.start,n.end)).join('\n');
const plain=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='function'?undefined:v));
const generateBoard=()=>Array.from({length:8},(_,row)=>Array.from({length:8},(_,col)=>['fire','water','earth','air','light','dark'][(row*2+col)%6]));
function harness(original,{saved=null,actionOverride=null}={}){
 let now=10000,index=0,id=0,tree,alive=true,writes=0,motionId=null,motionAge=0;const slots=[],pending=[],timers=new Map(),actions=[],haptics=[];
 const snapshot={match3:{highScore:123,currentGame:saved,savedModes:{}}};
 const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const React={useState(initial){const n=index++;if(!slots[n])slots[n]={value:typeof initial==='function'?initial():initial};return[slots[n].value,v=>{writes++;slots[n].value=typeof v==='function'?v(slots[n].value):v}]},useRef(value){const n=index++;return slots[n]??(slots[n]={current:value})},useMemo(fn,deps){const n=index++;if(!slots[n]||!sameDeps(slots[n].deps,deps))slots[n]={value:fn(),deps};return slots[n].value},useCallback(fn,deps){return React.useMemo(()=>fn,deps)},useEffect(fn,deps){const n=index++;if(!slots[n]||!sameDeps(slots[n].deps,deps)){const prev=slots[n];slots[n]={deps};pending.push(()=>{prev?.cleanup?.();slots[n].cleanup=fn()})}}};
 const t=(key,values)=>values?key+JSON.stringify(values):key;
 const performAction=async(name,payload,options)=>{actions.push(plain({name,payload,options}));return actionOverride ? actionOverride(name,payload,options) : {success:true}};
 // Pure engine behavior itself is covered separately; fixed outcomes isolate controller serialization/locking.
 const move=(board,from,to)=>({valid:from.x!==0,totalPoints:120,combo:2,board:board.map(row=>[...row]),steps:[],dropCollected:[]});
 const boost=(board,_id,x)=>({valid:x>=0,totalPoints:90,combo:1,board:board.map(row=>[...row]),steps:[]});
 const canonical={getQueuedMatch3Action,createMatch3Clock,advanceMatch3Clock,match3ClockSeconds,React,jsxRuntime:{jsx:(_type,props)=>props},useState:React.useState,useRef:React.useRef,useMemo:React.useMemo,useCallback:React.useCallback,useEffect:React.useEffect,useSnapshot:()=>snapshot,useAction:()=>performAction,useExitToHub:()=>()=>{},useAppI18n:()=>({t}),useImmersiveGame(){},generateBoard,normalizeMatch3Boosters,getRewardChestProgress,calcGoldReward,loadRuntimeAssetManifest:async()=>null,api:async()=>[],seedDropTokens:board=>board.map((row,y)=>row.map((gem,x)=>y===0&&x<3?'drop_gold':gem)),selectMatch3InitialRun,audioManager:{play(){}},attemptMatch3Move:move,hasValidMoves:()=>true,estimateMatch3CascadeLockMs,applyMatch3Booster:boost,Match3Presentation:'presentation',haptic:kind=>haptics.push(kind)};
 const names={Y:'React',G:'jsxRuntime',vx:'useSnapshot',Sx:'useAction',xx:'useExitToHub',es:'useAppI18n',U0:'generateBoard',jl:'normalizeMatch3Boosters',Pi:'getRewardChestProgress',og:'calcGoldReward',yx:'useImmersiveGame',Yx:'loadRuntimeAssetManifest',Lr:'api',FS:'seedDropTokens',Tx:'selectMatch3InitialRun',pa:'audioManager',ex:'attemptMatch3Move',Y0:'hasValidMoves',q0:'estimateMatch3CascadeLockMs',PS:'applyMatch3Booster',a_:'Match3Presentation'};
 const deterministicMath=Object.create(Math);deterministicMath.random=()=>0.314159;
 const visibilityListeners=new Set();const document={hidden:false,addEventListener:(name,fn)=>visibilityListeners.add(fn),removeEventListener:(name,fn)=>visibilityListeners.delete(fn)};
 const context={...canonical,document,performance:{now:()=>now},Math:deterministicMath,Date:class extends Date{static now(){return now}},window:{setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id},clearTimeout(id){timers.delete(id)},setInterval(fn,ms){timers.set(++id,{fn,at:now+ms,interval:ms});return id},clearInterval(id){timers.delete(id)}}};
 if(original)for(const[short,name]of Object.entries(names))context[short]=canonical[name];
 const component=vm.runInNewContext((original?raw:source)+`;${original?'l_':'Match3Game'}`,context);
 const render=()=>{index=0;tree=component();for(const fn of pending.splice(0))fn();return tree};render();
 return{get tree(){return tree},get writes(){return writes},get timerCount(){return timers.size},get listenerCount(){return visibilityListeners.size},actions,haptics,render,async settle(){for(let n=0;n<100;n++)await Promise.resolve();render()},
  tick(ms){if(!original&&alive&&tree.gameActive&&!tree.paused&&!document.hidden&&tree.sceneState.match3Animation){const a=tree.sceneState.match3Animation;if(a.id!==motionId){motionId=a.id;motionAge=0}motionAge+=ms;if(motionAge>=createMatch3MotionPlan(a,tree.sceneState.match3.board).duration)tree.sceneState.onMatch3AnimationComplete(a.id)}now+=ms;for(const[k,t]of[...timers])if(t.at<=now){if(t.interval)t.at=now+t.interval;else timers.delete(k);t.fn()}if(alive)render()},
  setHidden(hidden){document.hidden=hidden;for(const fn of [...visibilityListeners])fn();if(alive)render()},
  timerCallbacks(){return [...timers.values()].map(timer=>timer.fn)},
  unmount(){alive=false;for(const slot of slots)slot?.cleanup?.()}
 };
}
// Compare gameplay/save contracts; motion descriptors now intentionally use renderer completion.
const logicalTree=tree=>{const value=plain(tree);delete value.motionFeedback;delete value.actionFeedback;delete value.highScore;delete value.idleMotion;delete value.sceneState.match3.idleMotion;delete value.sceneState.match3Animation;return value};
const same=(a,b)=>{assert.deepEqual(logicalTree(a.tree),logicalTree(b.tree));assert.deepEqual(a.actions,b.actions)};
test('authored production controller matches frozen preview across classic/drop modes and action boundaries',async()=>{
 for(const mode of['classic','drop']){
  const pair=[harness(true),harness(false)];for(const h of pair){await h.settle();h.tree.onModeChange(mode);h.render();h.tree.onStart();await h.settle();await h.settle();}same(...pair);
  for(const h of pair){h.tree.sceneState.onMatch3Swap({x:0,y:0},{x:1,y:0});h.render();h.tick(200);h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();h.tick(2000);await h.settle();}same(...pair);
  for(const h of pair){h.tree.onBooster('bomb');h.render();h.tree.sceneState.onMatch3Cell(3,3);h.render();h.tick(2000);h.tree.onShuffle();h.render();h.tree.onPause();h.render();h.tick(60000);await h.settle();}same(...pair);
  for(const h of pair){h.tree.onResume();h.render();h.tree.onFinish();h.render();await h.settle();}same(...pair);
  assert.deepEqual(pair[1].haptics,['warning','success','success'],'production haptics are retained although preview stubs removed them');
  assert.equal(pair[1].actions.at(-1).name,'match3.end');
 }
});
test('saved-game restoration and timed expiry retain baseline schema and match frozen preview',async()=>{
 const saved={board:generateBoard(),mode:'timed',score:555,movesLeft:1,combo:3,boosters:{bomb:1,lightning:2,rainbow:0,hammer:3}};
 const pair=[harness(true,{saved}),harness(false,{saved})];for(const h of pair){await h.settle();h.tick(1000);await h.settle();}same(...pair);assert.equal(pair[1].actions.at(-1).name,'match3.end');assert.equal(pair[1].actions.at(-1).payload.score,555);
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
 staleFinish();staleFinish();staleSwap({x:1,y:0},{x:2,y:0});h.render();h.tick(10000);await h.settle();
 const ends=h.actions.filter(x=>x.name==='match3.end');assert.equal(ends.length,1);assert.equal(ends[0].payload.score,120);assert.equal(h.tree.movesLeft,0);
});

test('unmount clears timers/listeners and late scheduled callbacks cannot write or submit',async()=>{
 const h=harness(false);await h.settle();h.tree.onModeChange('timed');h.render();h.tree.onStart();await h.settle();h.tick(400);
 const stale=h.timerCallbacks();h.unmount();const writes=h.writes,actions=h.actions.length;
 assert.equal(h.timerCount,0);assert.equal(h.listenerCount,0);h.tick(100000);for(const fn of stale)fn();
 assert.equal(h.writes,writes);assert.equal(h.actions.length,actions);
});

function controlledActionStore(delay = body => body.action === 'match3.syncMode' && body.payload.game.score > 0) {
  const text = fs.readFileSync(new URL('../src/game-state/useGameHub.js', import.meta.url), 'utf8');
  const parsed = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  let actionNode;
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Property' && node.key.name === 'performAction') actionNode = node.value;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  })(parsed);
  assert.ok(actionNode);
  const helpers = parsed.body.filter(node => node.type === 'FunctionDeclaration' && ['ownsSession', 'accountChangedError'].includes(node.id.name));
  assert.equal(helpers.length, 2);
  const helperSource = helpers.map(node => text.slice(node.start, node.end)).join('\n');
  let state = { busy: {}, snapshot: { player: { id: 'match3-controller-account' } } };
  const sent = [], pending = [];
  const action = vm.runInNewContext(`${helperSource}\n(${text.slice(actionNode.start, actionNode.end)})`, {
    snapshotAccountSession: {},
    get: () => state,
    set: update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; },
    isYardAction: () => false,
    // Execute the real ownership helpers as well as the command guard. An
    // incomplete extraction aborts before api(), hiding the queue behavior.
    isGardenR2Action,
    api: async (_url, body, options) => {
      assert.equal(body.accountId, 'match3-controller-account');
      assert.equal(options.isCurrent(), true);
      sent.push(plain(body));
      return delay(body) ? new Promise(resolve => pending.push(resolve)) : { success: true };
    },
    haptic() {}, audioManager: { play() {} },
  });
  return { action, sent, resolveNext: () => { assert.ok(pending.length); pending.shift()({ success: true }); } };
}

test('controlled Match3 transport retains the real Garden command fence', async () => {
  const store = controlledActionStore(() => false);
  assert.equal((await store.action('garden.r2', { accountId: 'unverified-account' })).error, 'GARDEN_R2_ACCOUNT_MISMATCH');
  assert.equal(store.sent.length, 0);
  assert.equal((await store.action('match3.start', { mode: 'classic' })).success, true);
  assert.deepEqual(store.sent.map(command => command.action), ['match3.start']);
});

test('overlapping accepted swaps retain the second save after the first request completes', async () => {
  for (const original of [true, false]) {
    const store = controlledActionStore(), h = harness(original, { actionOverride: store.action });
    await h.settle(); h.tree.onStart(); await h.settle();
    h.tree.sceneState.onMatch3Swap({ x: 1, y: 0 }, { x: 2, y: 0 }); h.render(); h.tick(2000);
    h.tree.sceneState.onMatch3Swap({ x: 1, y: 0 }, { x: 2, y: 0 }); h.render(); await h.settle();
    assert.equal(h.tree.movesLeft, 28);
    const scoringSaves = () => store.sent.filter(command => command.action === 'match3.syncMode' && command.payload.game.score > 0);
    assert.equal(scoringSaves().length, 1, 'first request is deliberately still pending');
    store.resolveNext(); await h.settle();
    assert.equal(scoringSaves().length, original ? 1 : 2, 'frozen preview loses the second write; production serializes it');
    if (!original) {
      assert.equal(scoringSaves()[1].payload.game.movesLeft, 28);
      assert.equal(scoringSaves()[1].payload.game.score, 240);
      store.resolveNext(); await h.settle();
    }
  }
});

test('start and its initial board stay ahead of a fast first swap', async () => {
  const store = controlledActionStore(body => body.action === 'match3.start');
  const h = harness(false, { actionOverride: store.action }); await h.settle();
  h.tree.onStart(); h.render();
  h.tree.sceneState.onMatch3Swap({ x: 1, y: 0 }, { x: 2, y: 0 }); h.render(); await h.settle();
  assert.deepEqual(store.sent.map(command => command.action), ['match3.start']);
  store.resolveNext(); await h.settle();
  assert.deepEqual(store.sent.map(command => [command.action, command.payload.game?.score]), [
    ['match3.start', undefined], ['match3.syncMode', 0], ['match3.syncMode', 120],
  ]);
});

test('finish waits for accepted saves and cannot be followed by a queued stale save', async () => {
  const store = controlledActionStore(), h = harness(false, { actionOverride: store.action });
  await h.settle(); h.tree.onStart(); await h.settle();
  h.tree.sceneState.onMatch3Swap({ x: 1, y: 0 }, { x: 2, y: 0 }); h.render(); h.tick(2000);
  h.tree.sceneState.onMatch3Swap({ x: 1, y: 0 }, { x: 2, y: 0 }); h.render();
  const finish = h.tree.onFinish; finish(); finish(); h.render(); await h.settle();
  assert.equal(store.sent.filter(command => command.action === 'match3.end').length, 0);
  store.resolveNext(); await h.settle(); store.resolveNext(); await h.settle();
  assert.equal(store.sent.at(-1).action, 'match3.end');
  assert.equal(store.sent.at(-1).payload.score, 240);
  assert.equal(store.sent.filter(command => command.action === 'match3.end').length, 1);
});

test('accepted saves can drain after unmount without late React state writes', async () => {
  const store = controlledActionStore(), h = harness(false, { actionOverride: store.action });
  await h.settle(); h.tree.onStart(); await h.settle();
  h.tree.sceneState.onMatch3Swap({ x: 1, y: 0 }, { x: 2, y: 0 }); h.render(); h.tick(2000);
  h.tree.sceneState.onMatch3Swap({ x: 1, y: 0 }, { x: 2, y: 0 }); h.render(); h.unmount();
  const writes = h.writes;
  store.resolveNext(); for (let n = 0; n < 20; n++) await Promise.resolve();
  assert.equal(store.sent.at(-1).payload.game.movesLeft, 28);
  store.resolveNext(); for (let n = 0; n < 20; n++) await Promise.resolve();
  assert.equal(h.writes, writes);
});

test('queue identity survives re-entry and a rejected command does not block the next command', async () => {
  const sent = []; let rejectFirst;
  const action = (...args) => { sent.push(args); return sent.length === 1 ? new Promise((_resolve, reject) => { rejectFirst = reject; }) : Promise.resolve({ success: true }); };
  const firstMount = getQueuedMatch3Action(action), nextMount = getQueuedMatch3Action(action);
  assert.equal(firstMount, nextMount);
  const first = firstMount('match3.syncMode', { game: { movesLeft: 29 } });
  const rejected = assert.rejects(first, /transport failure/);
  const second = nextMount('match3.syncMode', { game: { movesLeft: 28 } });
  assert.equal(sent.length, 1);
  rejectFirst(new Error('transport failure')); await rejected; await second;
  assert.deepEqual(sent.map(command => command[1].game.movesLeft), [29, 28]);
});

test('last classic move presents its full cascade before ending, including pause and resume',async()=>{
 const saved={board:generateBoard(),mode:'classic',score:0,movesLeft:1,combo:0};
 const h=harness(false,{saved});await h.settle();
 h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();
 assert.equal(h.tree.movesLeft,0);assert.equal(h.tree.gameActive,true);assert.equal(h.tree.inputLocked,true);
 assert.equal(h.actions.filter(x=>x.name==='match3.end').length,0);
 h.tree.onPause();h.render();h.tick(60000);
 assert.equal(h.tree.gameActive,true);assert.equal(h.tree.inputLocked,true);
 h.tree.onResume();h.render();h.tick(2000);await h.settle();
 assert.equal(h.tree.gameActive,false);assert.equal(h.tree.inputLocked,false);
 assert.equal(h.actions.filter(x=>x.name==='match3.end').length,1);
 assert.equal(h.actions.at(-1).payload.score,120);
});

test('same-frame repeated input and stale animation completions cannot accept a second move',async()=>{
 const h=harness(false);await h.settle();h.tree.onStart();h.render();
 const stale=h.tree.sceneState.onMatch3Swap;
 stale({x:1,y:0},{x:2,y:0});stale({x:1,y:0},{x:2,y:0});h.render();
 assert.equal(h.tree.movesLeft,29);assert.equal(h.tree.score,120);
 h.tree.sceneState.onMatch3AnimationComplete('stale-id');h.render();assert.equal(h.tree.inputLocked,true);
 h.tick(2000);assert.equal(h.tree.inputLocked,false);assert.equal(h.tree.sceneState.match3Animation,null);
});

test('reload before the final cascade completes restores zero-move runs as terminal and never scores an extra move',async()=>{
 for(const mode of ['classic','drop','timed']) for(const hasBoard of [true,false]) {
  const saved={...(hasBoard?{board:generateBoard()}:{}),mode,score:120,movesLeft:0,combo:2};
  const h=harness(false,{saved});await h.settle();
  assert.equal(h.tree.gameActive,false,mode+' cannot resume a terminal save');
  assert.equal(h.tree.sceneState.match3.gameActive,false);
  h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();
  h.tree.sceneState.onMatch3Cell(3,3);h.tree.onShuffle();h.render();h.tick(2000);await h.settle();
  assert.equal(h.tree.score,120);assert.equal(h.tree.movesLeft,0);
  assert.equal(h.actions.filter(x=>x.name==='match3.syncMode').length,0);
  const ends=h.actions.filter(x=>x.name==='match3.end');assert.equal(ends.length,1);assert.equal(ends[0].payload.score,120);
 }
});


test('feedback uses accepted points and never writes presentation preferences to the action payload', async()=>{
 const h=harness(false);await h.settle();h.tree.onStart();await h.settle();
 h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();
 assert.equal(h.tree.actionFeedback.points,120);
 assert.equal(h.tree.highScore,123);
 const before=h.actions.length;h.tree.onIdleMotion();h.render();
 assert.equal(h.tree.idleMotion,false);assert.equal(h.tree.sceneState.match3.idleMotion,false);
 assert.equal(h.actions.length,before);
 assert.ok(h.actions.every(action=>!JSON.stringify(action).includes('idleMotion')));
 h.tick(2000);h.tree.sceneState.onMatch3Swap({x:0,y:0},{x:1,y:0});h.render();
 assert.equal(h.tree.actionFeedback,null,'invalid moves never repeat the previous gain');
});


test('shuffle clears only stale scored-action feedback and never grants points',async()=>{
 const h=harness(false);await h.settle();h.tree.onStart();await h.settle();
 h.tree.sceneState.onMatch3Swap({x:1,y:0},{x:2,y:0});h.render();h.tick(2000);await h.settle();
 assert.equal(h.tree.actionFeedback.points,120);
 const score=h.tree.score,moves=h.tree.movesLeft,combo=h.tree.combo;
 h.tree.onShuffle();h.render();await h.settle();
 assert.equal(h.tree.actionFeedback,null);assert.equal(h.tree.motionFeedback,null);
 assert.equal(h.tree.score,score);assert.equal(h.tree.movesLeft,moves);assert.equal(h.tree.combo,combo);
 assert.equal(h.tree.shuffleCharges,0);
 const action=h.actions.findLast(action=>action.options?.key==='match3.shuffleBooster');
 assert.equal(action.payload.game.score,score);
});
