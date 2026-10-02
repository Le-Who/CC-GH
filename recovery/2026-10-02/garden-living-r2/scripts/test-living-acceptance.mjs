import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

// Test target is the NEW merged validation directory, never the live preview.
const target=process.env.GARDEN_ACCEPTANCE_TEST_TARGET;
if(!target)throw Error('GARDEN_ACCEPTANCE_TEST_TARGET must name an isolated validation directory');
const {schemaProblems,phaseEvidence,livingAcceptanceCases}=await import(pathToFileURL(path.join(target,'qa/living-acceptance.mjs')));
const {casesFor}=await import(pathToFileURL(path.join(target,'qa/profiles.mjs')));
const basePlant={id:'p',type:'daisy',phase:0,drawCount:1,drawnKey:'old',requestedKey:'old',previousKey:null,growthMix:1,growthSamples:[]};
const sample=p=>({at:1,surfaces:[{id:1,rootKind:'shelf',plants:[p]}]});

test('diagnostics accept actual numeric surface IDs and reject pilot totals-only data',()=>{
 assert.deepEqual(schemaProblems({surfaces:[{id:1,rootKind:'shelf',plants:[basePlant]}]}),[]);
 assert.ok(schemaProblems({surfaces:[{entries:1,frames:2,textures:1}]}).length>0);
});
test('growth evidence requires an actual intermediate mix and the correct final drawn key',()=>{
 const final={...basePlant,phase:1,requestedKey:'new',drawnKey:'new',growthSamples:[{phase:1,previousKey:'old',mix:.5}]};
 assert.deepEqual(phaseEvidence([sample(basePlant),sample(final)],'p',0,1),{id:'p',from:0,to:1,initial:true,intermediate:true,final:true});
 assert.equal(phaseEvidence([sample(basePlant),sample({...final,growthSamples:[]})],'p',0,1).intermediate,false);
 assert.equal(phaseEvidence([sample(basePlant),sample({...final,drawnKey:'old'})],'p',0,1).final,false);
 assert.equal(phaseEvidence([sample(basePlant),sample({...final,growthSamples:[{phase:2,previousKey:'old',mix:.5}]})],'p',0,1).intermediate,false);
});
test('twelve original QUICK cases are preserved and only Garden receives four additions',()=>{
 const all=casesFor('garden',{quick:true}),ids=all.map(c=>c.id);
 assert.equal(all.length,16);assert.equal(new Set(ids).size,16);
 assert.deepEqual(ids.slice(-4),livingAcceptanceCases().map(c=>c.id));
 for(const id of ['garden-320x568-ru','garden-390x844-ru','garden-568x320-ru','garden-1280x720-ru','garden-390x844-simulated-insets','garden-568x320-simulated-insets','garden-poor-shop-focus','garden-inventory-place-regression','garden-pointer-cancel-keyboard','garden-desktop-pan-rename','garden-living-tap-water','garden-living-scroll-landscape'])assert.ok(ids.includes(id));
 assert.equal(casesFor('merge',{quick:true}).length,11);
});
test('reduced-motion setup makes a real browser preference call before navigation',async()=>{
 const calls=[],a={record:{actions:[]},send:async(...args)=>calls.push(args)};
 await livingAcceptanceCases().find(c=>c.id==='garden-living-reduced-motion').setup(a);
 assert.deepEqual(calls,[['Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]}]]);
 assert.equal(a.record.actions[0].beforeNavigation,true);
});
test('source and compiled fixture changes produce the same complete plant states',async()=>{
 const source=await readFile(path.join(target,'source-excerpt/preview/garden/fixtures.js'),'utf8');
 const clean=source.replace(/^import .*;\s*$/gm,'').replace(/^export .* from .*;\s*$/gm,'').replace('export function createGardenPreviewPlayer','function createGardenPreviewPlayer');
 const setup='const normalizeGardenFixture=x=>x,createDefaultPlayer=()=>({resources:{}}),createGardenEconomyState=now=>({lastTick:now}),getGardenXpRequired=x=>x*100,GARDEN_STARTER_GOLD=100,PLANT_TYPES={daisy:{},monstera:{},fern:{}};';
 const sourceValue=vm.runInNewContext(setup+clean+';JSON.stringify(createGardenPreviewPlayer("living-growth",1000));');
 const bundle=await readFile(path.join(target,'dist-garden-preview/assets/host-BacBU0WN.js'),'utf8');
 const start=bundle.indexOf('function $2(n="progress",i=Date.now())');
 const end=bundle.indexOf('const J2=',start);
 assert.ok(start>=0&&end>start,'immutable fixture function boundaries exist');
 const factory='const Kn=(n,i,o,u,c=3,d=1)=>({id:`preview-${n}`,type:i,shelfIndex:o,spotIndex:u,phase:c,level:d,phaseProgress:0,lastWatered:0,lastTapped:0});';
 const compiledValue=vm.runInNewContext('const vv=x=>x,f2=()=>({resources:{}}),bo=now=>({lastTick:now}),Ka=x=>x*100,io=100,ud={daisy:{},monstera:{},fern:{}};'+factory+bundle.slice(start,end)+';JSON.stringify($2("living-growth",1000));');
 assert.deepEqual(JSON.parse(sourceValue),JSON.parse(compiledValue));
 assert.deepEqual(JSON.parse(sourceValue).garden.plants.map(p=>[p.id,p.type,p.phase,p.phaseProgress]),[['preview-qa-grow-0','daisy',0,100000],['preview-qa-grow-1','monstera',1,450000],['preview-qa-grow-2','fern',2,1780000]]);
});
test('collector source keeps state writes and visual-event injection out of the scenarios',async()=>{
 const source=await readFile(path.join(target,'qa/living-acceptance.mjs'),'utf8');
 assert.ok(!/localStorage\.setItem|\.phase\s*=(?!=)|notifyPlantTouch\(/.test(source),'collector does not mutate game phase or dispatch visual responses');
 // Full module parsing is checked separately with node --check. State evidence is read only.
 assert.ok(source.includes('realTouchWithoutScrollIntoView'));
 assert.ok(source.includes('growthSamples'));
});
