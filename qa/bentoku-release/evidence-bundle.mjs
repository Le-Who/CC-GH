/** Existing ZIP/CRC verifier, with a bounded12MiB envelope for the added game. */
import assert from 'node:assert/strict';
import {readEvidenceZip,sha} from '../../scripts/yard-development-receipt.mjs';
export const EVIDENCE_CAP=12*1024*1024;
export function verifyOriginalBundle(archive){
 const outer=readEvidenceZip(archive,{maxBytes:EVIDENCE_CAP,maxDecodedBytes:EVIDENCE_CAP+8192,maxFiles:2});
 assert.deepEqual(Object.keys(outer).sort(),['evidence.zip','summary.json']);
 const summary=JSON.parse(outer['summary.json']);
 assert.equal(summary.status,'PACKAGED');assert.equal(summary.completeOriginalsStaged,true);
 assert.equal(summary.retentionDays,3);assert.equal(summary.capBytes,EVIDENCE_CAP);
 assert(summary.transferBytesUpperBound<=EVIDENCE_CAP);
 assert.equal(summary.archiveBytes,outer['evidence.zip'].length);assert.equal(summary.archiveSha256,sha(outer['evidence.zip']));
 const files=readEvidenceZip(outer['evidence.zip'],{maxBytes:EVIDENCE_CAP}),manifest=JSON.parse(files['MANIFEST.sha256.json']);
 assert.equal(manifest.format,'yard-lossless-evidence/v1');
 assert.equal(sha(files['MANIFEST.sha256.json']),summary.manifestSha256);
 assert.equal(manifest.files.length,summary.originalCount);
 assert.deepEqual(manifest.files.map(r=>r.path).sort(),Object.keys(files).filter(p=>p!=='MANIFEST.sha256.json').sort());
 for(const row of manifest.files){assert(Number.isSafeInteger(row.bytes)&&row.bytes>=0);assert.equal(files[row.path].length,row.bytes);assert.equal(sha(files[row.path]),row.sha256);}
 return {files,manifest,summary};
}
