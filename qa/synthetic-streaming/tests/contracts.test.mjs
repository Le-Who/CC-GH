import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AtlasCache} from '../vendor/r5/atlas.mjs';
import {capacity} from '../src/capacity.mjs';
const pins={'atlas.mjs':'2e907692f4d6cae8fbd33f075e2bc9c6bbafa1edee54a92829e22446b1c4910c',
  'decoded-capacity.mjs':'1711ef591364f70e47fb8af1be1f5d919588eb050db796e2eef5093168cf9be6',
  'runtime-cells.mjs':'bf3ade8f8998ca3e33dac5988b4dbf2e793defbf25967286ff11afc5dd5cfc2c'};
test('pinned R5 code is unchanged',async()=>{for(const [file,sha] of Object.entries(pins))
  assert.equal(createHash('sha256').update(await fs.readFile(new URL(`../vendor/r5/${file}`,import.meta.url))).digest('hex'),sha);});
test('phone portrait and landscape fit; desktop DPR2 and phone DPR3 reject the full bound',()=>{
  assert.equal(capacity(390,844,2).totalDecodedBoundBytes,62157924);
  assert.equal(capacity(844,390,2).fits,true);assert.equal(capacity(1280,720,2).totalDecodedBoundBytes,81116004);
  assert.equal(capacity(1280,720,2).fits,false);assert.equal(capacity(390,844,3).fits,false);
});
test('actual R5 prepare rejects desktop 16-page set before any fetch/decode',()=>{
  const atlas=new AtlasCache('https://synthetic.invalid/',16,{externalBytes:()=>capacity(1280,720,2).externalBytes});
  const required=Array.from({length:16},(_,n)=>({index:0,clip:{frameCount:1,pages:[{first:0,count:1,src:`${n}.webp`,width:384,height:1024}]}}));
  assert.throws(()=>atlas.prepare(required),/working set exceeds/);assert.equal(atlas.active,0);assert.equal(atlas.jobs.size,0);atlas.dispose();
});
