/** Compact outcome receipt; an over-budget or missing gate never uploads as success. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {packageEvidence} from './package-evidence.mjs';
const out=path.join(import.meta.dirname,'results');await fs.mkdir(out,{recursive:true});
const stages=Object.fromEntries(['PREFLIGHT','DEPENDENCIES','SOURCE','BUILD','BROWSER'].map(name=>[name,process.env[name+'_OUTCOME']??'unknown']));
const proof=JSON.parse(await fs.readFile(path.join(out,'reused.json'),'utf8').catch(()=>'{"verified":false}'));
const receipt={reused:proof.verified?{runId:proof.runId,scope:proof.scope,browserReused:proof.browserReused,defaultBuildReused:false,priorBrowser:{head:proof.base,runId:proof.runId,sections:proof.acquisition.sections},domain:{runId:proof.domain.runId,postgres:proof.domain.postgres}}:null,head:process.env.GITHUB_SHA,stages,acceptance:proof.verified&&Object.values(stages).every(v=>v==='success')?'MECHANICAL_GATES_PASSED_VISUAL_REVIEW_REQUIRED':'FAILED_OR_INCOMPLETE',limits:{jobMinutes:10,artifactBytes:8388608,retentionDays:3,retries:0},excluded:['production activation or deployment','real-device GPU/FPS','trusted native Telegram WebView events','subjective visual acceptance'],files:[]};
for(const e of (await fs.readdir(out,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){assert(e.isFile()&&!e.isSymbolicLink(),'Only bounded evidence files allowed');if(e.name==='receipt.json')continue;const b=await fs.readFile(path.join(out,e.name));receipt.files.push({path:e.name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
const result=await packageEvidence({rawDir:out,workDir:path.join(import.meta.dirname,'work'),uploadDir:path.join(import.meta.dirname,'upload'),metadata:{head:process.env.GITHUB_SHA,mechanicalAcceptance:receipt.acceptance}});
if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,`Yard evidence: ${result.summary.status}. Original files: ${result.summary.originalCount??'unknown'}; raw bytes: ${result.summary.rawBytes??'unknown'}; staged bytes: ${result.uploadBytes}; upload cap: 8388608 bytes including a 4096-byte outer ZIP allowance. Complete originals staged for upload: ${result.ok}.\n${result.summary.uploadScope??'Every original is losslessly archived with a verified SHA-256 manifest.'}\n`);
if(!result.ok)process.exitCode=1;
