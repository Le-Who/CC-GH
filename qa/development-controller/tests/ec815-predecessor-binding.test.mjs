import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDevelopmentRecord, sha256, PREDECESSOR, PREDECESSOR_TREE, PREDECESSOR_IMAGE_ID, PREDECESSOR_IMAGE_DIGEST, PREDECESSOR_DEPLOYMENT, PREDECESSOR_ACCEPTANCE} from '../scripts/yard-development-contract.mjs';
const record = () => ({format:'cc-gh-yard-development-release/v1',repository:'le-who/cc-gh',mode:'development-protocol-evolution',predecessor:{commit:PREDECESSOR,tree:PREDECESSOR_TREE,imageId:PREDECESSOR_IMAGE_ID,imageDigest:PREDECESSOR_IMAGE_DIGEST,receiptSha256:'a'.repeat(64)},candidate:{commit:'b'.repeat(40),tree:'c'.repeat(40),imageId:'sha256:'+'d'.repeat(64),imageDigest:'sha256:'+'e'.repeat(64),receiptSha256:'f'.repeat(64)},storage:{format:'yard-persistent/v1',readVersions:[1,2],writeVersions:[1,2],transition:'first-successful-canonical-placement-writes-v2',rollback:'prior-image-compatible-replay-preserves-v2',compatibilityRequired:true,reset:'none'},capabilities:{authority:'source-owned-authenticated-policy',clientGraph:true,itemKinds:['leaf_pot'],placementLimit:2,foodSocket:'bowl-1',canonicalVisitorAdmission:false,fixtureLoader:false,devAuth:false},runtime:{composeSha256:'a'.repeat(64),localUrl:'http://127.0.0.1:18080/',publicUrl:'https://games.tri.mom/',dbUser:'appuser',dbName:'gamehub',protectedServices:['caddy.service'],neighborPublicHealth:'not-proven'}});
const parse = r => {const bytes=JSON.stringify(r);return parseDevelopmentRecord(bytes,sha256(bytes));};
test('ec815 exact predecessor identity is accepted only with a complete synthetic candidate',()=>assert.equal(parse(record()).predecessor.commit,PREDECESSOR));
for(const field of ['commit','tree','imageId','imageDigest'])test(`ec815 rejects predecessor ${field} substitution`,()=>{const r=record();r.predecessor[field]=field.startsWith('image')?'sha256:'+'0'.repeat(64):'0'.repeat(40);assert.throws(()=>parse(r));});
for(const field of ['commit','tree','imageId','imageDigest','receiptSha256'])test(`unknown future candidate ${field} stays blocked`,()=>{const r=record();r.candidate[field]=null;assert.throws(()=>parse(r));});
test('recovered predecessor receipt has exact fixed image and deployment identities',()=>{
 const r=JSON.parse(readFileSync(new URL('../predecessor-receipt.json',import.meta.url)));
 assert.deepEqual(r.release,{commit:PREDECESSOR,tree:PREDECESSOR_TREE,imageDigest:PREDECESSOR_IMAGE_DIGEST,imageId:PREDECESSOR_IMAGE_ID});
 assert.deepEqual(r.acceptance,PREDECESSOR_ACCEPTANCE);assert.deepEqual(r.deployment,PREDECESSOR_DEPLOYMENT);
});
