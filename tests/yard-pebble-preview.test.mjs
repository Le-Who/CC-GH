import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('actual Pebble preview counts the leaf target once across standalone, composite and closed ownership', async()=>{
 let source=await readFile(new URL('../recovery-tools/yard-canonical-pebble-qa/preview.mjs',import.meta.url),'utf8');
 source=source.replace(/^import \{createCourtyardScene\} from [^\n]+\n/m,'').replace(/^import \{ACTOR_PROFILES\} from [^\n]+\n/m,'');
 assert.doesNotMatch(source,/^import /m);
 let view={props:[{slotId:'leaf',supported:true,drawStandalone:true},{slotId:'other-mouse',supported:true,drawStandalone:true}],pets:[]};
 const canvas={getBoundingClientRect:()=>({x:0,y:0,width:320,height:400}),toDataURL:()=>''},window={};
 const fixture={times:{approach:0,finished:1000},snapshot:{yardRuntime:{}},closedSnapshot:{yardRuntime:{}},finishedSnapshot:{yardRuntime:{}},acceptanceProfile:{},releaseAccepted:false};
 const sandbox={URL,window,location:{href:'https://qa.invalid/__yard_qa__/index.html'},innerWidth:320,ACTOR_PROFILES:{},
  document:{documentElement:{scrollWidth:320},querySelector:s=>s==='canvas'?canvas:{textContent:''},querySelectorAll:()=>[]},
  addEventListener(){},fetch:async()=>({json:async()=>fixture}),
  createCourtyardScene:()=>({ready:Promise.resolve(),update(){},dispose(){},diagnostics:()=>({ready:true,view})})};
 await runInNewContext(`(async()=>{${source}\n})()`,sandbox);
 assert.equal(window.yardQA.diagnostics().targetInstances,1);
 assert.equal(window.yardQA.diagnostics().otherInstances,1);
 view={...view,props:view.props.map(p=>p.slotId==='leaf'?{...p,drawStandalone:false}:p),pets:[{propOwnerSlotId:'leaf'},{propOwnerSlotId:'other-mouse'}]};
 assert.equal(window.yardQA.diagnostics().targetInstances,1,'the embedded Leaf Pot owns the target');
 assert.equal(window.yardQA.diagnostics().otherInstances,1);
 view={props:[{slotId:'leaf',supported:false,drawStandalone:true}],pets:[]};
 assert.equal(window.yardQA.diagnostics().targetInstances,0);
});
