import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackTrack } from '../src/game-runtime/scenes/feedbackTrack.js';
import { installPresentationMotion, settlePresentationMotion, sampleWellAtPoint } from '../src/games/shared/presentationMotion.js';
const layer = () => ({ children: [], addChild(n) { n.parent=this; this.children.push(n); }, removeChild(n) { this.children=this.children.filter(x=>x!==n); n.parent=null; } });
const node = () => ({ x: 20, y: 40, alpha: .7, scale: { x: .2, y: .4, set(x,y=x) { this.x=x;this.y=y; } }, destroy() { this.destroyed=true; } });
test('cosmetic tracks preserve non-square sprite scale, authored alpha and elapsed-time cadence', () => {
  const a=createFeedbackTrack(layer()),b=createFeedbackTrack(layer()),n=node(),m=node();
  for(const [track,view] of [[a,n],[b,m]])track.add(view,{duration:300,from:.9,peak:1.06,dx:4,dy:-8});
  for(let i=0;i<6;i++)a.tick(1000/60);
  for(let i=0;i<12;i++)b.tick(1000/120);
  for(const k of ['x','y','alpha'])assert.ok(Math.abs(n[k]-m[k])<1e-8,k);
  assert.equal(n.scale.y/n.scale.x,2);assert.ok(n.alpha<=.7);
  for(let i=0;i<20;i++)a.tick(1000/60);
  assert.equal(a.size,0);assert.equal(n.destroyed,true);
});
test('rapid reward bursts remain bounded, and reduced motion has no travel or scale',()=>{
  const root=layer(),track=createFeedbackTrack(root,{limit:8}),nodes=[];
  for(let i=0;i<120;i++){const n=node();nodes.push(n);track.add(n,{reduced:true,from:.2,peak:2,dx:100,dy:-100});}
  assert.equal(track.size,8);assert.equal(root.children.length,8);
  assert.ok(nodes.slice(0,-8).every(n=>n.destroyed));
  track.tick(32);for(const n of root.children){assert.equal(n.x,20);assert.equal(n.y,40);assert.equal(n.scale.x,.2);assert.equal(n.scale.y,.4);}
  track.clear();assert.equal(track.size,0);assert.equal(root.children.length,0);
});
test('suspension spikes cannot skip a whole effect; delayed tracks stay transparent before start',()=>{
  const track=createFeedbackTrack(layer()),n=node();track.add(n,{delay:80,duration:200});assert.equal(n.alpha,0);
  track.tick(10000);assert.equal(n.alpha,0);assert.equal(track.size,1);
  track.tick(40);assert.ok(n.alpha>0);track.clear();
});
function events(){const listeners=new Map();return {hidden:false,addEventListener(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f);},removeEventListener(k,f){listeners.get(k)?.delete(f);},emit(k){for(const f of listeners.get(k)||[])f();},get size(){return [...listeners.values()].reduce((n,s)=>n+s.size,0);}};}
test('DOM pause/hidden/resize settle finite animations; late results settle before return and listeners leave',()=>{
  const win=events(),doc=events();let finished=0,cancelled=0;
  const finite={effect:{getTiming:()=>({iterations:1})},finish(){finished++;},cancel(){cancelled++;}};
  const infinite={effect:{getTiming:()=>({iterations:Infinity})},cancel(){cancelled++;}};
  const root={dataset:{},getAnimations:()=>[finite,infinite]};
  const cleanup=installPresentationMotion(root,{windowTarget:win,documentTarget:doc});
  assert.equal(win.size+doc.size,5);win.emit('blur');assert.equal(root.dataset.motionSuspended,'true');assert.equal(finished,1);assert.equal(cancelled,1);
  doc.hidden=true;doc.emit('visibilitychange');assert.equal(finished,2);
  doc.hidden=false;doc.emit('visibilitychange');assert.equal(finished,3);assert.equal(root.dataset.motionSuspended,undefined);
  win.emit('resize');assert.equal(finished,4);cleanup();assert.equal(win.size+doc.size,0);assert.equal(cancelled,6);
});
test('unsupported animation finish is harmless and well hit-testing includes edges without gaps becoming targets',()=>{
  let cancelled=0;settlePresentationMotion({getAnimations:()=>[{finish(){throw Error('unsupported');},cancel(){cancelled++;}}]});assert.equal(cancelled,1);
  const wells=[{getBoundingClientRect:()=>({left:0,top:0,right:50,bottom:50})},null,{getBoundingClientRect:()=>({left:60,top:0,right:110,bottom:50})}];
  assert.equal(sampleWellAtPoint(wells,50,50),0);assert.equal(sampleWellAtPoint(wells,55,25),-1);assert.equal(sampleWellAtPoint(wells,60,0),2);
});
test('opt-in monotonic feedback settles on slow foreground frames without changing default capped tracks',()=>{
  let now=0;const track=createFeedbackTrack(layer(),{now:()=>now}),n=node();track.add(n,{duration:145});
  now=200;track.tick(16);assert.equal(track.size,0);assert.equal(n.destroyed,true);
  const fresh=node();track.add(fresh,{duration:145});now=240;track.tick(16);
  assert.equal(fresh.destroyed,undefined,'a new effect starts at its own monotonic timestamp');
  track.clear();now=10000;track.tick(16);assert.equal(track.size,0,'cleared effects cannot replay across suspension');
});
