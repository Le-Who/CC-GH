import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBubboNeighborReactions, sampleBubboNeighborReaction, advanceBubboEffects} from '../src/games/bubbo/bubboEffects.js';
const board=()=>Array.from({length:11},()=>Array(9).fill('sky'));
test('only immediate surviving hex neighbors react, with parity and no duplicates',()=>{
  const shot={landed:{row:2,col:4},popped:[{row:2,col:4}],dropped:[{row:2,col:3}]};
  for(const [rowOffset,expected] of [[0,['1:3','1:4','2:5','3:3','3:4']],[1,['1:4','1:5','2:5','3:4','3:5']]]){
    const survivingBoard=board(); survivingBoard[2][4]=null; survivingBoard[2][3]=null;
    const before=JSON.stringify(survivingBoard);
    const effects=createBubboNeighborReactions(shot,{board:survivingBoard,rowOffset});
    assert.deepEqual(effects.map(e=>`${e.row}:${e.col}`).sort(),expected);
    assert.equal(JSON.stringify(survivingBoard),before);
    assert.deepEqual(createBubboNeighborReactions(shot,{board:survivingBoard,rowOffset}),effects);
  }
});
test('distant pop affects its own survivors; removed, empty and new landing cells never react',()=>{
  const cells=board(); cells[0][0]=null;
  const effects=createBubboNeighborReactions({landed:{row:8,col:8},popped:[{row:0,col:1}],dropped:[{row:1,col:1}]},{board:cells});
  assert.ok(effects.some(e=>e.row===0&&e.col===2));
  assert.ok(effects.every(e=>!['0:0','0:1','1:1','8:8'].includes(`${e.row}:${e.col}`)));
  assert.ok(effects.length<=6);
});
test('reactions settle exactly, stay small, and clear on interrupted or remapped boards',()=>{
  const shot={landed:{row:2,col:4}};
  const effects=createBubboNeighborReactions(shot,{board:board()});
  assert.ok(effects.length>0);
  for(const effect of effects){
    assert.deepEqual(sampleBubboNeighborReaction(effect),{rotation:0,scale:1});
    let moved=false;
    for(let age=0;age<=effect.duration;age+=20){
      const sample=sampleBubboNeighborReaction({...effect,age});
      assert.ok(Math.abs(sample.rotation)<=.06);
      assert.ok(sample.scale>=1&&sample.scale<=1.025);
      moved ||= Math.abs(sample.rotation)>0;
    }
    assert.ok(moved);
    assert.deepEqual(sampleBubboNeighborReaction({...effect,age:effect.duration}),{rotation:0,scale:1});
  }
  assert.deepEqual(advanceBubboEffects(effects,16,{playing:false}),[]);
  assert.deepEqual(advanceBubboEffects(effects,16,{hidden:true}),[]);
  for(const options of [{reducedMotion:true},{shifted:1},{recovered:true}]){
    assert.deepEqual(createBubboNeighborReactions({...shot,...options},{board:board(),...options}),[]);
  }
});
