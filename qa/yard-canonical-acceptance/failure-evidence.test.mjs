import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {observe,report,captureFailureDiagnostics,OUT} from './browser-helpers.mjs';
test('console diagnostics retain a bounded warning/error tail',()=>{
 const handlers=new Map();observe({on:(name,fn)=>handlers.set(name,fn)});
 report.console.entries=[];report.console.dropped=0;
 for(let n=0;n<60;n++)handlers.get('console')({type:()=>n%2?'error':'warning',text:()=>String(n)+'x'.repeat(3000),location:()=>({url:'http://127.0.0.1:3216/assets/renderer.js',lineNumber:n,columnNumber:0})});
 assert.equal(report.console.entries.length,48);assert.equal(report.console.dropped,12);assert(report.console.entries.every(row=>row.text.length<=2048));
});
test('failure evidence preserves the exact owner failure and primary assertion wiring',async()=>{
 const owner={mode:'legacy',lastFailure:{mode:'canonical-items',message:'renderer failed',stack:'original stack',context:{operation:'canonical-render',ghost:{slotId:'canonical:one',x:98,y:118},renderer:{paused:true}}}};
 const observed={owner,canonicalMode:'false',prototypeMode:'false',dialogOpen:false,placementControls:[],viewport:{width:390,height:844,dpr:1}};
 const label='offline-diagnostic-check',file=path.join(OUT,label+'-diagnostics.json');
 try{await captureFailureDiagnostics({evaluate:async()=>observed},label);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).owner,owner);}finally{await fs.unlink(file).catch(()=>{});}
 const source=await fs.readFile(new URL('./acceptance.spec.mjs',import.meta.url),'utf8');
 assert.match(source,/duplicate\.catch\(\(\)=>\{\}\)/);assert.match(source,/await\(await duplicate\)\.json\(\)/);
 assert.match(source,/captureFailureDiagnostics\(active\.p,'failure'\)/);assert.match(source,/new-hud-initial/);
 const error=new Error('original duplicate failure'),promise=Promise.reject(error);promise.catch(()=>{});await assert.rejects(promise,e=>e===error);
});
