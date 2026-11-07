/** Explicit child-build receipt for the one lazy canonical planner worker. */
import path from 'node:path';
import assert from 'node:assert/strict';
export const PLANNER_WORKER_REPORT='yard-canonical-worker-report.json';
export const PLANNER_WORKER_CLIENT='src/games/companion-yard-v2/pip-prototype/dynamic-prop-worker-client.mjs';
const prefix='src/games/companion-yard-v2/pip-prototype/';
const entry=prefix+'dynamic-prop-worker.mjs';
export function yardPlannerWorkerGraph(){
 let root;
 return{name:'yard-planner-worker-graph',configResolved(config){root=config.root;},generateBundle(_options,bundle){
  const chunks=Object.values(bundle).filter(row=>row.type==='chunk');
  const local=id=>path.relative(root,id.split('?')[0]).replaceAll('\\','/');
  if(!chunks.some(chunk=>chunk.facadeModuleId&&local(chunk.facadeModuleId)===entry))return;
  const rows=chunks.map(chunk=>{
   const rendered=Object.entries(chunk.modules).filter(([,info])=>info.renderedLength>0),modules=rendered.map(([id])=>local(id));
   assert.ok(modules.every(source=>source.startsWith(prefix)&&!source.includes('/vendor/')&&!source.includes('/prototype/')),'Planner worker must contain only bounded pure source, never engine/model code');
   return{file:chunk.fileName,imports:chunk.imports,dynamicImports:chunk.dynamicImports,workerImports:[],css:[],isEntry:false,workerEntry:chunk.isEntry,
    renderedModuleCount:rendered.length,modules,gameModules:modules,thirdPartyModules:[],dataModules:[],dataOnly:false,hasPixi:false,rawBytes:Buffer.byteLength(chunk.code)};
  });
  assert.equal(rows.filter(row=>row.workerEntry).length,1);
  assert.ok(rows.reduce((total,row)=>total+row.rawBytes,0)<=64*1024,'Planner worker transfer exceeds its additional64KiB bound');
  this.emitFile({type:'asset',fileName:PLANNER_WORKER_REPORT,source:JSON.stringify({format:'yard-canonical-worker-graph/v1',chunks:rows},null,2)+'\n'});
 }};
}
export function addPlannerWorkerGraph(bundle,chunks){
 const report=Object.values(bundle).find(row=>row.type==='asset'&&row.fileName===PLANNER_WORKER_REPORT);
 const consumers=chunks.filter(chunk=>chunk.modules.includes(PLANNER_WORKER_CLIENT));
 assert.equal(!!report,consumers.length>0,'A reachable worker must have its actual emitted module/byte receipt');
 if(!report)return;
 const parsed=JSON.parse(typeof report.source==='string'?report.source:Buffer.from(report.source).toString());
 assert.equal(parsed.format,'yard-canonical-worker-graph/v1');
 const known=new Set(chunks.map(row=>row.file));
 for(const row of parsed.chunks){assert.ok(!known.has(row.file));assert.ok(bundle[row.file],'Worker code is absent from main emitted output');chunks.push(row);known.add(row.file);}
 const entries=parsed.chunks.filter(row=>row.workerEntry).map(row=>row.file);
 for(const chunk of consumers)chunk.workerImports=entries;
}
