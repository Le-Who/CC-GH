import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{planMikaYardQaCruise,sampleMikaYardQaCruise,polygonWithinMask,polygonHitsBox}from'../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../src/games/companion-yard-v2/mika-qa/'+name,import.meta.url)));
const calibration=read('mika-p2-calibration.json'),envelope=read('mika-p2-skin-envelope.json'),mask=read('meadow-mask.json');
const empty={remodel:'meadow',maskRows:mask.rows,obstacles:[{id:'bowl-1',x:21.15,y:79.15,width:7.7,height:7.7}]};
test('one finite cruise is admitted only when its complete conservative sweep clears released ground and props',()=>{
 const plan=planMikaYardQaCruise(empty,calibration,envelope);assert.equal(plan.ok,true);assert.equal(plan.unitsPerSource,8);
 assert.ok(polygonWithinMask(plan.sweep,mask.rows));for(const box of empty.obstacles)assert.equal(polygonHitsBox(plan.sweep,box),false);
 for(const time of [0,.237,1.123,2.331,3.987,4])assert.equal(sampleMikaYardQaCruise(plan,empty,time).status,'ready');
 const blocked=planMikaYardQaCruise({...empty,obstacles:[{id:'blocked',x:0,y:0,width:100,height:100}]},calibration,envelope);assert.equal(blocked.ok,false);
});
test('a layout change aborts this visual-only cruise instead of reusing stale clearance',()=>{
 const plan=planMikaYardQaCruise(empty,calibration,envelope);
 const changed={...empty,obstacles:[...empty.obstacles,{id:'new',x:50,y:50,width:5,height:5}]};
 assert.deepEqual(sampleMikaYardQaCruise(plan,changed,1),{status:'aborted',reason:'LAYOUT_CHANGED'});
 assert.deepEqual(sampleMikaYardQaCruise(plan,empty,1.5),{status:'aborted',reason:'LAYOUT_CHANGED'},'reverting a layout does not silently restart QA');
});

test('existing mouse and cushion footprints are retained while selecting a different clear cruise',()=>{
 const layout={...empty,obstacles:[...empty.obstacles,{id:'mouse',x:40.6,y:43.4,width:8.8,height:3.2},{id:'cushion',x:42.8,y:56.4,width:22.4,height:19.2}]},before=structuredClone(layout);
 const plan=planMikaYardQaCruise(layout,calibration,envelope);assert.equal(plan.ok,true);assert.deepEqual(layout,before);
 for(const box of layout.obstacles)assert.equal(polygonHitsBox(plan.sweep,box),false);
 for(let i=0;i<=240;i++)assert.equal(sampleMikaYardQaCruise(plan,layout,i/60).status,'ready');
});
