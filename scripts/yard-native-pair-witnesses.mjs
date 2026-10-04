import '../tests/yard-inventory-only-loader.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createEightAcceptanceOptions} from '../tests/fixtures/yard-eight-canonical/acceptance.mjs';
import {pairSeedSearch,runNativePair} from '../tests/helpers/yard-native-pair.mjs';
const input=JSON.parse(await readFile(new URL('../recovery-tools/yard-canonical-eight-qa/pair-search-v4.json',import.meta.url)));
const output=new URL('../recovery-tools/yard-canonical-eight-qa/native-pair-witnesses-v4.json',import.meta.url);
const options=createEightAcceptanceOptions();let report;
try{report=JSON.parse(await readFile(output));}catch{report={scope:'Actual native memory service witnesses for every documented BOTH_SOURCE_READY pair/order. Finite search exclusions remain unresolved, not globally impossible.',rows:[]};}
for(const row of input.rows.filter(r=>r.status==='BOTH_SOURCE_READY'))for(const order of row.orders){
 if(report.rows.some(r=>r.pair.join('/')===row.pair.join('/')&&r.witness.spec.first===order.first))continue;
 const [a,b]=row.pair,firstSlot=order.first===a?'a-target':'b-target',secondSlot=order.second===a?'a-target':'b-target';
 let spec={yard:structuredClone(row.yard),first:order.first,second:order.second,firstSlot,secondSlot},found;
 // Native selection intentionally hashes caller slot IDs. An alternate legal
 // fixture ID can avoid a parity correlation without forcing either outcome.
 for(const suffix of ['', '-x', '-y']){
  const yard=structuredClone(row.yard);yard.placedGoodies[1].slotId='b-target'+suffix;
  spec={...spec,yard,firstSlot:order.first===a?'a-target':yard.placedGoodies[1].slotId,secondSlot:order.second===a?'a-target':yard.placedGoodies[1].slotId};
  try{found=pairSeedSearch(spec,options,{limit:20000});break;}catch(e){if(!String(e.message).startsWith('No native pair seed'))throw e;}
 }
 assert.ok(found,`Native seeds unresolved for ${order.first}/${order.second}`);
 const witness=runNativePair({...spec,...found},options);
 assert.ok(witness.firstRecord,JSON.stringify(witness.rejected));
 assert.equal(Boolean(witness.secondRecord),order.status==='ACCEPT',JSON.stringify(witness.rejected));
 if(order.status==='REJECT')assert.ok(witness.rejected.some(e=>e.visitorId===order.secondAlone.original.visitorId&&e.reason===order.reason),JSON.stringify(witness.rejected));
 delete witness.player;
 report.rows.push({pair:row.pair,expectedStatus:order.status,expectedReason:order.reason,witness});
 await writeFile(output,JSON.stringify(report)+'\n');
 console.log(JSON.stringify({pair:row.pair,first:order.first,second:order.second,seed:found.seed,firstMinutes:found.firstDraw.minutes,secondMinutes:found.secondDraw.minutes,admitted:Boolean(witness.secondRecord),rejected:witness.rejected}));
}
