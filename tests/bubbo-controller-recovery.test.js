import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as engine from '../src/game-core/bubbo/engine.js';
import * as motion from '../src/games/bubbo/bubboMotion.js';
import {calcBubboReward} from '../game-logic/economy.js';
import {traceBubboShot} from '../src/games/bubbo/bubboAim.js';
import {bubboFieldGeometry} from '../src/games/bubbo/bubboComposition.js';
const require=createRequire(import.meta.url),{acorn}=require('../recovery-tools/ast-recovery.cjs');
const root=new URL('../',import.meta.url);
const mapping=JSON.parse(fs.readFileSync(new URL('evidence/bubbo-symbol-mapping.json',root))).globals;
const reference=fs.readFileSync(new URL('tests/fixtures/bubbo-v2-controller-reference.txt',root),'utf8');
const full=fs.readFileSync(new URL('src/games/bubbo/BubboGame.jsx',root),'utf8');
const ast=acorn.parse(full,{ecmaVersion:'latest',sourceType:'module'});
const source=ast.body.filter(n=>!n.type.startsWith('Import')&&!n.type.startsWith('Export')).map(n=>full.slice(n.start,n.end)).join('\n');
const plain=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='function'?undefined:v));
function harness(original,{savedRun=null,startError=false}={}){
 let now=100000,hook=0,color=0,starts=0,nextTimer=0,tree,rendering=false;
 const slots=[],timers=new Map(),pending=[],actions=[],events=[];
 const sameDeps=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const React={
  useState(initial){const index=hook++;if(!slots[index])slots[index]={value:typeof initial==='function'?initial():initial};return[slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value}]},
  useRef(value){const index=hook++;return slots[index]??(slots[index]={current:value})},
  useMemo(fn,deps){const index=hook++;if(!slots[index]||!sameDeps(slots[index].deps,deps))slots[index]={value:fn(),deps};return slots[index].value},
  useCallback(fn,deps){return this.useMemo(()=>fn,deps)},
  useEffect(fn,deps){const index=hook++;if(!slots[index]||!sameDeps(slots[index].deps,deps)){const prev=slots[index];slots[index]={deps,cleanup:prev?.cleanup};pending.push(()=>{prev?.cleanup?.();slots[index].cleanup=fn()})}}
 };
 const action=async(name,payload,options)=>{actions.push(plain({name,payload,options}));return startError&&name==='bubbo.start'?{error:'test start failure'}:{success:true}};
 const pushEvent=event=>events.push(plain(event));
 const t=(key,values)=>values?key+JSON.stringify(values):key;
 const values={...engine,...motion,React,jsxRuntime:{jsx:(_type,props)=>props},calcBubboReward,BubboPresentation:'BubboPresentation',audioManager:{play(){}},useSnapshot:()=>({bubbo:{highScore:222,currentGame:savedRun}}),useAction:()=>action,useExitToHub:()=>()=>events.push({exit:true}),useGameEvents:fn=>fn({pushEvent}),useAppI18n:()=>({t}),useImmersiveGame(){},createBubboRun:(seed,options)=>engine.createBubboRun(seed??'start-'+ ++starts,options),randomBubboColor:()=>engine.BUBBO_COLORS[color++%5]};
 const deterministicMath=Object.create(Math);deterministicMath.random=()=>0.314159;
 const context={Math:deterministicMath,Date:class extends Date{static now(){return now}},window:{setInterval(fn){timers.set(++nextTimer,fn);return nextTimer},clearInterval(id){timers.delete(id)}},...values};
 if(original)for(const[short,long]of Object.entries(mapping))if(long in values)context[short]=values[long];
 const component=vm.runInNewContext((original?reference:source)+`;${original?'B1':'BubboGame'}`,context);
 const render=()=>{assert.equal(rendering,false);rendering=true;hook=0;tree=component();rendering=false;for(const fn of pending.splice(0))fn();return tree};
 render();return{get tree(){return tree},actions,events,render,tick(ms){now+=ms;for(const fn of [...timers.values()])fn();render()},async start(mode){await tree.onStart(mode);render()}};
}
const sameHarness=(a,b)=>{assert.deepEqual(plain(a.tree),plain(b.tree));assert.deepEqual(a.actions,b.actions);assert.deepEqual(a.events,b.events)};
test('production controller recovery matches preview start, clock, flight, power, swap, pause and end action traces',async()=>{
 const pair=[harness(true),harness(false)];sameHarness(...pair);
 for(const h of pair)await h.start('timed');sameHarness(...pair);
 for(const h of pair){h.tree.onSwap();h.render();h.tree.onPower('bomb');h.render();h.tree.onBusy(true);h.tree.sceneState.onBubboShotStart(h.tree.sceneState.bubbo.current);h.render();h.tick(400);}
 sameHarness(...pair);
 for(const h of pair){const state=h.tree.sceneState.bubbo,shot=traceBubboShot(state,bubboFieldGeometry(350,480),-Math.PI/2);h.tree.sceneState.onBubboFire(shot.row,shot.col,shot.path,state.current);h.tree.onBusy(false);h.render();h.tick(600);h.tree.onPause();h.render();h.tick(60000);}
 sameHarness(...pair);assert.equal(pair[1].tree.sceneState.bubbo.timeLeft,89);
 for(const h of pair){h.tree.onResume();h.render();h.tick(500);h.tree.onFinish();h.render()}
 sameHarness(...pair);assert.equal(pair[1].actions.at(-1).name,'bubbo.end');
 assert.equal(pair[1].tree.sceneState.bubbo.powerups.bomb,2);
});
test('duplicate starts are locked and API start errors preserve the menu',async()=>{
 for(const original of[true,false]){const h=harness(original);await Promise.all([h.tree.onStart('classic'),h.tree.onStart('classic')]);h.render();assert.equal(h.actions.filter(a=>a.name==='bubbo.start').length,1)}
 const pair=[harness(true,{startError:true}),harness(false,{startError:true})];for(const h of pair)await h.start('classic');sameHarness(...pair);assert.equal(pair[1].tree.gameActive,false);assert.equal(pair[1].tree.error,'test start failure');
});
test('saved-run compatibility and terminal timed cancellation match preview',async()=>{
 const savedRun={...engine.createBubboRun('saved',{mode:'timed'}),score:555,timeLeft:1,shotsFired:4,pressure:500,powerups:{bomb:1,rainbow:0,lightning:2}};
 const pair=[harness(true,{savedRun}),harness(false,{savedRun})];for(const h of pair){h.tree.onResumeSaved();h.render();h.tree.onBusy(true);h.tick(1000)}sameHarness(...pair);
 assert.equal(pair[1].tree.gameActive,false);assert.equal(pair[1].tree.runResult.score,555);const before=pair[1].actions.length;pair[1].tree.sceneState.onBubboFire(4,3,[],'mint');pair[1].render();assert.equal(pair[1].actions.length,before,'terminal flight cannot score after zero');
});
