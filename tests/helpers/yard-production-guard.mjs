/** CI-only disposable Docker lane. Never selected by production code. */
import assert from 'node:assert/strict';
export const PRODUCTION_PORTS=Object.freeze({A:3231,B:3232,origin:3233,database:35432});
export const ACTORS=Object.freeze(['mika','mochi','pebble','pip','willow','starlit','basil','sage']);
export const PROPS=Object.freeze(['yarn_mouse','sun_cushion','leaf_pot','snack_table','moon_lamp','fountain_bowl']);
export const FIXTURE_BOT_TOKEN='9000000000:yard-production-disposable-not-a-real-bot';
export const DATABASE_URL='postgres://ccgh_yard_production_ci:ccgh_yard_production_ci@127.0.0.1:35432/ccgh_yard_production_ci';
export function assertProductionAcceptance(env=process.env){
 assert.equal(env.YARD_PRODUCTION_ACCEPTANCE,'1','Explicit production acceptance opt-in required');
 assert.equal(env.CI,'true','Only isolated CI execution is supported');
 for(const key of ['NODE_OPTIONS','DEV_AUTH_ENABLED','TELEGRAM_BOT_TOKEN','REDIS_URL','YARD_CANDIDATE_CI','YARD_PLAYER_WIRING_TEST','YARD_EIGHT_PLAYER_CANDIDATE_TEST'])assert.ok(!env[key],`Inherited ${key} is forbidden`);
 assert.ok(!env.DATABASE_URL||env.DATABASE_URL===DATABASE_URL,'Only the disposable production acceptance database is allowed');
 assert.match(env.YARD_ACTIVE_COMMIT||'',/^[a-f0-9]{40}$/,'Exact active commit required');
 assert.match(env.YARD_CLOSED_COMMIT||'',/^[a-f0-9]{40}$/,'Frozen closed commit required');
 assert.notEqual(env.YARD_ACTIVE_COMMIT,env.YARD_CLOSED_COMMIT);
 assert.match(env.YARD_CLOSED_DIGEST||'',/^sha256:[a-f0-9]{64}$/,'Frozen closed registry digest required');
 assert.match(env.YARD_IMAGE_REPOSITORY||'',/^ghcr\.io\/[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/,'Exact GHCR repository required');
 return {activeCommit:env.YARD_ACTIVE_COMMIT,closedCommit:env.YARD_CLOSED_COMMIT,closedDigest:env.YARD_CLOSED_DIGEST,repository:env.YARD_IMAGE_REPOSITORY};
}
export function verifyImageIdentity(image,{commit,digest,repository}){
 assert.match(image.Id||'',/^sha256:[a-f0-9]{64}$/);
 assert.equal(image.Config?.Labels?.['org.opencontainers.image.revision'],commit);
 assert.deepEqual(image.Config?.Cmd,['node','server.js']);
 const env=Object.fromEntries((image.Config?.Env||[]).map(row=>{const i=row.indexOf('=');return[row.slice(0,i),row.slice(i+1)];}));
 assert.equal(env.NODE_ENV,'production');assert.equal(env.APP_BUILD_ID,commit);
 for(const key of ['NODE_OPTIONS','DEV_AUTH_ENABLED','YARD_PLAYER_WIRING_TEST','YARD_CANDIDATE_CI'])assert.ok(!env[key]);
 if(digest)assert.ok(image.RepoDigests?.includes(`${repository}@${digest}`),'Closed registry digest mismatch');
 return image.Id;
}
export function verifyCompatibility(A,B,inputs){
 assert.equal(A.format,'cc-gh-yard-release-compatibility/v1');assert.equal(B.format,A.format);
 assert.equal(A.buildId,inputs.closedCommit);assert.equal(B.buildId,inputs.activeCommit);
 assert.equal(A.playerRolloutEnabled,false);assert.equal(A.closedQuarantineVerified,true);
 assert.equal(B.playerRolloutEnabled,true);
 assert.deepEqual(B.requiredClosedPredecessor,{buildId:inputs.closedCommit,imageDigest:inputs.closedDigest});
 assert.ok(A.readableStorageFormats.includes('yard-persistent/v1'));assert.ok(B.readableStorageFormats.includes('yard-persistent/v1'));
}
