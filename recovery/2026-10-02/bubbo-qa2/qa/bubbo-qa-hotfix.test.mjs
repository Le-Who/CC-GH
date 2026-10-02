import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Actor} from './actor.mjs';
import {animationSnapshot} from './animation-readiness.mjs';

test('Actor bodies have a nested lexical scope and retain document access',async()=>{
  const doc={defaultView:{name:'game'}};
  const frame={contentDocument:doc};
  const actor=new Actor(null,'s','http://127.0.0.1:1234',{},'.');
  actor.send=async(method,{expression})=>({result:{value:await vm.runInNewContext(expression,{location:{origin:actor.baseUrl},document:{getElementById:()=>frame}})}});
  assert.equal(await actor.evaluate("const f=7;return f;"),7);
  assert.equal(await actor.evaluate("const f=8;return f;"),8);
  assert.equal(await actor.evaluate("return f.contentDocument===d&&w.name==='game';"),true);
  assert.equal(await actor.evaluate("const d=3,w=4;return d+w;"),7);
});
function animation({property='width',selector=true,stage=true,endTime=300,kind='CSSTransition',state='running'}={}){
  return {playState:state,constructor:{name:kind},transitionProperty:property,effect:{target:{tagName:'B',className:'',parentElement:{className:''},matches:s=>selector&&s==='.bb-pressure > i > b',closest:s=>stage&&s==='.bb-stage'},getComputedTiming:()=>({endTime})}};
}
function classify(items,field=true){return animationSnapshot({getAnimations:()=>items,querySelector:()=>field});}
test('Only the identified Bubbo live width timer is exempt; diagnostic reason retained',()=>{
  const s=classify([animation()]);assert.equal(s.finite.length,0);assert.equal(s.ignoredLive.length,1);assert.equal(s.ignoredLive[0].property,'width');assert.match(s.ignoredLive[0].reason,/pressure/);
});
test('Other finite animations remain gating, including non-Bubbo and other properties',()=>{
  for(const options of [{property:'opacity'},{selector:false},{stage:false},{kind:'Animation'}])assert.equal(classify([animation(options)]).finite.length,1);
  assert.equal(classify([animation()],false).finite.length,1);
});
test('Infinite and finished animations keep separate treatment; serialized helper works',()=>{
  const doc={getAnimations:()=>[animation({endTime:Infinity}),animation({state:'finished'})],querySelector:()=>true};
  const s=vm.runInNewContext(`(${animationSnapshot.toString()})(doc)`,{doc});assert.equal(s.finite.length,0);assert.equal(s.ignoredInfinite.length,1);assert.equal(s.ignoredLive.length,0);
});
