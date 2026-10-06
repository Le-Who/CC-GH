/** The real entry point, production environment, two serial builds. No browser/listener. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {closeBuild,inventoryDigest} from '../yard-normal-preview/closure.mjs';
import {runBuildPerfGuard} from '../../scripts/perf-build-guard.mjs';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(import.meta.dirname,'results'),work=path.join(import.meta.dirname,'work');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
await fs.mkdir(out,{recursive:true});await fs.mkdir(work,{recursive:true});
const report={builds:[],browser:'NOT_RUN',releaseAcceptance:false};
for(const[mode,flag]of[['default','false'],['preview','true']]){
 const env={...process.env,NODE_ENV:'production',VITE_YARD_PIP_PREVIEW:flag,VITE_BUILD_ID:process.env.GITHUB_SHA};
 execFileSync('pnpm',['run','build'],{cwd:root,env,stdio:'inherit',timeout:150000});
 const dist=path.join(root,'dist'),closure=await closeBuild(root,dist,mode);
 const pipReportPath=path.join(work,mode+'-pip-closure-full.json');
 execFileSync('node',['scripts/yard-pip-build-closure.mjs','dist',mode==='default'?'off':'preview',pipReportPath],{cwd:root,env,stdio:'inherit',timeout:30000});
 const pipClosure=JSON.parse(await fs.readFile(pipReportPath,'utf8'));
 const guard=await runBuildPerfGuard({distDir:dist,reportPath:path.join(work,mode+'-budget-full.json')});
 const compact=value=>Array.isArray(value)?value.map(compact):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['files','loadingGraphs','distDir'].includes(key)).map(([key,v])=>[key,compact(v)])):value;
 const r={mode,command:'pnpm run build',environment:{NODE_ENV:'production',VITE_YARD_PIP_PREVIEW:flag,VITE_BUILD_ID:env.VITE_BUILD_ID},fileInventory:closure.fileInventory,compiledModules:closure.compiledModules,startup:closure.startup,optional:closure.optional,assetGuard:compact(guard),pipClosure:compact(pipClosure)};
 report.builds.push(r);await fs.writeFile(path.join(out,'builds.json'),JSON.stringify(report,null,2)+'\n');
 assert(guard.passed,'Current build budget failed: '+JSON.stringify(guard.failures));
 // Keep complete byte inventories in the job, not the <=8MiB artifact.
 await fs.writeFile(path.join(work,mode+'-closure.json'),JSON.stringify(closure,null,2)+'\n');
 if(mode==='default')await fs.rename(dist,path.join(work,'default-dist'));
}
// The API bridge serves exactly the final on build, never a phone fixture bundle.
const final=await fs.readFile(path.join(root,'dist/index.html'),'utf8');assert(final.includes('<div id="root"'));
