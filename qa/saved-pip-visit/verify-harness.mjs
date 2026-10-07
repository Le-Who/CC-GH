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
