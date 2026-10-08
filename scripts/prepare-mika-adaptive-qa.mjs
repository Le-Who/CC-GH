/** Same read-only source QA runner and pinned Three closure as PR60. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const fixture=path.join(project,'recovery-tools/yard-pip-snack-qa/mika-p2-adaptive');
const manifest=JSON.parse(await readFile(path.join(fixture,'browser/manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const within=(root,relative)=>{const p=path.resolve(root,relative);if(!p.startsWith(root+path.sep))throw Error('Out-of-scope fixture path');return p;};
for(const entry of manifest.files){const bytes=await readFile(within(fixture,entry.path));if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error(`Changed fixture: ${entry.path}`);}
for(const entry of manifest.runnerPins){const bytes=await readFile(within(project,entry.path));if(sha(bytes)!==entry.sha256)throw Error(`Changed runner: ${entry.path}`);}
for(const entry of manifest.vendorPins){
  const bytes=await readFile(within(project,entry.path));if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error(`Changed Three vendor: ${entry.path}`);
  const target=within(fixture,'browser/vendor/'+entry.path.split('/vendor/')[1]);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
}
for(const name of ['mika-locomotion.mjs','mika-native-pose.mjs','mika-preview-routes.mjs','mika-p2-calibration.json'])if(sha(await readFile(path.join(fixture,'src',name)))!==sha(await readFile(path.join(fixture,'browser/src',name))))throw Error('Browser/source mismatch');
console.log(JSON.stringify({passed:true,scope:'bounded source/native fixture closure',files:manifest.files.length,vendorFiles:manifest.vendorPins.length,productionActivated:false,browserExecuted:false}));
