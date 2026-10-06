import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {restoreEvidence,evidenceStatus} from './browser-helpers.mjs';
test('worker restart retains the prior action failure and clip while HUD can pass independently',()=>{
 const prior={head:'reviewed',errors:[{message:'strict resize failure'}],sections:{actions:'failed',hud:'not-run'},cases:[{name:'target-deleted-during-approach'}],clip:{file:'actual-time-inspection.webm'}};
 const current={errors:[],cases:[]};restoreEvidence(current,JSON.parse(JSON.stringify(prior)),'reviewed');current.sections.hud='passed';
 assert.equal(evidenceStatus(current),'FAILED_OR_INCOMPLETE');assert.deepEqual(current.errors,prior.errors);assert.deepEqual(current.cases,prior.cases);assert.equal(current.clip.file,prior.clip.file);assert.throws(()=>restoreEvidence({},prior,'different'));
});
test('success requires both independent sections, without erasing any error',()=>{
 const r={errors:[],sections:{actions:'passed',hud:'not-run'}};assert.equal(evidenceStatus(r),'INCOMPLETE');r.sections.hud='passed';assert.equal(evidenceStatus(r),'MECHANICAL_ACCEPTANCE_PASSED_VISUAL_REVIEW_PENDING');r.errors.push({message:'shader error'});assert.equal(evidenceStatus(r),'FAILED_OR_INCOMPLETE');
});
test('HUD is a separate bounded test; adaptation uses actual UI and records without screenshots or resize',async()=>{
 const s=await fs.readFile(new URL('./acceptance.spec.mjs',import.meta.url),'utf8'),config=await fs.readFile(new URL('./config.mjs',import.meta.url),'utf8');
 assert.match(s,/test\('independent full HUD and typography matrix'/);assert.match(s,/test\.setTimeout\(125000\)/);assert.match(s,/test\.setTimeout\(75000\)/);assert.match(config,/globalTimeout:220000/);assert.match(config,/maxFailures:0/);
 const clip=s.slice(s.indexOf('const adaptationRecordingStart='),s.indexOf('const adaptationMedia='));assert.match(clip,/await move\(p,1,94,135\)/);assert.match(clip,/await inspect\(p,0\)/);assert.match(clip,/await settled\(p\)/);assert.doesNotMatch(clip,/jitter\(|capture\(|screenshot\(|setViewportSize\(/);
 assert.match(s,/active\.p,name\+'-failure'/);assert.match(s,/prior=await fs\.readFile\(path\.join\(OUT,'browser.json'\)/);
});
