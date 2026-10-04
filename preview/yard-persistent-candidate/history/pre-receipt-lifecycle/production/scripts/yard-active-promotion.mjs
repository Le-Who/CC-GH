/** Offline, reviewable promotion overlay. Never edits the source checkout. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,basename,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ACTIVE_CONTRACT_PATH,ACTIVE_REVISION,SOURCE_PINS,MEDIA_PINS,PROMOTED_PATHS,fingerprint,safePath,validateActivationInputs,promoteExactBytes,verifyPromotionContract} from './yard-active-contract.mjs';

const CLOSED_CHECKS=['preview/yard-persistent-candidate/base-contract.json','preview/yard-persistent-candidate/verify-production.mjs','preview/yard-persistent-candidate/verify-closed-rollout.mjs','preview/yard-persistent-candidate/checks/closed-rollout-guard.checks.mjs'];
const CLOSURES=['mochi','pebble','pip','eight'].map(id=>`recovery-tools/yard-canonical-${id}-qa/SOURCE-CLOSURE.json`).concat('recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json');
function git(root,args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
function boundedInputs(input){
 validateActivationInputs(input);const c=input.closed,cap=c.compatibility;
 return {format:input.format,repository:input.repository,closed:{buildId:c.buildId,imageDigest:c.imageDigest,
  image:{Id:c.image.Id,RepoDigests:[`ghcr.io/${input.repository}@${c.imageDigest}`],Config:{Labels:{'org.opencontainers.image.revision':c.buildId}}},
  compatibility:{format:cap.format,buildId:cap.buildId,policyRevision:cap.policyRevision,playerRolloutEnabled:false,readableStorageFormats:['yard-persistent/v1'],closedQuarantineVerified:true,requiredClosedPredecessor:null}},
  acceptance:{reviewReference:input.acceptance.reviewReference,...Object.fromEntries(['nativeDuration','eightPlayer','geometryEquivalence'].map(kind=>{const r=input.acceptance[kind];return[kind,{reference:r.reference,artifactSha256:r.artifactSha256,sourceCommit:r.sourceCommit,...(kind==='eightPlayer'?{runId:r.runId}:{})}];}))}};
}
/** Pure assembly accepts supplied bytes; the public CLI separately verifies Git identity. */
export function assemblePromotion({read,inputs,closedTree}){
 const normalized=boundedInputs(inputs),files=new Map(),transitions=[];
 for(const path of PROMOTED_PATHS){
  const before=read(path),after=promoteExactBytes(path,before,normalized.closed),archive=`preview/yard-persistent-candidate/history/pre-activation/promoted-inputs/${path}`;
  files.set(archive,before);files.set(path,after);transitions.push({path,archive,before:fingerprint(before),after:fingerprint(after)});
 }
 const closedVerification=CLOSED_CHECKS.map(original=>{const bytes=read(original),archive=`preview/yard-persistent-candidate/history/pre-activation/closed-verification/${original}`;files.set(archive,bytes);return{original,archive,fingerprint:fingerprint(bytes)};});
 const contract={format:'yard-active-contract/v1',mode:'ACTIVE',revision:ACTIVE_REVISION,inputs:normalized,closedTree,transitions,closedVerification,
  closures:CLOSURES.map(path=>({path,fingerprint:fingerprint(read(path))})),
  evidenceScope:'Historical native duration and 59-case candidate evidence retain their original identities; this contract records a reviewed promotion, not a new successful run.'};
 files.set(ACTIVE_CONTRACT_PATH,JSON.stringify(contract,null,2)+'\n');return {contract,files};
}
export function verifyEffectiveParity({sourceRoot,files}){
 // Each side has a fresh module graph. Hooks exist only in these offline test
 // subprocesses; the emitted production overlay contains no hook or bypass.
 const baseSources=Object.fromEntries(Object.keys(SOURCE_PINS).map(path=>[path,readFileSync(safePath(sourceRoot,path),'utf8')]));
 const candidateSources=Object.fromEntries(Object.entries(baseSources).map(([path,text])=>[path,text.replace(/(\b(?:enabled|accepted|playbackReady)"?\s*:\s*)false/g,'$1true')]));
 const activeSources=Object.fromEntries(Object.keys(SOURCE_PINS).map(path=>[path,String(files.get(path))]));
 const script=sources=>`
 import {registerHooks} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';import {relative,resolve} from 'node:path';import {createHash} from 'node:crypto';
 const root=${JSON.stringify(sourceRoot)},sources=${JSON.stringify(sources)};
 registerHooks({load(url,ctx,next){if(url.startsWith('file:')){const path=relative(root,fileURLToPath(url)).replaceAll('\\\\','/');if(Object.hasOwn(sources,path))return{shortCircuit:true,format:path.endsWith('.json')?'json':'module',source:sources[path]};}return next(url,ctx);}});
 const load=path=>import(pathToFileURL(resolve(root,path)).href);
 const {getYardServerOptions}=await load('game-logic/yard-v2/yard-media.mjs');const options=getYardServerOptions();
 const {YARD_ACTOR_PROFILES}=await load('game-logic/yard-v2/released-actor-profiles.mjs');const {YARD_PROP_PROFILES}=await load('game-logic/yard-v2/released-prop-profiles.mjs');
 const {candidate,nativePlayer,NOW,H}=await load('tests/helpers/yard-eight-domain-fixtures.mjs');const {YARD_GOODIES}=await load('game-logic/yard-v2/catalog.mjs');
 const {createAdmissionPolicy}=await load('game-logic/yard-v2/orchestrator.mjs');const {ensurePersistentPlayerYard,executePersistentYardAction}=await load('game-logic/yard-v2/service.mjs');
 const policy=createAdmissionPolicy(options),plans=[],native=[];
 for(const id of Object.keys(options.actorProfiles)){
  for(const minutes of [45,110]){const q=candidate(id,{minutes});plans.push({id,minutes,result:policy(q)});}
  if(['willow','starlit','basil','sage'].includes(id))for(const mult of [1,2]){const q=candidate(id),d=YARD_GOODIES[q.placement.goodieId].durability;plans.push({id,uses:d*mult,result:policy(candidate(id,{uses:d*mult}))});}
  const p=nativePlayer(id);for(const now of [NOW,NOW+H]){const r=ensurePersistentPlayerYard(p,{now,simulate:now>NOW,...options});if(r.status!==200)throw Error('Native fixture rejected');}
  const visits=Object.values(p._yardV2.runtime.visits);if(visits.length!==1)throw Error('Expected one actual native admission');
  const end=visits[0].leavesAt;ensurePersistentPlayerYard(p,{now:end,simulate:true,...options});
  const actionId='yard-v2:promotion-parity-'+id,first=executePersistentYardAction(p,'yard.collectGifts',{}, {...options,now:end,actionId}),once=JSON.stringify(p),retry=executePersistentYardAction(p,'yard.collectGifts',{}, {...options,now:end,actionId});
  if(first.status!==200||retry.replayed!==true||JSON.stringify(p)!==once)throw Error('Native completion/receipt mismatch');native.push(p);
 }
 const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 console.log(JSON.stringify({actors:Object.keys(options.actorProfiles),profiles:hash(YARD_ACTOR_PROFILES),props:hash(YARD_PROP_PROFILES),registry:hash(options.mediaRegistry),scene:hash(options.scene),planCount:plans.length,plans:hash(plans),nativeCount:native.length,native:hash(native)}));`;
 const run=sources=>{const r=spawnSync(process.execPath,['--input-type=module'],{cwd:sourceRoot,input:script(sources),encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,
  env:{...process.env,NODE_OPTIONS:'',YARD_PLAYER_WIRING_TEST:'',YARD_EIGHT_PLAYER_CANDIDATE_TEST:'',YARD_CANDIDATE_CI:'',DATABASE_URL:'',REDIS_URL:''}});
  assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);};
 const candidate=run(candidateSources),active=run(activeSources);assert.deepEqual(active,candidate,'Promotion must preserve candidate effective profiles, registries, plans and native economy');return active;
}
export async function preparePromotion({sourceRoot,inputs,outputDir}){
 const root=realpathSync(sourceRoot),requested=resolve(outputDir);validateActivationInputs(inputs);
 // The output is new, so resolve its existing parent before containment. A
 // lexical outside path may otherwise enter the source through a symlink.
 const output=resolve(realpathSync(dirname(requested)),basename(requested));
 const rel=relative(root,output);assert.ok(rel==='..'||rel.startsWith('../'),'Output must be outside the source checkout');assert.ok(!lstatSync(output,{throwIfNoEntry:false}),'Output must be a new directory');
 assert.equal(git(root,['rev-parse','HEAD']),inputs.closed.buildId,'Source must be the verified closed image commit');
 assert.equal(git(root,['status','--porcelain','--untracked-files=no']),'','Closed source checkout must have no tracked edits');
 const read=path=>readFileSync(safePath(root,path)),prepared=assemblePromotion({read,inputs,closedTree:git(root,['rev-parse','HEAD^{tree}'])});
 // Compare the already-reviewed candidate implementation, not a silently
 // broadened replacement of its strict six-source and two-metadata transform.
 const candidate=await import(pathToFileURL(safePath(root,'tests/helpers/yard-eight-player-candidate.mjs')).href);
 assert.deepEqual(candidate.CANDIDATE_SOURCE_PINS,SOURCE_PINS);
 assert.deepEqual(candidate.CANDIDATE_MEDIA_PINS,Object.fromEntries(Object.entries(MEDIA_PINS).map(([path,hash])=>[path.slice(7),hash])));
 for(const path of Object.keys(SOURCE_PINS)){const before=read(path).toString('utf8');assert.equal(candidate.candidateSource(path,before),before.replace(/(\b(?:enabled|accepted|playbackReady)"?\s*:\s*)false/g,'$1true'));}
 for(const path of Object.keys(MEDIA_PINS))assert.equal(prepared.files.get(path),candidate.candidateManifest(path.slice(7),read(path).toString('utf8')));
 const verification=verifyPromotionContract({rootDir:root,contract:prepared.contract,read:path=>prepared.files.has(path)?Buffer.from(prepared.files.get(path)):read(path)});
 const parity=verifyEffectiveParity({sourceRoot:root,files:prepared.files});
 // No file is written until all inputs, preserved closures and behavior match.
 mkdirSync(output,{recursive:false});for(const [path,bytes]of prepared.files){const target=safePath(output,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});}
 writeFileSync(resolve(output,'PROMOTION-REPORT.json'),JSON.stringify({verification,parity,files:[...prepared.files.keys()]},null,2)+'\n',{flag:'wx'});
 return {...verification,status:'prepared-only',outputDir:output,files:prepared.files.size,parity};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const args=process.argv.slice(2);assert.deepEqual(args.filter((_,i)=>i%2===0),['--source-root','--inputs','--output'],'Usage: --source-root CLOSED_CHECKOUT --inputs VERIFIED_INPUTS.json --output NEW_OVERLAY_DIRECTORY');assert.equal(args.length,6);
  console.log(JSON.stringify(await preparePromotion({sourceRoot:args[1],inputs:JSON.parse(readFileSync(args[3],'utf8')),outputDir:args[5]})));
 }catch(e){console.error(`Promotion blocked: ${e.message}`);process.exitCode=1;}
}
