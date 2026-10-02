import test from 'node:test';
import assert from 'node:assert/strict';
import {DAISY,MONSTERA,FERN,isPinned,makeGrid,sampleMotion,deformGrid,prepareSkin,evaluateSkin,createPresentationClock} from '../src/games/garden-shelf/living/plant-motion.mjs';
test('pot and soil boundary remain exactly stationary',()=>{
  for(let t=0;t<20;t+=0.13)for(let x=0;x<=1;x+=.05)for(const y of [.67,.7,.8,.95,1])assert.deepEqual(sampleMotion(x,y,t,DAISY,{impulseAge:.15,waterAge:.4}),[x,y]);
});
test('reduced motion yields unchanged vertices even after interaction',()=>{
  const grid=makeGrid();assert.deepEqual(deformGrid(grid,100,DAISY,{reduced:true,impulseAge:.2}),grid.uv);
});
test('motion stays finite and within small bounded displacements',()=>{
  for(let t=0;t<20;t+=.19)for(let y=0;y<=1;y+=.05)for(let x=0;x<=1;x+=.05){const p=sampleMotion(x,y,t,DAISY,{impulseAge:t,waterAge:t});assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p[0]-x)<=.035001);assert.ok(Math.abs(p[1]-y)<=.012001);}
});
test('three flower tips have distinct relative movement, no global rigid wobble',()=>{
  const v=DAISY.zones.slice(0,3).map(z=>sampleMotion(...z.tip,1).map((n,i)=>n-z.tip[i]));assert.notDeepEqual(v[0],v[1]);assert.notDeepEqual(v[1],v[2]);
});
test('topology remains oriented for sampled time and touch response',()=>{
  const grid=makeGrid(24,32);
  for(let t=0;t<12;t+=.11){const p=deformGrid(grid,t,DAISY,{impulseAge:t,waterAge:t});for(let j=0;j<grid.indices.length;j+=3){const [a,b,c]=Array.from(grid.indices.slice(j,j+3)).map(i=>[p[i*2],p[i*2+1]]);const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);assert.ok(area<0,'triangle inversion');}}
});
test('hidden tab and long stall never cause an animation catch-up burst',()=>{
  const clock=createPresentationClock();assert.equal(clock.step(100),0);clock.step(120);clock.setVisible(false);clock.step(100000);clock.setVisible(true);assert.equal(clock.step(200000),.02);assert.equal(clock.step(400000),.07);
});
test('invalid numeric inputs and excessive grids rejected',()=>{
  assert.throws(()=>sampleMotion(0,0,NaN));assert.throws(()=>makeGrid(0,4));assert.throws(()=>makeGrid(256,4));
});
test('hanging foliage moves while each species pot and crown stay fixed',()=>{
 for(const config of [MONSTERA,FERN]){
  assert.deepEqual(sampleMotion(.5,.8,2,config),[.5,.8]);
  assert.deepEqual(sampleMotion(...config.root,2,config),config.root);
  const zone=config.zones.at(-1);const result=sampleMotion(...zone.tip,2,config);assert.notDeepEqual(result,zone.tip);
 }
});
test('all species remain unfolded and pinned at sampled touch and water times',()=>{
 const grid=makeGrid(32,48);
 for(const config of [MONSTERA,FERN])for(let t=0;t<7;t+=.14){
  const p=deformGrid(grid,t,config,{impulseAge:t,waterAge:t});
  for(let i=0;i<grid.uv.length;i+=2)if(isPinned(grid.uv[i],grid.uv[i+1],config)){assert.equal(p[i],grid.uv[i]);assert.equal(p[i+1],grid.uv[i+1]);}
  for(let j=0;j<grid.indices.length;j+=3){const [a,b,c]=Array.from(grid.indices.slice(j,j+3)).map(i=>[p[i*2],p[i*2+1]]);assert.ok((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0);}
 }
});
test('optimized skin matches reference motion for each species and interaction',()=>{
 const grid=makeGrid(16,24);
 for(const config of [DAISY,MONSTERA,FERN]){
  const skin=prepareSkin(grid,config);
  for(let t=0;t<6;t+=.17){const options={impulseAge:t-2,waterAge:t-4,seed:.8};const a=deformGrid(grid,t,config,options),b=evaluateSkin(skin,t,options);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-7);}
 }
});
test('additional fixed supports and species response gains agree with prepared skin',()=>{
 const config={...DAISY,pinY:null,pot:[.3,.7,.7,1],pins:[[.47,0,.53,.4]],tapAmplitude:.002,waterAmplitude:.001};
 const grid=makeGrid(24,32),skin=prepareSkin(grid,config);
 for(const point of [[.5,.2],[.5,.8]])assert.deepEqual(sampleMotion(...point,1,config,{impulseAge:.1,waterAge:.3}),point);
 for(const t of [0,.1,.3,.8,2]){const options={impulseAge:t,waterAge:t,seed:.4},a=deformGrid(grid,t,config,options),b=evaluateSkin(skin,t,options);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-7);}
 const noResponse={...DAISY,tapAmplitude:0,waterAmplitude:0};
 assert.deepEqual(sampleMotion(.54,.14,1,noResponse,{impulseAge:.1,waterAge:.2}),sampleMotion(.54,.14,1,noResponse));
});
