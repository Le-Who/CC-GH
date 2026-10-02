import test from 'node:test';import assert from 'node:assert/strict';
import {EXTRA_PROFILES} from '../src/plant-profiles.mjs';
import {STAGE_PROFILES} from '../src/plant-stage-profiles.mjs';
const allProfiles={...EXTRA_PROFILES,...Object.fromEntries(Object.entries(STAGE_PROFILES).flatMap(([name,stages])=>stages.map((config,i)=>[name+'-phase-'+i,config])))};
import {makeGrid,prepareSkin,evaluateSkin,deformGrid,isPinned,sampleMotion} from '../src/plant-motion.mjs';
test('all species and stage profiles retain oriented geometry and fixed supports',()=>{
 const grid=makeGrid(24,36);
 for(const [name,config] of Object.entries(allProfiles)){
 const skin=prepareSkin(grid,config);
 for(let t=0;t<4;t+=.09){const p=evaluateSkin(skin,t,{impulseAge:t,waterAge:t-.4,seed:.2});
 for(let i=0;i<p.length;i+=2){assert.ok(Number.isFinite(p[i])&&Number.isFinite(p[i+1]),name);if(isPinned(grid.uv[i],grid.uv[i+1],config)){assert.equal(p[i],grid.uv[i]);assert.equal(p[i+1],grid.uv[i+1]);}}
 for(let j=0;j<grid.indices.length;j+=3){const a=grid.indices[j]*2,b=grid.indices[j+1]*2,c=grid.indices[j+2]*2;const area=(p[b]-p[a])*(p[c+1]-p[a+1])-(p[b+1]-p[a+1])*(p[c]-p[a]);assert.ok(area<0,`${name} folded at ${t}`);}
 }
 const options={impulseAge:.2,waterAge:.7,seed:.9},a=deformGrid(grid,2,config,options),b=evaluateSkin(skin,2,options);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-7,name);
 }
});
test('unsaturated response displacement is independent of randomized idle seed',()=>{
 for(const config of Object.values(allProfiles)){const z=config.zones[0],deltas=[];for(const seed of [0,1,2,3,4,5]){const a=sampleMotion(...z.tip,0,config,{seed}),b=sampleMotion(...z.tip,0,config,{seed,impulseAge:.03});deltas.push(b[0]-a[0]);}for(const delta of deltas)assert.ok(Math.abs(delta-deltas[0])<1e-9);}
});
