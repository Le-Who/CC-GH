import test from 'node:test';
import assert from 'node:assert/strict';
import { createGardenPressSession, createGardenActionGate, createGardenShelfDrag, orderGardenQuests } from '../src/games/garden-shelf/gardenInteraction.js';

const pointer = (rest={}) => ({pointerId:1,clientX:20,clientY:20,button:0,isPrimary:true,...rest});
function pressFixture() {
  let time=0,callback=null,taps=0,details=0;
  const press=createGardenPressSession({onTap:()=>taps++,onDetails:()=>details++,now:()=>time,schedule:fn=>(callback=fn,1),unschedule:()=>callback=null});
  return {press,advance:value=>time=value,hold:()=>callback?.(),counts:()=>[taps,details]};
}
test('one primary pointer owns a tap and a hold never pays a tap',()=>{
  const f=pressFixture();assert.equal(f.press.start(pointer()),true);assert.equal(f.press.start(pointer({pointerId:2})),false);
  assert.equal(f.press.end(pointer({pointerId:2})),false);f.advance(100);assert.equal(f.press.end(pointer()),true);
  f.press.start(pointer());f.hold();f.press.end(pointer());assert.deepEqual(f.counts(),[1,1]);
});
test('scroll movement and interruption cancel plant gestures without rewards',()=>{
  for(const cancel of [p=>p.cancel(),p=>p.move(pointer({clientY:50}))]) {
    const f=pressFixture();f.press.start(pointer());cancel(f.press);f.press.end(pointer());f.hold();assert.deepEqual(f.counts(),[0,0]);
  }
});
test('long non-hold releases do not produce accidental taps',()=>{
  const f=pressFixture();f.press.start(pointer());f.advance(700);assert.equal(f.press.end(pointer()),false);assert.deepEqual(f.counts(),[0,0]);
});
test('action gate suppresses repeated submissions and releases after failure',async()=>{
  const gate=createGardenActionGate();let release,calls=0;
  const pending=gate.run(()=>new Promise(resolve=>release=resolve));
  assert.equal(gate.isPending(),true);assert.equal(await gate.run(()=>calls++),false);assert.equal(calls,0);
  release();assert.equal(await pending,true);assert.equal(gate.isPending(),false);
  await assert.rejects(gate.run(()=>Promise.reject(Error('network'))),/network/);assert.equal(gate.isPending(),false);
});
test('mouse shelf dragging yields to touch and controls and cleans up capture',()=>{
  let captured=false,dragging=false,prevented=0;
  const node={scrollHeight:1000,clientHeight:200,scrollTop:100,setPointerCapture:()=>captured=true,hasPointerCapture:()=>captured,releasePointerCapture:()=>captured=false};
  const drag=createGardenShelfDrag({getViewport:()=>node,onDragging:value=>dragging=value});
  assert.equal(drag.start(pointer({pointerType:'touch'})),false);
  assert.equal(drag.start(pointer({pointerType:'mouse',target:{closest:()=>({})}})),false);
  assert.equal(drag.start(pointer({pointerType:'mouse',target:{closest:()=>null}})),true);
  drag.move(pointer({clientY:50,buttons:1,preventDefault:()=>prevented++}));assert.equal(node.scrollTop,70);assert.equal(captured,true);assert.equal(dragging,true);assert.equal(prevented,1);
  drag.cancel();assert.equal(captured,false);assert.equal(dragging,false);assert.equal(drag.active(),false);
});
test('quest sorting keeps unclaimed daily and story actions ahead of claimed history',()=>{
  const quests=orderGardenQuests([{quests:[{id:'claimed',kind:'daily',claimed:true,unlocked:true},{id:'story',kind:'story',unlocked:true},{id:'daily',kind:'daily',unlocked:true}]}]);
  assert.deepEqual(quests.map(q=>q.id),['daily','story','claimed']);
});
