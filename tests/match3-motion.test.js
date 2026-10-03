import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch3MotionPlan, sampleMatch3Motion, MATCH3_MOTION } from '../src/game-core/match3/motion.js';
import { applyMatch3Booster, attemptMatch3Move } from '../src/game-core/match3/engine.js';
const board = () => Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ['fire','water','earth','air','light','dark'][(x + y * 2) % 6]));
function seeded(seed, fn) { const old = Math.random; let n = seed; Math.random = () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; }; try { return fn(); } finally { Math.random = old; } }
const normalized = poses => poses.filter(p => p.alpha > .999).map(p => ({ type:p.type,x:Math.round(p.x),y:Math.round(p.y) })).sort((a,b)=>a.y-b.y||a.x-b.x);

test('swap has two opaque moving originals and no duplicate static copies', () => {
  const start = board(), from = { x: 2, y: 3 }, to = { x: 3, y: 3 };
  const plan = createMatch3MotionPlan({ type:'cascade',startBoard:start,from,to });
  const sample = sampleMatch3Motion(plan,75);
  assert.equal(plan.duration,150); assert.equal(sample.poses.length,64);
  assert.equal(sample.poses.filter(p=>p.x===2.5&&p.y===3).length,2);
  assert.ok(sample.poses.every(p=>p.alpha===1)); assert.equal(sample.bursts.length,0);
  assert.equal(sampleMatch3Motion(plan,150).done,true);
});

test('invalid swap goes out and comes back without modifying the board', () => {
  const start = board(), from = { x: 2, y: 3 }, to = { x: 3, y: 3 };
  const plan = createMatch3MotionPlan({ type:'invalid',startBoard:start,from,to });
  assert.equal(plan.duration,180);
  const mid = sampleMatch3Motion(plan,72);
  assert.equal(mid.poses.find(p=>p.type===start[3][2]&&p.y===3).x,2.18);
  assert.deepEqual(plan.finalBoard,start); assert.equal(sampleMatch3Motion(plan,180).done,true);
  const nearEnd = sampleMatch3Motion(plan,179.999).poses.find(p=>p.type===start[3][2]&&p.y===3);
  assert.ok(Math.abs(nearEnd.x-2)<1e-8);
});

test('drop events have intermediate snapshots and specials do not jump straight to final cascade state', () => {
  for (let seed=1;seed<=40;seed++) seeded(seed,()=>{
    const start=board(); start[0][0]='special_row';start[0][3]='special_column';start[5][0]='drop_gold';start[4][0]='drop_energy';
    for (const result of [attemptMatch3Move(start,{x:0,y:0},{x:1,y:0},{collectDrops:true}),applyMatch3Booster(start,'bomb',3,3,{collectDrops:true})]) {
      assert.ok(result.valid);
      for (const step of result.steps) {
        assert.ok(step.motionPhases.length>0);
        const last=step.motionPhases.filter(p=>p.kind==='fall').at(-1);
        assert.deepEqual(last.boardSnapshot,step.boardSnapshot);
      }
      assert.deepEqual(result.steps.at(-1).boardSnapshot,result.board);
    }
  });
});

test('every authored fall preserves token order and lands exactly on its snapshot', () => {
  for (let seed=1;seed<=50;seed++) seeded(seed,()=>{
    const start=board();start[0][0]='special_row';start[0][3]='special_column';start[5][0]='drop_gold';start[4][0]='drop_energy';
    const from={x:0,y:0},to={x:1,y:0},result=attemptMatch3Move(start,from,to,{collectDrops:true});
    const plan=createMatch3MotionPlan({type:'cascade',startBoard:start,from,to,steps:result.steps,finalBoard:result.board});
    assert.deepEqual(sampleMatch3Motion(plan,plan.duration).board,result.board);
    for(const phase of plan.phases.filter(p=>p.kind==='fall')) {
      for(const fraction of [0,.1,.25,.5,.75,.999999]) {
        const sample=sampleMatch3Motion(plan,phase.start+phase.duration*fraction);
        assert.ok(sample.poses.length<=64);
        for(let x=0;x<8;x++) {
          const col=sample.poses.filter(p=>p.x===x).sort((a,b)=>a.y-b.y);
          for(let i=1;i<col.length;i++) assert.ok(col[i].y-col[i-1].y>=1-1e-8,'no vertically crossing refill pieces');
        }
      }
      const landed=sampleMatch3Motion(plan,phase.start+phase.duration-.000001);
      assert.deepEqual(normalized(landed.poses),normalized(phase.after.flatMap((row,y)=>row.map((type,x)=>({type,x,y,alpha:1})))));
    }
  });
});

test('long cascade duration is never truncated to the old 1250ms input lock', () => {
  const start=board();const step={cleared:[],specials:[],motionPhases:[{kind:'fall',fallen:[],filled:[],boardSnapshot:start}],boardSnapshot:start};
  const plan=createMatch3MotionPlan({type:'cascade',startBoard:start,steps:Array.from({length:20},()=>step),finalBoard:start});
  assert.ok(plan.duration>1250);assert.equal(sampleMatch3Motion(plan,1250).done,false);assert.equal(sampleMatch3Motion(plan,plan.duration).done,true);
});

test('reduced motion keeps gem centers fixed, no scale effects or bursts, and ends identically', () => {
  const start=board();start[0][0]='special_row';const from={x:0,y:0},to={x:1,y:0};
  const result=seeded(14,()=>attemptMatch3Move(start,from,to));
  const plan=createMatch3MotionPlan({type:'cascade',startBoard:start,from,to,steps:result.steps,finalBoard:result.board},[],true);
  for(let t=0;t<plan.duration;t+=7) {
    const sample=sampleMatch3Motion(plan,t);assert.equal(sample.bursts.length,0);
    for(const pose of sample.poses){assert.ok(Number.isInteger(pose.x));assert.ok(Number.isInteger(pose.y));assert.equal(pose.scaleX,1);assert.equal(pose.scaleY,1)}
  }
  assert.deepEqual(sampleMatch3Motion(plan,plan.duration).board,result.board);
});

test('millisecond sample boundaries are identical at 30, 60 and 120 Hz', () => {
  const start=board(),plan=createMatch3MotionPlan({type:'invalid',startBoard:start,from:{x:1,y:1},to:{x:2,y:1}});
  const samples=[];
  for(const fps of [30,60,120]) {let elapsed=0;for(let frame=0;frame<fps/10;frame++)elapsed+=1000/fps;samples.push(sampleMatch3Motion(plan,elapsed));}
  for(const sample of samples) assert.ok(Math.abs(sample.progress-100/180)<1e-10);
  assert.ok(MATCH3_MOTION.maxBursts<=18);
});

test('same-cell invalid booster keeps its single target visible for the whole rejection', () => {
  const start=board(),target={x:3,y:4};
  const plan=createMatch3MotionPlan({type:'invalid',startBoard:start,from:target,to:target});
  for(const elapsed of [0,30,72,120,179]) {
    const poses=sampleMatch3Motion(plan,elapsed).poses;
    assert.equal(poses.length,64);
    assert.equal(poses.filter(p=>p.x===target.x&&p.y===target.y&&p.type===start[target.y][target.x]).length,1);
  }
});
