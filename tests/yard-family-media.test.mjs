/** Retained source profiles after retirement of the old raster renderer. */
import test from 'node:test';import assert from 'node:assert/strict';
import {FAMILY_ASSETS} from '../game-logic/yard-v2/media/family-assets.mjs';
import {FAMILY_ACTOR_PROFILES} from '../game-logic/yard-v2/family-actor-profile.mjs';
import {digest} from '../game-logic/yard-v2/util.mjs';
const copy=structuredClone;
test('exact small profiles pin every frozen stride, ground revision, own turn and interaction/rest cycle',()=>{
 // Released source metadata is ready; admission still requires the exact source preflight.
 for(const[id,d]of Object.entries(FAMILY_ASSETS)){const p=FAMILY_ACTOR_PROFILES[id];assert.equal(p.playbackReady,true);assert.equal(p.visitorId,d.ground.visitorId);assert.equal(p.locomotion.cycleMs,d.stride.durationMs);assert.equal(p.locomotion.strideWorld,d.stride.strideWorld);assert.deepEqual(p.locomotion.phaseSamples,d.stride.frames.slice(0,-1).map(r=>r.atMs/d.stride.durationMs));assert.equal(p.ground.revision,`${id}-authored-ground/r2:${digest(d.ground)}`);assert.equal(p.turns.durations[2],d.ground.clips.left90.durationMs);assert.equal(p.turns.durations[4],2*d.ground.clips.left90.durationMs);for(const[cid,c]of Object.entries(d.clips))assert.deepEqual(p.interactions[cid].loop,{...copy(c.restLoop),fps:25});}
});
