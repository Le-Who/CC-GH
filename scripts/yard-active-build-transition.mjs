/** Separate reviewed build, acceptance and placement-focus transitions; original21 source paths stay exact. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
export const CLOSED_BUILD='010dd1ede7f435ccaad92545068c495b8a4cf5f3';
export const EXTENSION_PATH='scripts/yard-active-build-transition.mjs';
export const DISPATCHER_PATH='scripts/yard-ci-dispatch.mjs';
export const BUILD_TOOL_PINS=Object.freeze({"scripts/yard-contract-data.mjs":{"before":"8f7e6913a7c2563c50d8e3b7b0434e3af03bbe3b","after":"ace8f63d66499bd11913bc579d92e59b1eb62059"},"tests/yard-contract-data.test.mjs":{"before":"7057df142e6f3cc987c30590a3964bf324e32cea","after":"0d71434499f5636c225e36b7785637d16b0c5e2e"}});
export const ACCEPTANCE_TOOL_PINS=Object.freeze({"tests/yard-production-e2e/production.spec.js":{"before":"1b2eea86d9a137a8de4e1c9a15cddf8e284761a5","after":"dbbed40112443640ef9fa9a5d6d47c1760254637"},"scripts/yard-production-acceptance.mjs":{"before":"7ea9c66b2d8d774025015a02e3ddb9c348872c2c","after":"3523329bd0aa35315fbc7413e7b52b8aac88d856"},"tests/yard-production-contract.test.mjs":{"before":"629629bbe0eeb3718c42b4b4e6a8290181e52e7a","after":"378d543b0ac2174e789d302f0d3e16ccab088f75"},"tests/helpers/yard-production-proxy.mjs":{"before":"7ee5faa820cac56be0f1f484b2958cfb839200b6","after":"8b3464af8cac6682e4e5cb36641f346ceb52810f"},"tests/helpers/yard-production-guard.mjs":{"before":"65a829a0ad70d81901564093acc9fdacabf54bab","after":"0f9a3a28a8ab8568c003096b04a521eadbb66b50"},".github/workflows/deploy.yml":{"before":"79938641cd5fc10baafb1bc7c3670b4286c2dba4","after":"269ac3142da0947cb8e2ac7803c2a6796a7b7df0"},".github/workflows/ci.yml":{"before":"a194e2df5c13484e1062be169dd84b189f29d7e5","after":"3b3867cb9b21a2eb256b6d74d1559ae1e5b7b1d9"},"tests/yard-active-dispatch.test.mjs":{"before":"b29d5cef32151e51a047543a64df99dbe90b6dc3","after":"d9e38cde187bd5bd8bd08cbb3a61de21f1179702"}});
export const TOOL_PINS=Object.freeze({...BUILD_TOOL_PINS,...ACCEPTANCE_TOOL_PINS});
export const PLAYER_UI_PINS=Object.freeze({"src/games/companion-yard-v2/CourtyardGame.jsx":{"before":"8846af6b45320452ac76f3eec2bb5dd8a018d624","after":"16ef5d8e3d807a2cf2b693daed6af5fbc2c58966"}});
export const TRANSITION_PINS=Object.freeze({...TOOL_PINS,...PLAYER_UI_PINS});
export const CLOSED_DISPATCHER_BLOB='32705abe48b8f34aa265eaecd2114cbd6c57c5c6';
export const REVIEWED_BUILD_PATHS=Object.freeze([...Object.keys(BUILD_TOOL_PINS),DISPATCHER_PATH,EXTENSION_PATH]);
export const REVIEWED_ACCEPTANCE_PATHS=Object.freeze(Object.keys(ACCEPTANCE_TOOL_PINS));
export const REVIEWED_TOOL_PATHS=Object.freeze([...REVIEWED_BUILD_PATHS,...REVIEWED_ACCEPTANCE_PATHS]);
export const REVIEWED_PLAYER_UI_PATHS=Object.freeze(Object.keys(PLAYER_UI_PINS));
export const REVIEWED_TRANSITION_PATHS=Object.freeze([...REVIEWED_TOOL_PATHS,...REVIEWED_PLAYER_UI_PATHS]);
export const gitBlob=bytes=>createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
const ownBytes=()=>readFileSync(fileURLToPath(import.meta.url));
const ownSha=()=>createHash('sha256').update(ownBytes()).digest('hex');
function replaceOnce(source,before,after){assert.equal(source.split(before).length,2,'Exact A dispatcher wiring changed');return source.replace(before,after);}
export function deriveDispatcher(source){
 assert.equal(gitBlob(source),CLOSED_DISPATCHER_BLOB,'Exact original A dispatcher bytes required');
 const importLine="import {spawnSync} from 'node:child_process';";
 const wiring=importLine+"\nimport {createHash} from 'node:crypto';\nconst buildExtensionUrl=new URL('./yard-active-build-transition.mjs',import.meta.url);\nassert.equal(createHash('sha256').update(readFileSync(buildExtensionUrl)).digest('hex'),'"+ownSha()+"','Reviewed build extension bytes changed');\nconst buildExtension=await import(buildExtensionUrl.href);";
 let result=replaceOnce(source,importLine,wiring);
 result=replaceOnce(result,'export function assertExactPromotionTree(before,after){',
  'export function assertExactPromotionTree(before,after){\n const build=buildExtension.normalizeBuildTree(before,after);({before,after}=build);');
 result=replaceOnce(result,'return {changedFiles:21,unchangedFiles:before.size-PROMOTED_PATHS.length};',
  'return {changedFiles:21,reviewedBuildToolingFiles:build.buildChanged,reviewedAcceptanceToolingFiles:build.acceptanceChanged,reviewedPlayerUiFiles:build.playerUiChanged,totalChangedFiles:21+build.changed,unchangedFiles:before.size-PROMOTED_PATHS.length-build.existingChanged};');
 result=replaceOnce(result,'return {...assertExactPromotionTree(before,after),closedCommit,activeCommit,closedTree};',
  'const buildProof=buildExtension.verifyBuildTransition({rootDir,closedCommit});\n return {...assertExactPromotionTree(before,after),closedCommit,activeCommit,closedTree,buildProof};');
 return result;
}
export function normalizeBuildTree(before,after){
 const changed=REVIEWED_TRANSITION_PATHS.filter(p=>JSON.stringify(before.get(p))!==JSON.stringify(after.get(p)));
 if(!changed.length)return {before,after,changed:0,buildChanged:0,acceptanceChanged:0,playerUiChanged:0,existingChanged:0};
 assert.deepEqual(changed,[...REVIEWED_TRANSITION_PATHS],'Complete separately reviewed build, acceptance and placement-focus transitions are required');
 const normalized=new Map(after);
 for(const p of REVIEWED_TRANSITION_PATHS){
  const a=before.get(p),b=after.get(p);assert.equal(b?.type,'blob');assert.equal(b?.mode,'100644','Build-tool mode changed');
  if(p===EXTENSION_PATH){assert.equal(a,undefined);assert.equal(b.objectId,gitBlob(ownBytes()),'Unreviewed extension blob');normalized.delete(p);}
  else{
   assert.equal(a?.type,'blob');assert.equal(a?.mode,'100644');
   assert.equal(a.objectId,p===DISPATCHER_PATH?CLOSED_DISPATCHER_BLOB:TRANSITION_PINS[p].before,'Build-tool A bytes changed');
   // The dispatcher is also checked by exact derivation in verifyBuildTransition;
   // its source embeds this module's hash without a circular dispatcher checksum.
   const expected=p===DISPATCHER_PATH?gitBlob(readFileSync(new URL('./yard-ci-dispatch.mjs',import.meta.url))):TRANSITION_PINS[p].after;
   assert.equal(b.objectId,expected,'Unreviewed build-tool B bytes');normalized.set(p,a);
  }
 }
 return {before,after:normalized,changed:13,buildChanged:4,acceptanceChanged:8,playerUiChanged:1,existingChanged:12};
}
export function verifyBuildTransition({rootDir,closedCommit}){
 if(!existsSync(resolve(rootDir,EXTENSION_PATH)))return {mode:'original-core-only',changedFiles:0};
 assert.equal(closedCommit,CLOSED_BUILD,'Build transition must retain exact approved A');
 const git=p=>{const r=spawnSync('git',['cat-file','blob',`${closedCommit}:${p}`],{cwd:rootDir,maxBuffer:1024*1024});assert.equal(r.status,0,'Cannot read exact A build-tool bytes');return r.stdout;};
 const original=git(DISPATCHER_PATH).toString('utf8');
 assert.equal(readFileSync(resolve(rootDir,DISPATCHER_PATH),'utf8'),deriveDispatcher(original),'Dispatcher differs from the exact reviewed transformation');
 assert.deepEqual(readFileSync(resolve(rootDir,EXTENSION_PATH)),ownBytes(),'Extension source differs from pinned executing module');
 for(const [p,pin]of Object.entries(TRANSITION_PINS)){assert.equal(gitBlob(git(p)),pin.before);assert.equal(gitBlob(readFileSync(resolve(rootDir,p))),pin.after);}
 return {mode:'reviewed-tooling/v1',changedFiles:13,existingChangedFiles:12,sourcePromotionPaths:21,buildTransition:{mode:'reviewed-build-only/v1',paths:REVIEWED_BUILD_PATHS},acceptanceTransition:{mode:'reviewed-production-acceptance/v1',paths:REVIEWED_ACCEPTANCE_PATHS,requiredOriginalCases:6,requiredAdditionalCases:3,requiredTotalCases:9},playerUiTransition:{mode:'reviewed-placement-focus/v1',paths:REVIEWED_PLAYER_UI_PATHS},extensionSha256:ownSha(),closedBuild:CLOSED_BUILD};
}
