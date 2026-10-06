/** Preserve every original; transfer the deterministic lossless ZIP, never a subset. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const EVIDENCE_CAP=8388608,OUTER_ZIP_ALLOWANCE=4096;
export async function packageEvidence({rawDir,workDir,uploadDir,metadata={},log=console.log}){
 await fs.mkdir(workDir,{recursive:true});await fs.mkdir(uploadDir,{recursive:true});
 assert.deepEqual(await fs.readdir(uploadDir),[],'Upload staging must start empty; never hide or replace evidence');
 let manifest,archive;
 const summary={format:'yard-evidence-transfer/v1',...metadata,status:'PACKAGING_FAILED',capBytes:EVIDENCE_CAP,outerZipAllowanceBytes:OUTER_ZIP_ALLOWANCE,retentionDays:3,rawRetainedInJob:true,completeOriginalsStaged:false};
 try{
  const files=[];for(const e of (await fs.readdir(rawDir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){assert(e.isFile()&&!e.isSymbolicLink(),'Evidence must be regular files');assert(/^[A-Za-z0-9_.-]+$/.test(e.name)&&!['.','..','MANIFEST.sha256.json'].includes(e.name),'Unsafe/reserved evidence name');const b=await fs.readFile(path.join(rawDir,e.name));files.push({path:e.name,bytes:b.length,sha256:sha(b)});}
  assert(files.length>0,'No raw evidence to preserve');manifest={format:'yard-lossless-evidence/v1',files};const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),manifestPath=path.join(workDir,'evidence-manifest.json');await fs.writeFile(manifestPath,manifestBytes);
  archive=path.join(workDir,'evidence-candidate.zip');const verified=JSON.parse(execFileSync('python3',['-I',path.join(import.meta.dirname,'evidence-zip.py'),rawDir,manifestPath,archive],{encoding:'utf8',timeout:60000,maxBuffer:65536}));const bytes=await fs.readFile(archive);assert.equal(verified.verifiedOriginals,files.length);assert.equal(verified.archiveBytes,bytes.length);
  Object.assign(summary,{originalCount:files.length,rawBytes:files.reduce((n,r)=>n+r.bytes,0),manifestSha256:sha(manifestBytes),archiveBytes:bytes.length,archiveSha256:sha(bytes),archive:'evidence.zip',status:'PACKAGED',completeOriginalsStaged:true});
  // upload-artifact wraps only these two short-named files. Reserve 4 KiB for
  // its outer ZIP headers in addition to the measured payload + summary bytes.
  let summaryBytes;for(let i=0;i<8;i++){summaryBytes=Buffer.from(JSON.stringify(summary,null,2)+'\n');const bound=bytes.length+summaryBytes.length+OUTER_ZIP_ALLOWANCE;if(summary.transferBytesUpperBound===bound)break;summary.transferBytesUpperBound=bound;}
  summaryBytes=Buffer.from(JSON.stringify(summary,null,2)+'\n');assert.equal(summary.transferBytesUpperBound,bytes.length+summaryBytes.length+OUTER_ZIP_ALLOWANCE);
  if(summary.transferBytesUpperBound>EVIDENCE_CAP){summary.status='OVER_CAP';summary.completeOriginalsStaged=false;summary.uploadScope='Bounded failure summary only. All originals and the complete candidate ZIP remain in the job workspace; they will not be retrievable after the runner is removed.';}
  else await fs.copyFile(archive,path.join(uploadDir,'evidence.zip'));
 }catch(error){await fs.rm(path.join(uploadDir,'evidence.zip'),{force:true});summary.status='PACKAGING_FAILED';summary.completeOriginalsStaged=false;summary.error=String(error.message||error).slice(0,800);summary.uploadScope='Bounded failure summary only; originals remain in the job workspace.';}
 const finalBytes=Buffer.from(JSON.stringify(summary,null,2)+'\n');assert(finalBytes.length<=8192,'Failure/success summary must remain bounded');await fs.writeFile(path.join(uploadDir,'summary.json'),finalBytes);
 const staged=await fs.readdir(uploadDir);assert.deepEqual(staged.sort(),summary.status==='PACKAGED'?['evidence.zip','summary.json']:['summary.json']);let uploadBytes=0;for(const name of staged)uploadBytes+=(await fs.stat(path.join(uploadDir,name))).size;assert(uploadBytes+OUTER_ZIP_ALLOWANCE<=EVIDENCE_CAP,'Staged upload exceeds fixed cap');
 log(JSON.stringify({...summary,stagedUploadBytes:uploadBytes,stagedUploadUpperBound:uploadBytes+OUTER_ZIP_ALLOWANCE}));
 return{ok:summary.status==='PACKAGED',summary,manifest,archive,uploadBytes};
}
