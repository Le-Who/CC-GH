/** Additive source fixture using the existing read-only Pip QA server. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.resolve(fileURLToPath(new URL('..',import.meta.url))),fixture=path.join(project,'recovery-tools/yard-pip-snack-qa/mika-p2');
const manifest=JSON.parse(await readFile(path.join(fixture,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const within=(root,relative)=>{const p=path.resolve(root,relative);if(!p.startsWith(root+path.sep))throw Error('Out-of-scope fixture path');return p;};
for(const file of [...manifest.assets,...manifest.fixtureFiles]){const bytes=await readFile(within(fixture,file.file));if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error(`Changed fixture input: ${file.file}`);}
const preview=await readFile(path.join(fixture,'preview.mjs'),'utf8');if(/installPip|adaptive-pose-driver|onBeforeCompile|ShaderMaterial/.test(preview))throw Error('Unexpected custom Pip/skin renderer in normal Three fixture');
if(process.argv.includes('--models-only')){console.log(JSON.stringify({stage:'models-and-static-fixture-only',passed:true,browserExecuted:false,vendorClosureChecked:false}));process.exit(0);}
for(const entry of manifest.existingRunnerPins){const bytes=await readFile(within(project,entry.path));if(sha(bytes)!==entry.sha256)throw Error(`Existing runner changed; reconcile explicitly: ${entry.path}`);}
for(const entry of manifest.vendorPins){const bytes=await readFile(within(project,entry.path));if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error(`Pinned vendor mismatch: ${entry.path}`);const rel=entry.path.split('/vendor/')[1];const destination=within(fixture,'vendor/'+rel);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);}
console.log(JSON.stringify({stage:'full-fixture-closure-prepared',passed:true,browserExecuted:false,models:manifest.assets.length,vendorFiles:manifest.vendorPins.length,productionChanged:false}));
