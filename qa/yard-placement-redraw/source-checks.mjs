import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {tests}=JSON.parse(await fs.readFile(new URL('./source-suites.json',import.meta.url),'utf8'));
assert(Array.isArray(tests)&&tests.length>=8);assert.equal(new Set(tests).size,tests.length);assert(tests.every(p=>/^(tests|qa\/yard-(placement-redraw|canonical-acceptance))\/[A-Za-z0-9_./-]+\.test\.mjs$/.test(p)&&!p.split('/').includes('..')));
execFileSync(process.execPath,['--import','./tests/yard-pip-register-vendor.mjs','--test','--test-concurrency=1',...tests],{stdio:'inherit',timeout:60000});
