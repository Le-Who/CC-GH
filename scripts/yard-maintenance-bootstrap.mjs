/** One reviewed bootstrap capsule, never a generic protected-path allowlist. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const BOOTSTRAP_PATHS=Object.freeze([
 '.github/workflows/ci.yml',
 '.github/workflows/yard-maintenance-acceptance.yml',
 '.github/workflows/yard-maintenance-image.yml',
 '.github/workflows/yard-maintenance-release.yml',
 'docs/yard-active-maintenance-design.md',
 'playwright.yard-maintenance.config.js',
 'scripts/verify-yard-rollback-target.mjs',
 'scripts/yard-active-maintenance.mjs',
 'scripts/yard-maintenance-bootstrap.mjs',
 'scripts/yard-maintenance-capability.mjs',
 'scripts/yard-maintenance-cli.mjs',
 'scripts/yard-maintenance-ci-router.mjs',
 'scripts/yard-maintenance-production.mjs',
 'scripts/yard-maintenance-pre-switch-guard.sh',
 'scripts/yard-maintenance-receipt.mjs',
 'scripts/yard-release-compatibility.mjs',
 'tests/helpers/yard-maintenance-guard.mjs',
 'tests/yard-active-maintenance.test.mjs',
 'tests/yard-closed-ci-receipt.test.mjs',
 'tests/yard-maintenance-e2e/maintenance.spec.js',
 'tests/yard-maintenance-integration.test.mjs',
].sort());
// These are the five separately reviewed QA additions needed by the first
// Settlement payload. No prefix exception is granted to ordinary maintenance.
export const SETTLEMENT_QA_PATHS=Object.freeze([
 '.github/workflows/settlement-ui-acceptance.yml',
 'scripts/lib/settlement-natural-raster-policy.mjs',
 'scripts/settlement-assets.mjs',
 'scripts/verify-settlement-illustrated-ui.mjs',
 'tests/yard-garden-player-copy.test.mjs',
].sort());
function verifyRows(rows,paths,before,after){
 assert.ok(Array.isArray(rows));assert.deepEqual(rows.map(row=>row.path),paths,'Exact bootstrap tooling inventory required');
 for(const row of rows){assert.deepEqual(Object.keys(row).sort(),['after','before','path']);assert.deepEqual(before.get(row.path)||null,row.before);assert.deepEqual(after.get(row.path)||null,row.after);assert.ok(row.after&&row.after.type==='blob'&&row.after.mode==='100644');assert.match(row.after.objectId,/^[a-f0-9]{40}$/);assert.notDeepEqual(row.before,row.after,'Every reviewed bootstrap path must change');}
}
export function verifyMaintenanceBootstrap({bytes,expectedSha256,record,before,after}){
 assert.match(expectedSha256||'',/^[a-f0-9]{64}$/,'Independent bootstrap approval required');assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedSha256);assert.equal(record.bootstrapSha256,expectedSha256);
 assert.equal(record.predecessor.commit,record.anchor.commit,'Bootstrap only follows the actual initial ACTIVE anchor');assert.equal(before.has('game-logic/yard-v2/maintenance-release-contract.json'),false,'Bootstrap cannot be replayed after maintenance');
 const capsule=JSON.parse(bytes);assert.deepEqual(Object.keys(capsule).sort(),['anchorCommit','format','paths',...(Object.hasOwn(capsule,'settlementQa')?['settlementQa']:[])]);assert.equal(capsule.format,'cc-gh-yard-maintenance-bootstrap/v1');assert.equal(capsule.anchorCommit,record.anchor.commit);
 verifyRows(capsule.paths,BOOTSTRAP_PATHS,before,after);
 const permitted=capsule.paths.map(row=>row.path);
 if(Object.hasOwn(capsule,'settlementQa')){
  assert.ok(record.affectedGames.includes('settlement'),'Settlement QA capsule only accompanies its reviewed game change');
  const supplied=capsule.settlementQa;assert.ok(supplied&&typeof supplied==='object'&&!Array.isArray(supplied));assert.deepEqual(Object.keys(supplied).sort(),['bytes','sha256']);assert.equal(typeof supplied.bytes,'string');assert.match(supplied.sha256||'',/^[a-f0-9]{64}$/);assert.equal(createHash('sha256').update(supplied.bytes).digest('hex'),supplied.sha256,'Separately pinned Settlement QA capsule changed');
  const qa=JSON.parse(supplied.bytes);assert.deepEqual(Object.keys(qa).sort(),['format','paths','sourceManifestSha256']);assert.equal(qa.format,'cc-gh-yard-settlement-qa-bootstrap/v1');assert.match(qa.sourceManifestSha256||'',/^[a-f0-9]{64}$/);
  verifyRows(qa.paths,SETTLEMENT_QA_PATHS,before,after);permitted.push(...qa.paths.map(row=>row.path));
 }
 return permitted;
}
