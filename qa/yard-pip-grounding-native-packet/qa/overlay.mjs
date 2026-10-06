import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const sha = b => createHash('sha256').update(b).digest('hex');
export async function listFiles(root, prefix='') {
  const rows=[];
  for (const e of await fs.readdir(path.join(root,prefix),{withFileTypes:true})) {
    assert(!e.isSymbolicLink(), 'Overlay/evidence symlinks are forbidden');
    const rel=path.posix.join(prefix,e.name);
    if(e.isDirectory())rows.push(...await listFiles(root,rel));
    else if(e.isFile()){const b=await fs.readFile(path.join(root,rel));rows.push({path:rel,bytes:b.length,sha256:sha(b)});}
  }
  return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function createOverlay(root, packet) {
  const map=new Map(), inventory=await listFiles(path.join(packet,'source-overlay'));
  const originals=JSON.parse(await fs.readFile(path.join(packet,'base-files.json'),'utf8'));
  for(const row of originals){const b=await fs.readFile(path.join(root,row.path));assert.equal(sha(b),row.sha256,'Rebase QA overlay against changed source: '+row.path);}
  for(const row of inventory)map.set(path.join(root,row.path),await fs.readFile(path.join(packet,'source-overlay',row.path),'utf8'));
  const entry=path.join(root,'qa/yard-pip-grounding-native/browser-entry.mjs');
  map.set(entry,await fs.readFile(path.join(packet,'qa/browser-entry.mjs'),'utf8'));
  const sourceEntry=path.join(root,'src/games/companion-yard-v2/scene-entry.mjs'),text=await fs.readFile(sourceEntry,'utf8');
  const needle="import('./pip-prototype/yard-pip-scene.mjs')";
  assert.equal(text.split(needle).length,2,'Optional scene load seam changed');
  map.set(sourceEntry,text.replace(needle,"import('../../../qa/yard-pip-grounding-native/browser-entry.mjs')"));
  const loaded=new Set();
  return {map,inventory,loaded,plugin:{name:'private-bounded-pip-grounding-overlay',enforce:'pre',
    resolveId(source,importer){const target=source.startsWith('/')?source:source.startsWith('.')&&importer?path.resolve(path.dirname(importer.split('?')[0]),source):null;return target&&map.has(target)?target:null;},
    load(id){if(map.has(id)){loaded.add(path.relative(root,id));return map.get(id);}},
  }};
}
