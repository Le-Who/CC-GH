/** Extract real review evidence once; the summary never embeds image bodies.
 * Every numbered directory is independently bounded for an upload artifact. */
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const MAX_BYTES=28*1048576,INDEX_RESERVE=64*1024,MAX_SHARDS=4;
export const PEBBLE_REVIEW_SHARDS=['compact-diagnostics','viewport-frames'].flatMap(name=>Array.from({length:MAX_SHARDS},(_,i)=>name+(i?`-${String(i+1).padStart(2,'0')}`:'')));
export function validatePebbleShardUploadCoverage(workflow){
 const job=workflow.match(/^  mochi:\n([\s\S]*?)(?=^  [a-z][a-z0-9_-]*:|$(?![\s\S]))/m)?.[1];
 if(!job)throw Error('Pebble review upload job is missing');
 const steps=job.split(/\n(?=      - )/);
 for(const name of PEBBLE_REVIEW_SHARDS){const path=`path: test-results-yard-pebble/${name}/`,found=steps.filter(s=>s.split('\n').some(line=>line.trim()===path));
  if(found.length!==1||!found[0].includes('uses: actions/upload-artifact@v7')||!found[0].includes('if: always()')||found[0].includes('continue-on-error: true'))throw Error(`Missing required independent upload coverage for ${name}`);
 }
 return true;
}
const hash=body=>createHash('sha256').update(body).digest('hex');
export async function collectPebbleDiagnostics(resultDirectory='test-results-yard-pebble'){
 const root=resolve(resultDirectory),results=JSON.parse(await readFile(resolve(root,'results.json'),'utf8')),attachments=[];
 function visit(v,titles=[]){if(!v||typeof v!=='object')return;const path=typeof v.title==='string'&&v.title?[...titles,v.title]:titles;
  if(Array.isArray(v.attachments))for(const a of v.attachments)if(a.path||typeof a.body==='string')attachments.push({attachment:a,body:a.body,titles:path});
  for(const[k,item]of Object.entries(v))if(k!=='attachments'&&typeof item==='object'){if(Array.isArray(item))item.forEach(x=>visit(x,path));else visit(item,path);}}
 visit(results);
 const families=Object.fromEntries(['compact-diagnostics','viewport-frames'].map(name=>[name,{name,bytes:0,files:0,shards:[]}]));
 async function shardFor(family,size){
  if(size>MAX_BYTES-INDEX_RESERVE)throw Error(`One ${family.name} file exceeds the bounded review payload limit`);
  let shard=family.shards.at(-1);
  if(!shard||shard.bytes+size>MAX_BYTES-INDEX_RESERVE){if(family.shards.length>=MAX_SHARDS)throw Error(`${family.name} exceeds the ${MAX_SHARDS} declared upload shards`);const suffix=family.shards.length?`-${String(family.shards.length+1).padStart(2,'0')}`:'';
   shard={name:family.name+suffix,directory:resolve(root,family.name+suffix),bytes:0,files:[]};await mkdir(shard.directory,{recursive:true});family.shards.push(shard);}
  return shard;
 }
 async function copyTo(familyName,source,name,meta={}){
  const family=families[familyName];let file=null,body=null,size;
  if(typeof source==='string'){file=resolve(source);if(!file.startsWith(root+sep))throw Error('Attachment escaped results directory');size=(await stat(file)).size;}
  else{body=source;size=body.length;}
  const shard=await shardFor(family,size);if(file)await copyFile(file,resolve(shard.directory,name));else await writeFile(resolve(shard.directory,name),body);
  shard.bytes+=size;family.bytes+=size;family.files++;shard.files.push({name,bytes:size,...meta});
 }
 // Sanitize only attachment payloads. All test outcomes, errors, timing and
 // attachment provenance remain. Real JSON/PNG bytes are extracted below.
 for(const[i,r]of attachments.entries()){
  const a=r.attachment,json=a.contentType==='application/json',png=a.contentType==='image/png',label=String(a.name||'attachment');
  r.json=json;r.png=png;r.name=`${String(i).padStart(3,'0')}-${label.replace(/[^a-zA-Z0-9._-]/g,'_')}${json?'.json':'.png'}`;
  r.compact=json||png&&(/^yard-(320x568|390x844|568x320|393x873)-/.test(label)||label==='canonical-held-resize');
  if(typeof r.body==='string'){const body=Buffer.from(r.body,'base64');a.inlineBytes=body.length;a.sha256=hash(body);delete a.body;}
  a.reviewFiles=[...(r.compact?[{family:'compact-diagnostics',name:r.name}]:[]),...(png?[{family:'viewport-frames',name:r.name}]:[])];
  if(!json&&!png)a.reviewOmittedReason='Non-JSON/PNG attachment; retained in original Playwright results';
 }
 await copyTo('compact-diagnostics',Buffer.from(JSON.stringify(results,null,2)+'\n'),'results.json',{sanitizedAttachmentBodies:true});
 for(const r of attachments){
  const a=r.attachment;if(!r.json&&!r.png)continue;
  const source=a.path||Buffer.from(r.body,'base64'),meta={attachment:a.name,titles:r.titles,...(a.sha256?{sha256:a.sha256}:{})};
  if(r.compact)await copyTo('compact-diagnostics',source,r.name,meta);
  if(r.png)await copyTo('viewport-frames',source,r.name,meta);
 }
 const output={};
 for(const[name,f]of Object.entries(families)){
  if(!f.shards.length)await shardFor(f,0);
  const locations=f.shards.map(s=>({directory:s.name,bytes:s.bytes,files:s.files}));
  for(const s of f.shards){const index=Buffer.from(JSON.stringify({stats:results.stats,bytes:s.bytes,files:s.files,shards:locations},null,2)+'\n');
   if(index.length>INDEX_RESERVE||s.bytes+index.length>MAX_BYTES)throw Error(`${s.name} index exceeds the 28 MiB review limit`);
   await writeFile(resolve(s.directory,'INDEX.json'),index);s.totalBytes=s.bytes+index.length;}
  output[name]={bytes:f.bytes,files:f.files,directory:f.shards[0].directory,shards:f.shards.map(s=>({directory:s.directory,bytes:s.totalBytes,files:s.files.length}))};
 }
 return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 validatePebbleShardUploadCoverage(await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8'));
 console.log(JSON.stringify(await collectPebbleDiagnostics(process.argv[2]),null,2));
}
