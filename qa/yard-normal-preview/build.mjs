/** Three serialized ordinary builds. No backend, browser, or deployment. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {closeBuild,sha} from './closure.mjs';
const here=import.meta.dirname,args=process.argv.slice(2),local=args[0]==='--local';
assert(local?args.length===2:args.length===0,'Usage: build.mjs [--local SOURCE_ROOT]');
if(local)assert.notEqual(process.env.GITHUB_ACTIONS,'true','--local is a file/build-only local capability, not a CI guard bypass');
else assert.equal(process.env.GITHUB_ACTIONS,'true','Use the reviewed GitHub lane or explicit build-only --local SOURCE_ROOT');
const root=local?path.resolve(args[1]):path.resolve(here,'../..'),work=path.join(here,'work'),out=path.join(here,'results');

await fs.mkdir(work,{recursive:true});await fs.mkdir(out,{recursive:true});
const run=(exe,args,cwd=root,env={})=>execFileSync(exe,args,{cwd,env:{...process.env,...env},stdio:'inherit',timeout:180000});
run('node',['scripts/assets-pipeline.mjs']);
const {runBuildPerfGuard}=await import(pathToFileURL(path.join(root,'scripts/perf-build-guard.mjs')));
const results={execution:local?'EXPLICIT_LOCAL_BUILD_ONLY':'REVIEWED_GITHUB_BUILD',sourceBuilds:[],assetGuards:[],browser:'NOT_RUN',releaseAcceptance:false};
for(const [mode,flag]of [['default','false'],['preview','true']]){
 const dist=path.join(work,mode);run('node',['--max-old-space-size=1536','node_modules/vite/bin/vite.js','build','--outDir',dist],root,{NODE_ENV:'production',VITE_YARD_PIP_PREVIEW:flag,VITE_BUILD_ID:'yard-coherent-scene-qa-20261006'});
 const closure=await closeBuild(root,dist,mode);await fs.writeFile(path.join(work,mode+'-closure.json'),JSON.stringify(closure,null,2)+'\n');
 results.sourceBuilds.push({mode,passed:true,files:closure.totalFiles,bytes:closure.totalBytes,optionalAssets:closure.optional.length,fileInventory:closure.fileInventory,fullEmittedInventory:closure.fullEmittedInventory,compiledModules:closure.compiledModules,buildEnvironment:{NODE_ENV:'production',previewFlag:flag}});
 const fullReportPath=path.join(work,mode+'-asset-guard-full.json');
 const guard=await runBuildPerfGuard({distDir:dist,reportPath:fullReportPath});
 const fullReport=await fs.readFile(fullReportPath);
 const compact=value=>Array.isArray(value)?value.map(compact):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['files','loadingGraphs','distDir'].includes(k)).map(([k,v])=>[k,compact(v)])):value;
 await fs.writeFile(path.join(out,mode+'-asset-guard.json'),JSON.stringify({...compact(guard),fullReport:{bytes:fullReport.length,sha256:sha(fullReport),qualification:'Full fresh-walk report stays in job work area. This bounded artifact retains every budget/metric total, category result and failure.'}},null,2)+'\n');
 results.assetGuards.push({mode,passed:guard.passed,failures:guard.failures});
 await fs.writeFile(path.join(out,'source-builds-and-guards.json'),JSON.stringify(results,null,2)+'\n');
 assert(guard.passed,'Current scoped asset guard failed: '+JSON.stringify(guard.failures));
}
run('python3',[path.join(here,'prepare-preview.py'),root]);
const preview=path.join(work,'preview-source');run('node',['--max-old-space-size=1536','node_modules/vite/bin/vite.js','build','--config','vite.phone-preview.config.mjs'],preview,{NODE_ENV:'production',VITE_YARD_PIP_PREVIEW:'true',VITE_BUILD_ID:'yard-coherent-scene-qa-20261006'});
const phone=await closeBuild(preview,path.join(preview,'preview-dist'),'phone',{prune:true});await fs.writeFile(path.join(work,'phone-closure.json'),JSON.stringify(phone,null,2)+'\n');
results.sourceBuilds.push({mode:'phone',passed:true,files:phone.totalFiles,bytes:phone.totalBytes,optionalAssets:phone.optional.length,fileInventory:phone.fileInventory,fullEmittedInventory:phone.fullEmittedInventory,compiledModules:phone.compiledModules,buildEnvironment:{NODE_ENV:'production',previewFlag:'true'}});
await fs.writeFile(path.join(out,'phone-files-manifest.json'),JSON.stringify({format:'yard-tested-phone-file-manifest/v1',fileInventory:phone.fileInventory,files:phone.files.map(({path,bytes,sha256})=>({path,bytes,sha256})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)})+'\n');
await fs.writeFile(path.join(out,'source-builds-and-guards.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
