import {measurePlantTranslation} from './e2e/helpers/plantPixelMotion.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {EXTRA_PROFILES} from '../src/games/garden-shelf/living/plant-profiles.mjs';
import {STAGE_PROFILES,stageProfile,IDLE_AMPLITUDES} from '../src/games/garden-shelf/living/plant-stage-profiles.mjs';
const allProfiles={...EXTRA_PROFILES,...Object.fromEntries(Object.entries(STAGE_PROFILES).flatMap(([name,stages])=>stages.map((config,i)=>[name+'-phase-'+i,config])))};
import {DAISY,MONSTERA,FERN,makeGrid,prepareSkin,evaluateSkin,deformGrid,isPinned,sampleMotion,idleScaleForWidth} from '../src/games/garden-shelf/living/plant-motion.mjs';
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

const matureProfiles={daisy:DAISY,monstera:MONSTERA,fern:FERN,...EXTRA_PROFILES};
test('all56 calibrated profiles keep authored pins, timings and interaction amplitudes without mutating source art controls',()=>{
 for(const [name,mature] of Object.entries(matureProfiles))for(let phase=0;phase<4;phase++){
  const original=STAGE_PROFILES[name]?.[phase]??mature,before=JSON.stringify(original),config=stageProfile(name,phase,mature);
  for(const key of ['root','pot','pinY','pins','rootFeather','pinFeather','tapAmplitude','waterAmplitude'])assert.deepEqual(config[key],original[key],name+' '+key);
  config.zones.forEach((zone,i)=>{for(const key of ['base','tip','radius','phase','responseDelay','responseGain'])assert.deepEqual(zone[key],original.zones[i][key]);});
  assert.ok(Math.abs(Math.max(...config.zones.map(z=>z.amplitude))-IDLE_AMPLITUDES[name][phase])<1e-10);
  assert.equal(JSON.stringify(original),before);const grid=makeGrid(12,18),skin=prepareSkin(grid,config);
  assert.deepEqual(evaluateSkin(skin,4,{reduced:true,impulseAge:.15,waterAge:.4}),grid.uv);
 }
});
test('calibrated idle plus overlapping taps and water never invert or collapse56 stage meshes',()=>{
 const grid=makeGrid(24,36);let minRatio=Infinity;
 for(const [name,mature] of Object.entries(matureProfiles))for(let phase=0;phase<4;phase++){
  const config=stageProfile(name,phase,mature),skin=prepareSkin(grid,config);
  for(const seed of [0,1.3,3.2,5.1])for(let t=0;t<12;t+=.1){
   const p=evaluateSkin(skin,t,{seed,impulseAge:t%2.3,waterAge:t%3.7});
   for(let i=0;i<p.length;i+=2){assert.ok(Math.abs(p[i]-grid.uv[i])<=(config.maxDisplacementX??.035)+1e-7);assert.ok(Math.abs(p[i+1]-grid.uv[i+1])<=.0120001);if(isPinned(grid.uv[i],grid.uv[i+1],config)){assert.equal(p[i],grid.uv[i]);assert.equal(p[i+1],grid.uv[i+1]);}}
   for(let j=0;j<grid.indices.length;j+=3){const a=grid.indices[j]*2,b=grid.indices[j+1]*2,c=grid.indices[j+2]*2,area=(p[b]-p[a])*(p[c+1]-p[a+1])-(p[b+1]-p[a+1])*(p[c]-p[a]);const ratio=-area*24*36;minRatio=Math.min(minRatio,ratio);assert.ok(ratio>.08,`${name} phase${phase}: compressed/inverted mesh ${ratio}`);}
  }
 }
 assert.ok(minRatio>.08);
});
test('Daisy leaf-tip idle excursion is visible on small cards and capped on larger artwork',()=>{
 const config=stageProfile('daisy',3,DAISY),tip=config.zones[0].tip;
 for(const width of [60,80,92,140,220]){
  const points=[];for(let t=0;t<12;t+=.05)points.push(sampleMotion(...tip,t,config,{seed:.7,idleScale:idleScaleForWidth(width)})[0]*width);
  const range=Math.max(...points)-Math.min(...points);assert.ok(range>=2&&range<=4.1,`width${width}: ${range}px`);
 }
 assert.equal(idleScaleForWidth(0),1);assert.equal(idleScaleForWidth(NaN),1);
});

test('pixel matcher reports actual leaf displacement and rejects a static or blank patch',()=>{
 const width=60,height=50,reference=new Uint8Array(width*height*3).fill(230);
 for(let y=12;y<34;y++)for(let x=18;x<40;x++)if((x-29)**2+(y-23)**2<110){const i=(y*width+x)*3;reference[i]=80+(x*7+y*3)%110;reference[i+1]=45;reference[i+2]=20;}
 const shifted=new Uint8Array(reference.length).fill(230);for(let y=0;y<height;y++)for(let x=0;x<width-5;x++)for(let c=0;c<3;c++)shifted[(y*width+x+5)*3+c]=reference[(y*width+x)*3+c];
 const measured=measurePlantTranslation(reference,shifted,{width,height,scale:2});assert.equal(measured.x,2.5);assert.equal(measured.y,0);
 assert.equal(measurePlantTranslation(reference,reference,{width,height}).x,0);
 assert.throws(()=>measurePlantTranslation(new Uint8Array(reference.length),new Uint8Array(reference.length),{width,height}),/visible edges/);
});
