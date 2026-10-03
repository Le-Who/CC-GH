/** Split review payloads from bulky HTML/traces. No browser or network access. */
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function collectPebbleDiagnostics(resultDirectory='test-results-yard-pebble'){
 const root=resolve(resultDirectory),results=JSON.parse(await readFile(resolve(root,'results.json'),'utf8')),attachments=[];
 function visit(v,titles=[]){if(!v||typeof v!=='object')return;const path=typeof v.title==='string'&&v.title?[...titles,v.title]:titles;
  if(Array.isArray(v.attachments))for(const a of v.attachments)if(a.path||typeof a.body==='string')attachments.push({...a,titles:path});
  for(const[k,item]of Object.entries(v))if(k!=='attachments'&&typeof item==='object'){if(Array.isArray(item))item.forEach(x=>visit(x,path));else visit(item,path);}}
 visit(results);const names=['compact-diagnostics','viewport-frames'],buckets=Object.fromEntries(names.map(n=>[n,{directory:resolve(root,n),bytes:0,files:[]}]))
 for(const b of Object.values(buckets))await mkdir(b.directory,{recursive:true});
 async function copyTo(bucket,attachment,name,meta={}){
  const b=buckets[bucket],source=typeof attachment==='string'?attachment:attachment.path;
  let file=null,body=null,size;
  if(source){file=resolve(source);if(!file.startsWith(root+sep))throw Error('Attachment escaped results directory');size=(await stat(file)).size;}
  else{body=Buffer.from(attachment.body,'base64');size=body.length;}
  if(b.bytes+size>28*1048576)throw Error(`${bucket} exceeds the 28 MiB safe review limit`);
  if(file)await copyFile(file,resolve(b.directory,name));else await writeFile(resolve(b.directory,name),body);
  b.bytes+=size;b.files.push({name,bytes:size,...meta});}
 await copyTo('compact-diagnostics',resolve(root,'results.json'),'results.json');
 for(const[i,a]of attachments.entries()){
  const json=a.contentType==='application/json',png=a.contentType==='image/png'&&(/^(yard-\d+x\d+-)/.test(a.name)||a.name==='canonical-held-resize');
  if(!json&&!png)continue;const name=`${String(i).padStart(3,'0')}-${a.name.replace(/[^a-zA-Z0-9._-]/g,'_')}${json?'.json':'.png'}`;
  if(json||/^yard-(320x568|390x844|568x320|393x873)-/.test(a.name)||a.name==='canonical-held-resize')await copyTo('compact-diagnostics',a,name,{attachment:a.name,titles:a.titles});
  if(png)await copyTo('viewport-frames',a,name,{attachment:a.name,titles:a.titles});
 }
 for(const b of Object.values(buckets))await writeFile(resolve(b.directory,'INDEX.json'),JSON.stringify({stats:results.stats,bytes:b.bytes,files:b.files},null,2)+'\n');
 return Object.fromEntries(Object.entries(buckets).map(([k,b])=>[k,{bytes:b.bytes,files:b.files.length,directory:b.directory}]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await collectPebbleDiagnostics(process.argv[2]),null,2));
