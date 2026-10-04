/** Trusted maintenance controller. It never builds/publishes or deploys an image. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,realpathSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {loadMaintenanceInputs} from '../tests/helpers/yard-maintenance-guard.mjs';
import {inspectMaintenanceSource,sha256} from './yard-active-maintenance.mjs';
import {BOOTSTRAP_PATHS} from './yard-maintenance-bootstrap.mjs';
import {verifyGithubMaintenancePredecessor} from './yard-maintenance-receipt.mjs';
import {verifyPromotionContract} from './yard-active-contract.mjs';
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024}).trim();
export function verifyMaintenanceSourceInputs(root,inputs,{toolRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')}={}){
 assert.equal(git(toolRoot,['rev-parse','HEAD']),inputs.request.toolCommit,'Trusted controller commit differs from approved invocation');
 const bootstrap=inputs.request.bootstrap?{bootstrapBytes:inputs.request.bootstrap.bytes,approvedBootstrapSha256:inputs.request.bootstrap.sha256}:{};
 const source=inspectMaintenanceSource(root,inputs.request.recordSha256,bootstrap);assert.equal(source.candidateCommit,inputs.activeCommit);assert.equal(source.candidateTree,inputs.request.candidateTree);
 // Every executable bootstrap/controller file is pinned independently from C.
 // Loading this module is safe only from the approved tool checkout; candidate
 // modules are used later, after complete source verification.
 for(const path of BOOTSTRAP_PATHS)assert.equal(sha256(readFileSync(resolve(toolRoot,path))),sha256(readFileSync(resolve(root,path))),`Trusted/candidate tooling differs: ${path}`);
 const anchor=inputs.record.anchor,read=path=>Buffer.from(execFileSync('git',['cat-file','blob',`${anchor.commit}:${path}`],{cwd:root,timeout:15000,maxBuffer:16*1024*1024}));
 const contract=JSON.parse(read('game-logic/yard-v2/active-release-contract.json'));
 const historical=verifyPromotionContract({rootDir:root,contract,read});assert.equal(historical.contractSha256,anchor.contractSha256);
 return {source,historical};
}
export function affectedUnitFiles(root,games){
 const names=readdirSync(resolve(root,'tests'));const groups={settlement:/^settlement-.*\.test\.[cm]?js$/,blox:/^(blox(?:[-.].*)?|sceneGeometry|pointerSession)\.test\.[cm]?js$/,merge:/^(merge-lab-(?:service|transport|ui|onboarding)|merge)\.test\.[cm]?js$/,match3:/^match3(?:[-.].*)?\.test\.js$/,room:/^yard-(?:current-four|panel-escape|garden-player-copy).*\.test\.mjs$/,yard:/^yard-(?:current-four|panel-escape|garden-player-copy).*\.test\.mjs$/,garden:/^(?:garden-(?:interaction|local-state|navigation-observation|release-integration)\.test\.js|yard-garden-player-copy\.test\.mjs)$/,home:/^(?:home-navigation\.test\.js|game-ux-foundations\.test\.js|game-entry-presentation\.test\.mjs)$/, 'cross-game':/^(home-navigation|sceneGeometry|pointerSession)\.test\.js$/};
 const paths=[];for(const game of games){assert.ok(Object.hasOwn(groups,game));const found=names.filter(name=>groups[game].test(name));assert.ok(found.length,`No actual changed-game checks for ${game}`);paths.push(...found.map(name=>'tests/'+name));}return [...new Set(paths)].sort();
}
export async function prepareMaintenancePlan({root,output,env=process.env,verifyReceipt=verifyGithubMaintenancePredecessor,buildOnly=false}){
 const inputs=loadMaintenanceInputs(env,root,{buildOnly}),checked=verifyMaintenanceSourceInputs(root,inputs);
 const parent=realpathSync(dirname(resolve(output))),target=resolve(parent,resolve(output).split('/').at(-1)),inside=relative(realpathSync(root),target);
 assert.ok(inside==='..'||inside.startsWith('../')||isAbsolute(inside),'Evidence must be outside the candidate checkout');
 const verified=await verifyReceipt({record:inputs.record,locator:inputs.request.predecessorReceipt,token:env.GITHUB_TOKEN});
 mkdirSync(target);writeFileSync(resolve(target,'predecessor-receipt.json'),verified.bytes);
 writeFileSync(resolve(target,'plan.json'),JSON.stringify({format:'cc-gh-yard-maintenance-plan/v1',status:buildOnly?'source-build-only':'source-and-predecessor-verified',requestSha256:inputs.requestSha256,recordSha256:inputs.request.recordSha256,...checked,...(buildOnly?{}:{candidateDigest:inputs.activeDigest}),predecessorDigest:inputs.closedDigest},null,2)+'\n');
 return {inputs,checked,output:target};
}
export function runMaintenanceOrdinaryChecks({root,output,env=process.env,execute=execFileSync}){
 const inputs=loadMaintenanceInputs(env,root),plan=JSON.parse(readFileSync(resolve(output,'plan.json')));assert.equal(plan.status,'source-and-predecessor-verified');assert.equal(plan.requestSha256,inputs.requestSha256);assert.equal(plan.source.candidateCommit,inputs.activeCommit);
 assert.equal(git(root,['rev-parse','HEAD']),inputs.activeCommit);assert.equal(git(root,['status','--porcelain','--untracked-files=no']),'');
 const options={cwd:root,stdio:'inherit',timeout:10*60*1000,env:{...env,NODE_OPTIONS:'',VITE_BUILD_ID:inputs.activeCommit}};
 execute('pnpm',['run','build'],options);execute(process.execPath,['scripts/yard-active-runtime-checks.mjs'],options);
 // Two initial-promotion extension cases apply to I, whose complete historical
 // proof and accepted source are checked above. Maintenance has its own exact
 // bootstrap/full-tree negatives. All ordinary data/runtime assertions still run.
 execute(process.execPath,['--test','--test-skip-pattern=^(build extension preserves the exact21|dispatcher extension is derived exactly)','tests/yard-renderer-chunk.test.mjs','tests/yard-contract-data.test.mjs','tests/yard-lazy-built.test.mjs','tests/yard-public-media.test.mjs','tests/yard-public-media-built.test.mjs'],options);
 execute('pnpm',['run','perf:guard:build'],options);
 const files=affectedUnitFiles(root,inputs.record.affectedGames);if(files.length)execute(process.execPath,['--test',...files],options);
 writeFileSync(resolve(output,'ordinary.json'),JSON.stringify({status:'passed',candidateCommit:inputs.activeCommit,candidateDigest:inputs.activeDigest,requestSha256:inputs.requestSha256,affectedGames:inputs.record.affectedGames,unitFiles:files})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{assert.equal(process.argv.length,5);const [command,root,output]=process.argv.slice(2);assert.ok(['--plan','--build-plan','--checks'].includes(command));if(command!=='--checks')await prepareMaintenancePlan({root:resolve(root),output:resolve(output),buildOnly:command==='--build-plan'});else runMaintenanceOrdinaryChecks({root:resolve(root),output:resolve(output)});}
 catch(error){console.error('Maintenance blocked: '+error.message);process.exitCode=1;}
}
