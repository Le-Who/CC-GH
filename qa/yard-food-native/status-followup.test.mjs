/** Pure DOM/source regression: no browser, server, database or visual rendering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformSync} from 'esbuild';
import {YARD_STATUS} from './selectors.mjs';
import {inheritedServicePin,validateInheritedService} from './inherited-source.mjs';
import {initializeFoodReport} from './food-report.mjs';
import {BASE,HISTORICAL_BASE,WORKFLOW} from './identity.mjs';
const root=new URL('../../',import.meta.url),hudURL=new URL('src/app/hud-layout/HudRegion.jsx',root).href;
registerHooks({
 resolve(specifier,context,next){if(context.parentURL===hudURL&&specifier==='./HudLayoutContext.jsx')return {shortCircuit:true,url:'food-status-test:context'};return next(specifier,context);},
 load(url,context,next){if(url==='food-status-test:context')return {shortCircuit:true,format:'module',source:'export const useHudLayout=()=>({activeGameId:"room",resolvedLayout:null,selectedRegionId:null,setSelectedRegionId(){},registerRegion(){return()=>{};}});'};if(url===hudURL)return {shortCircuit:true,format:'module',source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'jsx',format:'esm'}).code};return next(url,context);}
});
const {HudRegion}=await import(hudURL),read=path=>readFileSync(new URL(path,root),'utf8');
function statusMarkup(text){return renderToStaticMarkup(React.createElement(HudRegion,{id:'yardVisitStatus',className:'cy-status',applyLayout:false,role:'status','aria-label':'Required explanation'},text));}
function attributes(html){return Object.fromEntries([...html.match(/^<div([^>]*)>/)[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));}
function matchesAttributeSelector(html,selector){const attrs=attributes(html),terms=[...selector.matchAll(/\[([\w-]+)="([^"]*)"\]/g)];return terms.length>0&&terms.map(m=>m[0]).join('')===selector&&terms.every(m=>attrs[m[1]]===m[2]);}
test('real HudRegion renders the semantic data selector and rejects the historical DOM id assumption',()=>{
 for(const text of ['Двор изменился','Место миски занято']){const html=statusMarkup(text),attrs=attributes(html);assert.equal(attrs.id,undefined);assert.equal(attrs['data-hud-region'],'yardVisitStatus');assert.equal(attrs.role,'status');assert(html.includes(text));assert.equal(matchesAttributeSelector(html,YARD_STATUS),true);assert.equal(matchesAttributeSelector(html,'[id="yardVisitStatus"]'),false);}
 const wrong=renderToStaticMarkup(React.createElement(HudRegion,{id:'other',role:'status'},'wrong'));assert.equal(matchesAttributeSelector(wrong,YARD_STATUS),false);
});
test('all direct food selectors have current source owners, including dynamic values and forwarded HUD attributes',()=>{
 const contract=JSON.parse(read('qa/yard-food-native/selector-contract.json')),used=new Set([YARD_STATUS]);
 for(const file of contract.scope){const source=read('qa/yard-food-native/'+file);assert(!source.includes('#yardVisitStatus'));for(const match of source.matchAll(/(?:locator|querySelector)\(\s*(['"`])(.*?)\1/g))used.add(match[2]);}
 assert.deepEqual([...used].sort(),contract.selectors.map(r=>r.selector).sort());
 for(const row of contract.selectors)for(const evidence of row.evidence)assert(read(evidence.path).includes(evidence.contains),'Source selector drift: '+row.selector+' from '+evidence.path);
});
test('same-head worker restart preserves the failed recording, checkpoints, transactions and sticky status',()=>{
 const report={sections:{}};initializeFoodReport(report);report.food.recording={status:'FAILED_OR_INCOMPLETE',originalPreserved:true,domObservations:[{label:'recording-failure',status:{text:'observed'}}]};report.food.sections.recording='failed';report.sections.food='failed';report.food.transactions.push({action:'yard.buyFood'});
 const persisted=JSON.parse(JSON.stringify(report));initializeFoodReport(persisted);assert.deepEqual(persisted,report);persisted.food.sections.states='passed';initializeFoodReport(persisted);assert.equal(persisted.sections.food,'failed');assert.equal(persisted.food.sections.recording,'failed');assert.equal(persisted.food.recording.domObservations.length,1);assert.equal(persisted.food.transactions.length,1);
});
test('follow-up keeps old source admission separate and fetches its grandparent without changing the old loader',()=>{
 assert.equal(BASE,'bab0664b90b2de419c498f318d2c1b39d5e8c611');assert.equal(HISTORICAL_BASE,'32981e328fbfc7993eb08c3bfcf6eb7634dceb53');
 const workflow=read(WORKFLOW);assert(workflow.includes('fetch-depth: 3'));assert(read('tests/yard-canonical-pg-guard.test.mjs').includes(HISTORICAL_BASE+':game-logic/yard-v2/canonical-locations.mjs'));assert(read('tests/helpers/yard-food-prior-binary.mjs').includes(HISTORICAL_BASE));
 const source=execFileSync('git',['show',HISTORICAL_BASE+':game-logic/yard-v2/canonical-locations.mjs'],{cwd:root});assert.equal(createHash('sha256').update(source).digest('hex'),'95920c2c086631a3afe87492e204fbe5a56d7d34565ddf9774334fd90e818429');
 const oldWorkflow=read('.github/workflows/yard-food-native.yml');assert(oldWorkflow.includes("branches: ['qa/yard-food-native-20261006']"));assert(!oldWorkflow.includes('qa/yard-food-status-followup-20261006'));
});

test('unchanged service pin rejects tampered hashes, bytes, targets, extra pins and current-source drift',()=>{
 const parent=Buffer.from('exact reviewed parent service'),current=Buffer.from(parent),pin=inheritedServicePin(parent);assert.deepEqual(validateInheritedService([pin],current,parent),pin);
 for(const rows of [[],[pin,pin],[{...pin,path:'other.mjs'}],[{...pin,bytes:pin.bytes+1}],[{...pin,sha256:'0'.repeat(64)}]])assert.throws(()=>validateInheritedService(rows,current,parent));assert.throws(()=>validateInheritedService([pin],Buffer.from('changed service'),parent));assert.throws(()=>validateInheritedService([pin],current,Buffer.from('other parent')));
});
