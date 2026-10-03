/** Materialize reviewed local media only. No download, generation or activation. */
import {readFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),map=JSON.parse(await readFile(resolve(root,'preview/yard-persistent-candidate/canonical-media-map.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex'),rows=[];
for(const row of map.files){
 if(!/^public\/assets\/yard-(mika|mochi|pebble)\//.test(row.path)||!/^recovery-tools\/yard-canonical-(mochi|pebble)-qa\/public\/assets\/yard-(mika|mochi|pebble)\//.test(row.from))throw Error('Unexpected canonical media namespace');
 const source=resolve(root,row.from),target=resolve(root,row.path);if(!source.startsWith(root+sep)||!target.startsWith(root+sep))throw Error('Canonical media path escaped repository');
 const bytes=await readFile(source);if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error(`Reviewed fixture bytes differ: ${row.from}`);
 let exists=false;try{const current=await readFile(target);exists=true;if(hash(current)!==row.sha256)throw Error(`Existing canonical media differs; refusing overwrite: ${row.path}`);}catch(e){if(e.code!=='ENOENT')throw e;}
 rows.push({...row,source,target,exists});
}
// Validate every source before the first write. Existing distinct bytes are never overwritten.
if(!process.argv.includes('--check'))for(const row of rows)if(!row.exists){await mkdir(dirname(row.target),{recursive:true});await copyFile(row.source,row.target);if(hash(await readFile(row.target))!==row.sha256)throw Error(`Copied bytes mismatch: ${row.path}`);}
console.log(JSON.stringify({status:process.argv.includes('--check')?'canonical-media-preflight':'canonical-media-materialized',runtimeActivated:false,files:rows.length,newFiles:rows.filter(r=>!r.exists).length,totalBytes:rows.reduce((n,r)=>n+r.bytes,0),newBytes:rows.filter(r=>!r.exists).reduce((n,r)=>n+r.bytes,0)}));
