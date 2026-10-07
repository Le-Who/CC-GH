import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {here,assetRoot,roots,resolveSource,pip} from './config.mjs';
const require=createRequire(path.join(process.env.YARD_DEPENDENCY_ROOT||assetRoot,'package.json'));
const {build}=require('esbuild');
const result=await build({entryPoints:[path.join(here,'harness.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',metafile:true,logLevel:'silent',plugins:[{name:'exact-qualification-source',setup(b){
 b.onResolve({filter:/./},args=>{if(args.path.startsWith('/source/'))return {path:resolveSource(args.path.slice(8))};if(args.path==='three')return{path:resolveSource(pip+'vendor/three/build/three.module.js')};
 const root=roots.find(r=>args.importer.startsWith(r+'/'));if(root&&args.path.startsWith('.'))return {path:resolveSource(path.relative(root,path.resolve(path.dirname(args.importer),args.path)))};});
}}]});
const report={passed:true,scope:'In-memory browser import-graph compile only. No product build artifact, browser execution, screenshot or art approval.',inputFiles:Object.keys(result.metafile.inputs),bundledBytes:result.outputFiles.reduce((n,f)=>n+f.contents.length,0),warnings:result.warnings};fs.writeFileSync(path.join(here,'harness-static-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,inputFiles:report.inputFiles.length,bundledBytes:report.bundledBytes,warnings:report.warnings.length}));
// Static imports and literal dynamic resources are both part of the closure;
// esbuild alone cannot discover the fetched analytical coat GLSL helper.
const {createHash}=await import('node:crypto');
const sourcePins=JSON.parse(fs.readFileSync(path.join(here,'source-provenance.json'))),assetPins=JSON.parse(fs.readFileSync(path.join(here,'asset-provenance.json')));
const pins=new Map([...sourcePins.baseline,...sourcePins.overlay,...assetPins.assets].map(row=>[row.path,row]));
const physical=new Map([...pins.keys()].map(relative=>[path.resolve(resolveSource(relative)),relative]));
const imported=[];
for(const input of report.inputFiles){const full=path.resolve(input);if(full===path.join(here,'harness.mjs'))continue;if(!physical.has(full))throw Error('Unpinned browser import: '+input);imported.push(physical.get(full));}
const harness=fs.readFileSync(path.join(here,'harness.mjs'),'utf8');
const dynamic=[...harness.matchAll(/root\s*\+\s*['"]([^'"]+)['"]/g)].map(m=>pip+m[1]);
// Canonical food's loader receives its URL from the pinned resource owner.
for(const asset of assetPins.assets)dynamic.push(asset.path);
for(const relative of new Set(dynamic)){
 const expected=pins.get(relative);if(!expected)throw Error('Unpinned dynamic native resource: '+relative);
 const bytes=fs.readFileSync(resolveSource(relative)),actual=createHash('sha256').update(bytes).digest('hex');
 if(actual!==expected.sha256)throw Error('Changed dynamic native resource: '+relative);
}
fs.writeFileSync(path.join(here,'complete-resource-closure.json'),JSON.stringify({passed:true,imports:[...new Set(imported)],dynamicResources:[...new Set(dynamic)],scope:'Every esbuild-resolved browser import, harness fetch literal, analytical shader, and admitted self-contained GLB/background asset.'},null,2)+'\n');
console.log(JSON.stringify({resourceClosurePassed:true,imports:new Set(imported).size,dynamicResources:new Set(dynamic).size}));
