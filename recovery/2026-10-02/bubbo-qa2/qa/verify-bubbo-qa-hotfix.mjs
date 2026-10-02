// Read-only verification. Never launches a browser, installs or uploads.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(path.join(root,'qa-hotfix/manifest.json'),'utf8'));
const checks=[...manifest.requiredUnchangedFiles,
  {path:'qa/actor.mjs',sha256:manifest.patchedActorSha256},
  {path:'qa/animation-readiness.mjs',sha256:manifest.pairedModuleSha256}];
const failed=[];
for(const item of checks){
  try{const actual=createHash('sha256').update(readFileSync(path.join(root,item.path))).digest('hex');if(actual!==item.sha256)failed.push(item.path+': wrong SHA256');}
  catch{failed.push(item.path+': missing or unreadable');}
}
if(failed.length){console.error('STOP: this overlay does not match the required Bubbo r1 files. Use a fresh extracted copy of '+manifest.baseArchive+' and extract the overlay into its root.\n'+failed.join('\n'));process.exitCode=1;}
else console.log('PASS: '+checks.length+' hashes match. Game bundle unchanged; paired QA hotfix installed. This is not browser verification.');
