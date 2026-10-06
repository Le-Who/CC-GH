/** Reuse fresh normal builds and unchanged strict caps, then close the new asset boundary. */
import './guard-run.mjs';
import '../yard-canonical-acceptance/build.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {inventory} from '../yard-normal-preview/closure.mjs';
import {FOOD_SOURCE,FOOD_SHA,FOOD_BYTES} from './identity.mjs';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'qa/yard-canonical-acceptance/results'),proof=[];
for(const[mode,dir]of[['default','qa/yard-canonical-acceptance/work/default-dist'],['preview','dist']]){
 const rows=await inventory(path.join(root,dir)),food=rows.filter(r=>r.sha256===FOOD_SHA),graph=JSON.parse(await fs.readFile(path.join(root,dir,'game-loading-graph.json'),'utf8'));
 assert.equal(food.length,mode==='default'?0:1);if(food.length)assert.equal(food[0].bytes,FOOD_BYTES);
 assert(!rows.some(r=>/\.(blend|blend1|fbx|obj|map)$/i.test(r.path)),'No source files or source maps in build');
 const by=new Map(graph.chunks.map(c=>[c.file,c])),startup=new Set();function visit(file){if(startup.has(file))return;startup.add(file);for(const dep of by.get(file)?.imports||[])visit(dep);}for(const c of graph.chunks.filter(c=>c.isEntry))visit(c.file);
 const foodChunks=graph.chunks.filter(c=>c.modules.some(m=>/\/(calibrated-food|canonical-food-scene)\.mjs$/.test(m))).map(c=>c.file);
 assert.equal(foodChunks.length>0,mode==='preview');assert(!foodChunks.some(f=>startup.has(f)));
 const sw=await fs.readFile(path.join(root,dir,'sw.js'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});for(const file of [...food.map(r=>r.path),...foodChunks])assert(!sw.includes(file),'No optional food precache');
 proof.push({mode,food,foodChunks,startupExcluded:true,privateNativeFilesAbsent:true,productFoodDefault:false,source:FOOD_SOURCE});
}
await fs.writeFile(path.join(out,'food-builds.json'),JSON.stringify({builds:proof,qualification:'Fresh default/preview source and byte closure; runtime pixels require native evidence.'},null,2)+'\n');
