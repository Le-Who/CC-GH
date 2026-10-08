import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const source=readFileSync(new URL('../src/games/companion-yard-v2/scene-entry.mjs',import.meta.url),'utf8');
function evaluate(env){
 let options,legacyOptions,disposals=0;const legacy=(canvas,o)=>{legacyOptions=o;return{};};
 const owner=()=>({update(){},dispose(){disposals++;},diagnostics:()=>({mode:'legacy'})});
 const body=source.replace(/^import.*\n/gm,'').replace('export function','function').replaceAll('import.meta.env','env');
 const factory=new Function('env','createLegacy','createSceneOwner','DEFAULT_RENDER_PROFILE','PAINTED_RENDER_PROFILE',body+';return createCourtyardScene;')(env,legacy,(canvas,o)=>{options=o;return owner();},'default','painted');
 const result=factory({},{});options.createLegacy({},{});return{options,legacyOptions,result,disposals:()=>disposals,legacy};
}
test('QA is default off and cannot select or replace a saved Pip owner',()=>{
 const normal=evaluate({});assert.equal(normal.options.createLegacy,normal.legacy);assert.equal(normal.legacyOptions.loadQaLayer,undefined);assert.equal(globalThis.__yardMikaQa,undefined);normal.result.dispose();
 const saved=evaluate({VITE_YARD_MIKA_QA:'true',VITE_YARD_SAVED_VISITS:'true'});assert.equal(saved.options.canonicalSavedVisitsAllowed,true);assert.equal(saved.options.createLegacy,saved.legacy);assert.equal(globalThis.__yardMikaQa,undefined);saved.result.dispose();
});
test('explicit QA build owns only an optional legacy draw layer and cleans its diagnostics',()=>{
 const qa=evaluate({VITE_YARD_MIKA_QA:'true'});assert.equal(qa.options.canonicalSavedVisitsAllowed,false);assert.equal(typeof qa.legacyOptions.loadQaLayer,'function');assert.equal(Object.isFrozen(globalThis.__yardMikaQa),true);qa.result.dispose();assert.equal(qa.disposals(),1);assert.equal(globalThis.__yardMikaQa,undefined);
});

test('same-ID session changes advance only a private QA epoch without serializing session values',()=>{
 const qa=evaluate({VITE_YARD_MIKA_QA:'true'}),a=Object.freeze({revision:1}),b=Object.freeze({revision:2}),value={player:{id:'same'}};
 try{qa.result.update(value,{accountSession:a});assert.equal(qa.legacyOptions.qaSessionEpoch(),0);qa.result.update(value,{accountSession:a});assert.equal(qa.legacyOptions.qaSessionEpoch(),0);qa.result.update(value,{accountSession:b});assert.equal(qa.legacyOptions.qaSessionEpoch(),1);assert.deepEqual(globalThis.__yardMikaQa.snapshot(),{mode:'legacy'});}
 finally{qa.result.dispose();}
});

test('account A→B→A advances QA epoch even with omitted or unchanged session',()=>{
 for(const context of [undefined,{accountSession:Object.freeze({revision:1})}]){
  const qa=evaluate({VITE_YARD_MIKA_QA:'true'});
  try{qa.result.update({player:{id:'A'}},context);assert.equal(qa.legacyOptions.qaSessionEpoch(),0);qa.result.update({player:{id:'B'}},context);assert.equal(qa.legacyOptions.qaSessionEpoch(),1);qa.result.update({player:{id:'A'}},context);assert.equal(qa.legacyOptions.qaSessionEpoch(),2);}
  finally{qa.result.dispose();}
 }
});
