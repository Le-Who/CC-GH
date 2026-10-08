import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

const source=await readFile(new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url),'utf8');
const header=source.match(/<h2 id="cy-dialog-title">[\s\S]*?<\/h2>/)[0];
const selector=source.match(/const pendingSavedPickup=[^\n]+/)?.[0]||'const pendingSavedPickup=false;';
const nodes=node=>node&&typeof node==='object'?[node,...(node.children||[]).flat(Infinity).flatMap(nodes)]:[];
function render({pending=[],savedMode=true,account='A',panel='decor',selected=null}={}){
  const context={pending,savedMode,snapshot:{player:{id:account}},panel,selected,t:key=>key==='yard.persistent.saving'?'Saving…':key,
    React:{createElement:(type,props,...children)=>({type,props,children})}};
  vm.runInNewContext(transformSync(`${selector}\nglobalThis.header=(${header});`,{loader:'jsx'}).code,context);
  return nodes(context.header).filter(node=>node.props?.['data-saved-pickup-pending']);
}
const intent={accountId:'A',action:'yard.pickupGoodie',clientActionId:'yard-v2:canonical-v2:fixture',status:'sending'};

test('pending pickup Saving is inside the actual dialog title, including after realtime removes the selected row',()=>{
  assert(source.indexOf(header)>source.indexOf('<dialog ref={dialog}'),'status belongs to the top-layer dialog');
  for(const status of ['pending','sending','canonical-blocked','rollout-paused']){
    const result=render({pending:[{...intent,status}],selected:null});
    assert.equal(result.length,1,`${status}: user sees pending pickup even without selected footer`);
    assert.equal(result[0].props.role,'status');assert.equal(result[0].props['aria-live'],'polite');
    assert(result[0].children.flat(Infinity).includes('Saving…'));
  }
});
test('dialog pending status retires with settlement/rejection and never crosses account, panel or mode',()=>{
  for(const options of [{pending:[]},{pending:[{...intent,status:'failed'}]},{pending:[intent],account:'B'},{pending:[intent],savedMode:false},{pending:[intent],panel:'food'},{pending:[{...intent,action:'yard.buyGoodie'}]}])assert.equal(render(options).length,0);
});
