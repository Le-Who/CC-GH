import assert from 'node:assert/strict';
import {BRANCH} from './identity.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.equal(process.env.GITHUB_REF,'refs/heads/'+BRANCH);
