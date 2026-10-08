/** Lossless physical-file sharing. Source frames, timing and ownership stay intact. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import aliases from './yard-lossless-delivery-aliases.json' with {type:'json'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`;
const clips=m=>[...Object.values(m.clips),...Object.values(m.walk.facings),...Object.values(m.turns)];
const mediaRevision=m=>'pip-snack-runtime/r1:'+hash(canonical({source:m.renderBindings['pip-snack-combined-r1'].bindingCalibrationHash,pages:clips(m).flatMap(c=>c.pages.map(p=>[p.src,p.sha256]))}));
export function deduplicatePipManifest(source){
 assert.equal(source.manifestRevision,mediaRevision(source),'Frozen source delivery revision differs');
 const out=structuredClone(source),byPath=new Map(aliases.files.map(r=>[r.retire,r]));
 for(const c of clips(out))for(const p of c.pages){
  const row=byPath.get('public/assets/yard-pip/'+p.src);if(!row)continue;
  assert.equal(p.sha256,row.sha256);assert.equal(p.encodedBytes,row.bytes);
  p.src=row.keep.slice('public/assets/yard-pip/'.length);
 }
 out.manifestRevision=mediaRevision(out);
 const pages=clips(out).flatMap(c=>c.pages),unique=new Map(pages.map(p=>[p.src,p]));
 out.deliveryAudit={format:'yard-lossless-delivery/v1',sourceManifestRevision:source.manifestRevision,
  sourceManifestSha256:aliases.sourcePipManifestSha256,logicalAtlasPages:pages.length,uniqueAtlasFiles:unique.size,
  encodedBytes:[...unique.values()].reduce((n,p)=>n+p.encodedBytes,0),
  duplicateBytesRemoved:aliases.files.filter(r=>r.retire.startsWith('public/assets/yard-pip/')).reduce((n,r)=>n+r.bytes,0),
  logicalPageDescriptorsPreserved:true,sourceExportAuditPreserved:true};
 return out;
}
export function deduplicateUiManifest(source){
 const out=structuredClone(source),byPath=new Map(aliases.files.map(r=>[r.retire,r]));
 for(const row of out.files){const original=row.deliveryAliasFrom||row.outputURL,a=byPath.get('public'+original);if(!a)continue;
  assert.equal(row.outputSha256,a.sha256);assert.equal(row.bytes,a.bytes);
  row.outputURL=a.keep.slice('public'.length);row.deliveryAliasFrom=original;
 }
 return out;
}
export function deduplicateCatalogSource(source){
 for(const a of aliases.files.filter(r=>r.retire.startsWith('public/assets/yard-ui/')))
  source=source.replaceAll(JSON.stringify(a.retire.slice(6)),JSON.stringify(a.keep.slice(6)));
 return source;
}
const SOURCE='recovery-tools/yard-pip-snack-qa/public/assets/yard-pip/runtime-media.json';
const PIP='public/assets/yard-pip/runtime-media.json',PROFILE='game-logic/yard-v2/pip-actor-profile.mjs';
const UI='public/assets/yard-ui/preview-manifest.json',CATALOG='src/games/companion-yard-v2/catalog-preview-paths.mjs';
export async function inspectLosslessDelivery(root,{write=false}={}){
 assert.equal(aliases.format,'yard-lossless-delivery-aliases/v1');
 const bytes=await fs.readFile(path.join(root,SOURCE));assert.equal(hash(bytes),aliases.sourcePipManifestSha256);
 const source=JSON.parse(bytes),pip=deduplicatePipManifest(source);
 const uiText=await fs.readFile(path.join(root,UI),'utf8'),ui=deduplicateUiManifest(JSON.parse(uiText));
 const catalogText=await fs.readFile(path.join(root,CATALOG),'utf8'),catalog=deduplicateCatalogSource(catalogText);
 const profileText=await fs.readFile(path.join(root,PROFILE),'utf8');
 const old=profileText.match(/export const PIP_MEDIA_REVISION="([^"]+)";/);assert.ok(old);
 assert.ok([source.manifestRevision,pip.manifestRevision].includes(old[1]));
 const profile=profileText.replace(old[0],`export const PIP_MEDIA_REVISION="${pip.manifestRevision}";`);
 const outputs=new Map([[PIP,JSON.stringify(pip)+'\n'],[PROFILE,profile],[UI,JSON.stringify(ui,null,2)+'\n'],[CATALOG,catalog]]);
 if(write){for(const [file,text]of outputs)await fs.writeFile(path.join(root,file),text);}
 else{
  for(const [file,text]of outputs)assert.equal(await fs.readFile(path.join(root,file),'utf8'),text,`Stale dedup output: ${file}`);
  for(const row of aliases.files){
   const kept=await fs.readFile(path.join(root,row.keep));assert.equal(kept.length,row.bytes);assert.equal(hash(kept),row.sha256);
   await assert.rejects(fs.access(path.join(root,row.retire)),{code:'ENOENT'},`Retired duplicate ships: ${row.retire}`);
  }
 }
 return{format:'yard-lossless-delivery-check/v1',write,retirementCandidates:aliases.files.length,potentialSavedPublicBytes:aliases.savedPublicBytes,
  sourceManifestRevision:source.manifestRevision,manifestRevision:pip.manifestRevision,deliveryAudit:pip.deliveryAudit};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.ok(process.argv.length===3&&['--write','--check'].includes(process.argv[2]),'Use --write (text only) or --check');
 console.log(JSON.stringify(await inspectLosslessDelivery(path.resolve(import.meta.dirname,'..'),{write:process.argv[2]==='--write'}),null,2));
}
