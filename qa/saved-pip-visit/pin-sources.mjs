/** Verify the reviewed closure in an integrated checkout. The last explicit
 * overlay entry replaces its baseline counterpart; no source hash is guessed. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {here,resolveSource} from './config.mjs';
const expected=JSON.parse(fs.readFileSync(path.join(here,'source-provenance.json'))),files=new Map();
for(const entry of [...expected.baseline,...expected.overlay])files.set(entry.path,entry);
const checked=[];
for(const [relative,entry]of files){const file=resolveSource(relative),bytes=fs.readFileSync(file),sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,entry.sha256,relative);checked.push({path:relative,bytes:bytes.length,sha256});}
fs.writeFileSync(path.join(here,'source-verification.json'),JSON.stringify({passed:true,baseCommit:expected.commit,files:checked},null,2)+'\n');
console.log(JSON.stringify({passed:true,files:checked.length}));
