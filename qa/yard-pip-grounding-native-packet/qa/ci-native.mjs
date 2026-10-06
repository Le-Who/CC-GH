import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {installedPaths,git} from './ci-contract.mjs';
const p=installedPaths();assert.equal(JSON.parse(await fs.readFile(path.join(p.results,'preflight.json'))).status,'PREFLIGHT_PASSED');
assert.equal(git(p.root,['diff','--name-only','HEAD']),'','Tracked input changed before native run');
execFileSync(process.execPath,[path.join(p.packet,'qa/run.mjs'),p.root,p.build],{cwd:p.root,env:{...process.env,YARD_PIP_GROUNDING_NATIVE:'1'},stdio:'inherit',timeout:240000});
