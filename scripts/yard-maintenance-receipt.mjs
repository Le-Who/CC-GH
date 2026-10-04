/** Read-only authoritative GitHub receipt adapter. No candidate code is loaded. */
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {sha256} from './yard-active-maintenance.mjs';

export const REPOSITORY='le-who/cc-gh';
const REPOSITORY_ID=1162268629,integer=n=>Number.isSafeInteger(n)&&n>0;
const successful=(value,label)=>{assert.equal(value?.status,'completed',`${label} incomplete`);assert.equal(value.conclusion,'success',`${label} failed or skipped`);};
const exactSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export function receiptInventory(kind){
 assert.ok(['activation','maintenance'].includes(kind));
 return kind==='activation'?[
  ['validate / ACTIVE ordinary imports',['Verify exact ACTIVE tree before installing or building','Build ordinary ACTIVE client','Check ordinary ACTIVE behavior and real adapter metadata','Check ACTIVE loading graph and exact delivered bytes']],
  ['validate / ACTIVE published-image preflight',['Validate exact ACTIVE tree and published-image acceptance safety']],
  ['validate / Exact source release acceptance',['Require the complete mode-specific result set']],
  ['build-and-push',['Verify published Yard acceptance inputs','Require nine cases on the exact published Yard digest','Require committed ACTIVE published-image proof']],
  ['deploy',['Deploy isolated CC-GH stack']],
 ]:[
  ['Accept published ACTIVE maintenance',['Verify exact maintenance source and authoritative predecessor','Run ordinary build and affected-game checks','Require published P-C-P production acceptance']],
  ['Deploy accepted ACTIVE maintenance',['Recheck current reviewed release immediately before switch','Verify exact live predecessor and switch accepted digest']],
 ];
}
export function validateReceiptRun(run,locator,release){
 assert.ok(['artifact','reviewed-archive'].includes(locator.mode),'Explicit receipt evidence mode required');
 assert.equal(run.id,locator.runId);assert.equal(run.run_attempt,locator.runAttempt);successful(run,'Predecessor deployment');
 for(const key of ['repository','head_repository']){assert.equal(run[key]?.id,REPOSITORY_ID);assert.equal(run[key]?.full_name?.toLowerCase(),REPOSITORY);}
 assert.ok(['push','workflow_dispatch'].includes(run.event),'PR/fork receipts cannot establish deployed source');
 assert.equal(run.head_sha,release.commit);assert.equal(run.path,locator.workflowPath);
 assert.equal(locator.workflowPath,locator.kind==='activation'?'.github/workflows/deploy.yml':'.github/workflows/yard-maintenance-release.yml');
 assert.ok(integer(run.workflow_id));assert.ok(integer(locator.runId)&&integer(locator.runAttempt)&&integer(locator.artifactId));
 for(const key of ['archiveSha256','passSha256','identitySha256','workflowSha256','ciWorkflowSha256'])assert.ok(exactSha(locator[key]),`Exact ${key} required`);
 return run;
}
export function validateReceiptJobs(jobs,run,locator){
 assert.ok(Array.isArray(jobs)&&jobs.length&&jobs.length<=1000);const latest=new Map(),ids=new Set();
 for(const job of jobs){assert.ok(integer(job.id)&&!ids.has(job.id));ids.add(job.id);assert.equal(job.run_id,run.id);assert.equal(job.head_sha,run.head_sha);assert.ok(integer(job.run_attempt)&&job.run_attempt<=run.run_attempt);const old=latest.get(job.name);assert.ok(!old||old.run_attempt!==job.run_attempt,'Ambiguous named job attempt');if(!old||old.run_attempt<job.run_attempt)latest.set(job.name,job);}
 return receiptInventory(locator.kind).map(([name,steps])=>{const job=latest.get(name);successful(job,name);assert.ok(Array.isArray(job.steps));for(const name of steps){const match=job.steps.filter(step=>step.name===name);assert.equal(match.length,1,'Missing/duplicate required receipt step');successful(match[0],name);}return {name,id:job.id,attempt:job.run_attempt};});
}

/** Bounded ZIP reader; selected JSON only, never extracts filesystem entries. */
export function readReceiptZip(bytes){
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=22&&bytes.length<=256*1024*1024,'Bounded receipt archive required');
 let end=-1;for(let n=bytes.length-22;n>=Math.max(0,bytes.length-65557);n--)if(bytes.readUInt32LE(n)===0x06054b50&&n+22+bytes.readUInt16LE(n+20)===bytes.length){end=n;break;}
 assert.ok(end>=0,'ZIP directory missing');assert.equal(bytes.readUInt16LE(end+4),0);assert.equal(bytes.readUInt16LE(end+6),0);
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);assert.ok(count>0&&count<10000&&start+size<=end);assert.equal(bytes.readUInt16LE(end+8),count);
 const selected={},names=new Set();let at=start;
 for(let n=0;n<count;n++){
  assert.ok(at+46<=start+size);assert.equal(bytes.readUInt32LE(at),0x02014b50);const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),packed=bytes.readUInt32LE(at+20),length=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extraLength=bytes.readUInt16LE(at+30),commentLength=bytes.readUInt16LE(at+32),offset=bytes.readUInt32LE(at+42);
  assert.ok(at+46+nameLength+extraLength+commentLength<=start+size);const name=bytes.subarray(at+46,at+46+nameLength).toString('utf8');assert.ok(!names.has(name));names.add(name);assert.ok(!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').includes('..'));at+=46+nameLength+extraLength+commentLength;
  if(!['PASS.json','image-identity.json'].includes(name))continue;
  assert.equal(flags&1,0,'Encrypted evidence refused');assert.ok([0,8].includes(method));assert.ok(length<=1024*1024&&packed<=4*1024*1024);assert.ok(offset+30<=start);assert.equal(bytes.readUInt32LE(offset),0x04034b50);
  const localName=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),dataAt=offset+30+localName+localExtra;assert.ok(dataAt+packed<=start);assert.equal(bytes.subarray(offset+30,offset+30+localName).toString('utf8'),name);
  const payload=bytes.subarray(dataAt,dataAt+packed),decoded=method===0?payload:inflateRawSync(payload,{maxOutputLength:1024*1024});assert.equal(decoded.length,length);selected[name]=Buffer.from(decoded);
 }
 assert.equal(at,start+size);assert.deepEqual(Object.keys(selected).sort(),['PASS.json','image-identity.json']);return selected;
}
export function normalizeAcceptedReceipt({record,locator,run,jobs,artifact,archive,archivedFiles,workflowBytes,ciWorkflowBytes}){
 const p=record.predecessor;validateReceiptRun(run,locator,p);const acceptedJobs=validateReceiptJobs(jobs,run,locator);
 assert.equal(sha256(workflowBytes),locator.workflowSha256,'Receipt workflow differs from reviewed bytes');
 assert.equal(sha256(ciWorkflowBytes),locator.ciWorkflowSha256,'Receipt reusable CI differs from reviewed bytes');
 assert.equal(artifact.id,locator.artifactId);assert.equal(artifact.expired,false);assert.equal(artifact.workflow_run?.id,run.id);assert.equal(artifact.workflow_run?.head_sha,p.commit);
 assert.equal(artifact.name,locator.kind==='activation'?`yard-published-production-${p.commit}-${locator.runAttempt}`:`yard-maintenance-production-${p.commit}-${locator.runAttempt}`);
 assert.equal(artifact.digest,`sha256:${locator.archiveSha256}`);
 let selected;
 if(locator.mode==='artifact'){assert.equal(sha256(archive),locator.archiveSha256);selected=readReceiptZip(archive);}
 else{assert.ok(archivedFiles,'Explicit reviewed immutable archive required');selected=archivedFiles;}
 assert.equal(sha256(selected['PASS.json']),locator.passSha256);assert.equal(sha256(selected['image-identity.json']),locator.identitySha256);
 const pass=JSON.parse(selected['PASS.json']),identity=JSON.parse(selected['image-identity.json']);
 assert.equal(pass.format,locator.kind==='activation'?'cc-gh-yard-production-acceptance/v1':'cc-gh-yard-maintenance-acceptance/v1');assert.equal(pass.activeCommit,p.commit);assert.equal(pass.activeDigest,p.imageDigest);assert.equal(pass.activeImageId,p.imageId);assert.equal(pass.retries,0);
 assert.equal(pass.repository,`ghcr.io/${REPOSITORY}`);
 assert.equal(identity.runId,pass.runId);assert.match(pass.runId,/^[a-f0-9-]{36}$/);assert.equal(identity.inputs.activeCommit,p.commit);assert.equal(identity.inputs.activeDigest,p.imageDigest);assert.equal(identity.imageB.Id,p.imageId);
 assert.ok(Array.isArray(identity.imageB.RepoDigests)&&identity.imageB.RepoDigests.includes(`ghcr.io/${REPOSITORY}@${p.imageDigest}`));assert.equal(identity.compatibility.B.buildId,p.commit);assert.equal(identity.compatibility.B.playerRolloutEnabled,true);
 assert.equal(sha256(JSON.stringify(identity.compatibility.B)+'\n'),p.compatibilitySha256,'Image capability bytes differ from the approved predecessor');
 if(locator.kind==='activation'){assert.equal(p.commit,record.anchor.commit);assert.equal(pass.tests,9);assert.equal(pass.closedCommit,record.anchor.closedBuildId);assert.equal(pass.closedDigest,record.anchor.closedImageDigest);}
 else{assert.deepEqual(pass.initialActivation,record.anchor);assert.ok(Array.isArray(pass.affectedGames)&&pass.affectedGames.length<=12);assert.equal(new Set(pass.affectedGames).size,pass.affectedGames.length);assert.equal(pass.tests,6+pass.affectedGames.length);assert.equal(identity.compatibility.B.format,'cc-gh-yard-release-compatibility/v2');assert.deepEqual(identity.compatibility.B.initialActivation,record.anchor);assert.equal(pass.recordSha256,identity.compatibility.B.maintenanceRecordSha256);}
 const evidence={runId:run.id,runAttempt:run.run_attempt,status:'completed',conclusion:'success',headCommit:p.commit,artifactSha256:locator.archiveSha256};
 return {format:'cc-gh-yard-accepted-active/v1',repository:REPOSITORY,repositoryId:REPOSITORY_ID,status:'accepted',release:{commit:p.commit,tree:p.tree,imageDigest:p.imageDigest,imageId:p.imageId},initialActivation:record.anchor,acceptance:evidence,deployment:evidence,jobs:acceptedJobs};
}

async function readGithubPredecessor({record,locator,token,fetchImpl=fetch}){
 assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0','Verified TLS required');
 assert.equal(typeof token,'string');assert.ok(token.length,'Read-only GitHub token required');
 assert.ok(locator&&integer(locator.runId)&&integer(locator.runAttempt)&&integer(locator.artifactId));receiptInventory(locator.kind);
 const api=async(path,{binary=false,redirect='error'}={})=>{
  assert.ok(path.startsWith(`/repos/${REPOSITORY}/`));const response=await fetchImpl(`https://api.github.com${path}`,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect,signal:AbortSignal.timeout(15000)});
  if(binary)return response;assert.equal(response.status,200);const text=await response.text();assert.ok(Buffer.byteLength(text)<=4*1024*1024);return JSON.parse(text);
 };
 const path=`/repos/${REPOSITORY}/actions/runs/${locator.runId}`,run=await api(path);validateReceiptRun(run,locator,record.predecessor);
 const attempt=await api(`${path}/attempts/${locator.runAttempt}`);validateReceiptRun(attempt,locator,record.predecessor);
 const commit=await api(`/repos/${REPOSITORY}/git/commits/${record.predecessor.commit}`);assert.equal(commit.sha,record.predecessor.commit);assert.equal(commit.tree.sha,record.predecessor.tree);
 const workflow=await api(`/repos/${REPOSITORY}/contents/${locator.workflowPath}?ref=${record.predecessor.commit}`);assert.equal(workflow.encoding,'base64');const workflowBytes=Buffer.from(workflow.content,'base64');
 const ci=await api(`/repos/${REPOSITORY}/contents/.github/workflows/ci.yml?ref=${record.predecessor.commit}`);assert.equal(ci.encoding,'base64');const ciWorkflowBytes=Buffer.from(ci.content,'base64');
 const jobs=[];let total;for(let page=1;page<=10;page++){const result=await api(`${path}/jobs?filter=all&per_page=100&page=${page}`);assert.ok(integer(result.total_count)&&result.total_count<=1000);if(total===undefined)total=result.total_count;assert.equal(result.total_count,total);assert.ok(Array.isArray(result.jobs)&&result.jobs.length<=100);jobs.push(...result.jobs);if(jobs.length===total)break;assert.ok(jobs.length<total&&result.jobs.length===100);}assert.equal(jobs.length,total);
 let artifact,archive,archivedFiles;
 if(locator.mode==='artifact'){
  artifact=await api(`/repos/${REPOSITORY}/actions/artifacts/${locator.artifactId}`);assert.ok(artifact.size_in_bytes>0&&artifact.size_in_bytes<=256*1024*1024);
  const redirect=await api(`/repos/${REPOSITORY}/actions/artifacts/${locator.artifactId}/zip`,{binary:true,redirect:'manual'});assert.equal(redirect.status,302);
  const url=new URL(redirect.headers.get('location'));assert.equal(url.protocol,'https:');assert.ok(!url.username&&!url.password);assert.ok(/(^|\.)(blob\.core\.windows\.net|githubusercontent\.com|actions\.githubusercontent\.com)$/.test(url.hostname),'Unrecognized artifact download host');
  // Never forward GitHub credentials to the signed artifact download URL.
  const download=await fetchImpl(url.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(60000)});assert.equal(download.status,200);const chunks=[];let size=0;
  for await(const chunk of download.body){size+=chunk.length;assert.ok(size<=256*1024*1024,'Oversized artifact stream');chunks.push(Buffer.from(chunk));}
  archive=Buffer.concat(chunks);
 }else{
  assert.match(locator.reviewedArchive?.commit||'',/^[a-f0-9]{40}$/);assert.ok(exactSha(locator.reviewedArchive.sha256));
  const archivePath=`release-evidence/yard/${record.predecessor.commit}/receipt.json`;
  const stored=await api(`/repos/${REPOSITORY}/contents/${archivePath}?ref=${locator.reviewedArchive.commit}`);assert.equal(stored.encoding,'base64');
  const bytes=Buffer.from(stored.content,'base64');assert.ok(bytes.length<=2*1024*1024);assert.equal(sha256(bytes),locator.reviewedArchive.sha256,'Reviewed durable receipt archive changed');
  const saved=JSON.parse(bytes);assert.equal(saved.format,'cc-gh-yard-receipt-archive/v1');artifact=saved.artifact;
  assert.equal(typeof saved.passJson,'string');assert.equal(typeof saved.identityJson,'string');archivedFiles={'PASS.json':Buffer.from(saved.passJson),'image-identity.json':Buffer.from(saved.identityJson)};
 }
 const result=normalizeAcceptedReceipt({record,locator,run,jobs,artifact,archive,archivedFiles,workflowBytes,ciWorkflowBytes});
 const final=await api(path);validateReceiptRun(final,locator,record.predecessor);assert.equal(final.updated_at,run.updated_at,'Receipt changed during verification');
 const bytes=Buffer.from(JSON.stringify(result)),selected=archivedFiles||readReceiptZip(archive);
 const durableArchive={format:'cc-gh-yard-receipt-archive/v1',artifact,passJson:selected['PASS.json'].toString('utf8'),identityJson:selected['image-identity.json'].toString('utf8')};
 return {receipt:result,bytes,durableArchive};
}
export async function verifyGithubMaintenancePredecessor(input){const result=await readGithubPredecessor(input);assert.equal(sha256(result.bytes),input.record.predecessor.acceptanceReceiptSha256,'Authoritative normalized receipt differs from approved identity');return result;}
/** Collection is explicitly not release readiness. Review this output before use. */
export async function collectGithubMaintenancePredecessor(input){const result=await readGithubPredecessor(input);return {status:'collected-unapproved',receipt:result.receipt,receiptSha256:sha256(result.bytes),durableArchive:result.durableArchive,durableArchiveSha256:sha256(JSON.stringify(result.durableArchive))};}
