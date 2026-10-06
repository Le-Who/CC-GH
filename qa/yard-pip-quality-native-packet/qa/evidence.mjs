/** Package every source-stage/native original losslessly; failure is never green. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {installedPaths,BASE} from './ci-contract.mjs';
import {sha} from './overlay.mjs';
export function stageVerdict(stages,native){return ['PREFLIGHT','DEPENDENCIES','SOURCE','BUILD','BROWSER'].every(k=>stages[k]==='success')&&native?.status==='TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING'&&native.identity?.passed===true&&native.externalIdentity?.passed===true&&native.phases?.cost==='measured-cpu-submission-only'&&native.disposal?.probe?.renderer?.qualityProbe?.copy?.disposed===true?'TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING':'FAILED_OR_INCOMPLETE';}
export async function finalizeEvidence(p,env,log=console.log){
  // Creating results/package staging here cannot precreate p.build. The build
  // retains exclusive mkdir semantics even after an early failed preflight.
  await fs.mkdir(p.results,{recursive:true});
  const stages=Object.fromEntries(['PREFLIGHT','DEPENDENCIES','SOURCE','BUILD','BROWSER'].map(k=>[k,env[k+'_OUTCOME']??'unknown']));
  const nativePath=path.join(p.build,'evidence/report.json');let native=null,nativeReadError=null;
  try{native=JSON.parse(await fs.readFile(nativePath));}catch(error){nativeReadError=String(error.message).slice(0,800);}
  const acceptance=stageVerdict(stages,native),receipt={format:'pip-quality-ci-receipt/v1',head:env.GITHUB_SHA??null,base:BASE,correctnessRunId:'37520075881',stages,acceptance,nativeReadError,visualAcceptance:'PENDING_NATIVE_IMAGE_REVIEW',releaseAcceptance:false,productionActivation:false,limits:{jobMinutes:10,browserSeconds:240,artifactBytes:8388608,outerZipAllowance:4096,retentionDays:3,retries:0}};
  await fs.writeFile(path.join(p.results,'stage-outcomes.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  let combined=path.join(p.packageWork,'all-originals'),collectionError=null;const origins=[];
  try{await fs.mkdir(p.packageWork);await fs.mkdir(combined);
  for(const[label,dir]of[['stage',p.results],['native',path.join(p.build,'evidence')]]){
    const entries=await fs.readdir(dir,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return[];throw error;});
    for(const e of entries.sort((a,b)=>a.name.localeCompare(b.name))){assert(e.isFile()&&!e.isSymbolicLink(),'All evidence originals must be regular flat files');const bytes=await fs.readFile(path.join(dir,e.name)),name=label+'-'+e.name;
      await fs.writeFile(path.join(combined,name),bytes,{flag:'wx'});origins.push({archivePath:name,originalGroup:label,originalPath:e.name,bytes:bytes.length,sha256:sha(bytes)});
    }
  }
  await fs.writeFile(path.join(combined,'original-paths.json'),JSON.stringify({renamingOnly:'Group prefix prevents filename collisions; original bytes are unchanged and every file is included',files:origins},null,2)+'\n',{flag:'wx'});
  }catch(error){collectionError=String(error.message).slice(0,800);combined=path.join(p.packageWork,'collection-failed-no-partial-upload');}
  const {packageEvidence}=await import(pathToFileURL(path.join(p.root,'qa/yard-canonical-acceptance/package-evidence.mjs')));
  const result=await packageEvidence({rawDir:combined,workDir:path.join(p.packageWork,'zip'),uploadDir:p.upload,metadata:{head:env.GITHUB_SHA??null,mechanicalAcceptance:collectionError?'FAILED_OR_INCOMPLETE':acceptance,stages,...(collectionError?{collectionError}: {})},log});
  if(env.GITHUB_STEP_SUMMARY)await fs.appendFile(env.GITHUB_STEP_SUMMARY,`Pip quality: ${acceptance}. Evidence ${result.summary.status}; complete original files staged: ${result.ok}; transfer upper bound ${result.summary.transferBytesUpperBound??'unavailable'} bytes of 8388608 including 4096 outer ZIP allowance. Visual quality remains unaccepted.\n`);
  return{...result,ok:result.ok&&acceptance==='TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING',receipt,allStagesPassed:acceptance==='TECHNICAL_GATES_PASSED_VISUAL_REVIEW_PENDING'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const result=await finalizeEvidence(installedPaths(),process.env);if(!result.ok||!result.allStagesPassed)process.exitCode=1;}
