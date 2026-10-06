/** Builtins only: no dependency installation, browser, listener or network. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {PRODUCT_BASE,installedPaths,assertEvent,verifyReviewedTree,verifyPins,auditPushTriggers,git,WORKFLOW} from './ci-contract.mjs';
import {sha} from './overlay.mjs';
const p=installedPaths(),event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH));assertEvent(process.env,event);
assert.equal(git(p.root,['rev-parse','HEAD']),event.after);await assert.rejects(fs.access(path.join(p.root,'.env')),'No dotenv input');
for(const target of[p.build,p.validation,p.packageWork,p.results,p.upload])await assert.rejects(fs.access(target),'Every work/evidence directory must be fresh');
const manifest=JSON.parse(await fs.readFile(path.join(p.packet,'reviewed-source.json'))),protectedTree=await verifyReviewedTree(p.root,manifest),pins=await verifyPins(p.root);
const proof=JSON.parse(await fs.readFile(path.join(p.packet,'correctness-proof.json')));
assert.equal(proof.head,PRODUCT_BASE);assert.equal(proof.runId,'37520075881');assert.equal(proof.status,'SUCCESS');assert.equal(proof.hudPassed,11);assert.equal(proof.sourcePassed,31);assert.equal(proof.originalsVerified,59);assert.deepEqual(proof.builds,['default','preview']);
for(const row of proof.files){assert(row.path.startsWith('proof/')&&!row.path.includes('..'));const b=await fs.readFile(path.join(p.packet,row.path));assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);}
const receipt=JSON.parse(await fs.readFile(path.join(p.packet,'proof/receipt.json'))),originals=JSON.parse(await fs.readFile(path.join(p.packet,'proof/MANIFEST.sha256.json')));
assert.equal(receipt.head,PRODUCT_BASE);assert(Object.values(receipt.stages).every(v=>v==='success'));assert.equal(receipt.acceptance,'MECHANICAL_GATES_PASSED_VISUAL_REVIEW_REQUIRED');assert.equal(originals.files.length,59);
const receiptPin=originals.files.find(r=>r.path==='receipt.json');assert.equal(receiptPin.sha256,sha(await fs.readFile(path.join(p.packet,'proof/receipt.json'))));assert.deepEqual(originals.files.find(r=>r.path==='browser.json'),proof.browser);
const triggers=await auditPushTriggers(p.root,await fs.readFile(path.join(p.root,WORKFLOW),'utf8'));
assert.equal(await fs.readFile(path.join(p.root,WORKFLOW),'utf8'),await fs.readFile(path.join(p.packet,'workflow/yard-pip-grounding-ab.yml'),'utf8'),'Workflow review copy must match executable workflow');
await fs.mkdir(p.results);await fs.writeFile(path.join(p.results,'preflight.json'),JSON.stringify({status:'PREFLIGHT_PASSED',head:event.after,base:manifest.base,baseTree:manifest.baseTree,correctness:proof,protectedTree,pins,triggers,scope:'Private quality experiment only; no production activation'},null,2)+'\n',{flag:'wx'});
