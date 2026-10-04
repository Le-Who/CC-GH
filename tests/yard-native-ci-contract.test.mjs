import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVIDENCE_KINDS, EVIDENCE_PARTS_PER_KIND, EVIDENCE_PART_BYTES } from '../scripts/collect-browser-ci-evidence.mjs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('long native lane is opt-in, isolated, pinned, and preserves source preflight and failure evidence', () => {
  const workflow = read('.github/workflows/yard-native-gameplay-qa.yml');
  assert.match(workflow, /yard-native-gameplay-qa'\)/); assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /timeout-minutes: 150/);
  assert.match(workflow, /pnpm@10\.28\.2/); assert.match(workflow, /--frozen-lockfile/);
  assert.match(workflow, /verify-production\.mjs/); assert.match(workflow, /yard-native-ci-preflight\.mjs/); assert.match(workflow, /git diff --exit-code/);
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'NODE_OPTIONS', 'YARD_CANDIDATE_CI']) assert.ok(workflow.includes(`${key}: ''`));
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|continue-on-error|deploy|cancel-in-progress: true/);
  assert.match(workflow, /set -euo pipefail/); assert.match(workflow, /trap 'kill "\$yard_qa_server_pid"/);
  assert.match(workflow, /if: always\(\)\n        uses: \.\/.github\/actions\/upload-browser-evidence/);
});
test('owned runner uses eight independent actual-media scenes and unchanged wall-clock native service', () => {
  const runner = read('scripts/yard-native-full-gameplay.cjs'), runtime = read('scripts/yard-native-gameplay-runtime.mjs'), preview = read('recovery-tools/yard-canonical-eight-qa/preview.mjs');
  assert.match(runner, /actorIds=\['mika','mochi110','pebble','pip','willow','starlit','basil','sage'\]/);
  assert.match(runner, /browser.newContext\(\{viewport:\{width:390,height:844\},deviceScaleFactor:2/);
  assert.doesNotMatch(runner, /\.seek\(|\.setSystemTime\(|\.fastForward\(|recordVideo|\.screenshot\(/);
  assert.match(runtime, /c\.origin\+\(c\.started===null\?0:Math\.floor\(performance\.now\(\)-c\.started\)\)/);
  assert.match(runtime, /executePersistentYardAction/); assert.match(runtime, /url.searchParams.size!==1/);
  assert.match(preview, /if\(playing\)elapsed\+=stamp-lastStamp/);
  const fixture = JSON.parse(read('recovery-tools/yard-canonical-eight-qa/fixture.json'));
  const durations = ['mika','mochi110','pebble','pip','willow','starlit','basil','sage'].map(id => {
    const r = (fixture.actors[id] || fixture.extraWitnesses[id]).record; return (r.leavesAt-r.arrivedAt)/60000;
  });
  assert.deepEqual(durations, [69,110,93,57,77,65,49,51]); assert.equal(fixture.releaseAccepted, false);
});
test('every evidence part is independently bounded and includes the run attempt', () => {
  const action = read('.github/actions/upload-browser-evidence/action.yml'), steps = action.split(/\n(?=    - name:)/);
  assert.ok(EVIDENCE_PART_BYTES < 512 * 1024 * 1024);
  for (const kind of EVIDENCE_KINDS) for (let i=1;i<=EVIDENCE_PARTS_PER_KIND;i++) {
    const part = `${kind}-${String(i).padStart(2,'0')}`, uploads = steps.filter(s => s.includes(`path: browser-evidence/${part}/\n`));
    assert.equal(uploads.length,1); assert.match(uploads[0],/if: always\(\)/); assert.match(uploads[0],/github.run_attempt/);
  }
});
