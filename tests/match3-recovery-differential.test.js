import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {composeMatch3} from '../src/games/match3/match3Composition.js';
import layout from '../src/app/hud-layout/defaultLayouts/match3.json' with {type:'json'};
const require=createRequire(import.meta.url),{extract}=require('../recovery-tools/ast-recovery.cjs');
const original='/workspace/shared/cc-gh-arcade-release-inputs-20261002/match3/dist-match3-preview/assets/host-DWKWGqAK.js';
const fixturePath=new URL('./fixtures/match3-v2-composition-reference.txt',import.meta.url);
const raw=fs.readFileSync(fixturePath,'utf8');
const reference=vm.runInNewContext(raw+';W2',{pb:layout});
const clean=x=>JSON.parse(JSON.stringify(x));
test('Match3 geometry and five tool targets match frozen preview across 180 viewport/profile/inset cases',()=>{
 let count=0;
 for(const[width,height]of[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720],[393,873]])for(const profile of Object.values(layout.profiles))for(const safe of [{},{top:24,bottom:34,left:16,right:16},{top:0,bottom:0,left:0,right:0}]){
  const input={width,height,safe,hudLayout:{regions:{...layout.base.regions,...profile.regions}}};
  const actual=composeMatch3(input);assert.deepEqual(clean(actual),clean(reference(input)));assert.equal(actual.board.rows,8);assert.equal(actual.board.cols,8);count++;
 }
 assert.equal(count,180);
});
