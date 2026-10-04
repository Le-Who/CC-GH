import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {verifyReleaseHealth} from '../scripts/verify-release-health.mjs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const sha='a'.repeat(40),read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
test('health gate rejects degraded or wrong builds even under HTTP200',()=>{assert.equal(verifyReleaseHealth({status:'ok',buildId:sha},sha),true);for(const payload of [{status:'degraded',buildId:sha},{status:'ok',buildId:'b'.repeat(40)},null])assert.throws(()=>verifyReleaseHealth(payload,sha));assert.throws(()=>verifyReleaseHealth({status:'ok',buildId:sha},'latest'));});
test('default deployment requires reusable CI before publishing image',()=>{const ci=read('.github/workflows/ci.yml'),deploy=read('.github/workflows/deploy.yml');assert.match(ci,/workflow_call:/);assert.match(deploy,/validate:\n    uses: \.\/\.github\/workflows\/ci.yml/);assert.match(deploy,/build-and-push:\n    needs: validate/);assert.match(deploy,/deploy:\n    needs: build-and-push/);assert.match(deploy,/format=long/);assert.match(deploy,/APP_IMAGE_SUFFIX=@\$APP_IMAGE_DIGEST/);assert.match(deploy,/image_digest: \$\{\{ steps.build_image.outputs.digest \}\}/);assert.match(read('docker-compose.yml'),/\$\{APP_IMAGE_SUFFIX:-:latest\}/);assert.equal((deploy.match(/verify-release-health\.mjs/g)||[]).length,2);});
test('pre-release database backup is checked before switching app',()=>{const s=read('.github/workflows/deploy.yml');assert.ok(s.indexOf('pg_dump')<s.indexOf('compose -p ccgh up'));assert.match(s,/pg_restore --list/);assert.doesNotMatch(s,/rm.*BACKUP_PATH/);assert.doesNotMatch(s,/if docker inspect ccgh-postgres/);assert.match(s,/docker inspect ccgh-postgres >\/dev\/null/);});

test('CI actually includes the release gate and default validation is not duplicated',()=>{const p=JSON.parse(read('package.json'));assert.ok(p.scripts.test.includes('tests/release-gate.test.js'));assert.doesNotMatch(read('.github/workflows/ci.yml'),/\n  push:/);assert.equal((read('.github/workflows/deploy.yml').match(/--connect-timeout 5 --max-time 10/g)||[]).length,2);});

const mandatoryDockerGates = ['test', 'browser', 'touch', 'mochi'];
function assertMandatoryDockerGates(ci) {
  const docker = ci.split('\n  docker:\n')[1]?.split(/\n  [a-z][a-z0-9_-]*:\n/)[0];
  assert.ok(docker, 'Docker release gate job must exist');
  const match = docker.match(/^    needs:\s*\[([^\]\n]+)\]\s*$/m);
  assert.ok(match, 'Docker must declare its required CI jobs');
  const needs = match[1].split(',').map(value => value.trim());
  assert.equal(new Set(needs).size, needs.length, 'Duplicate Docker dependencies');
  for (const gate of mandatoryDockerGates) assert.ok(needs.includes(gate), `Docker must require ${gate}`);
}
test('touch gesture project and every browser group are mandatory release gates',()=>{const ci=read('.github/workflows/ci.yml');assert.match(ci,/tests\/e2e\/gestures\.spec\.js --project=mobile-chrome --workers=1/);assertMandatoryDockerGates(ci);assert.match(ci,/playwright test -c playwright\.mochi\.config\.js --project=chromium --workers=1/);assert.doesNotMatch(ci,/continue-on-error/);});
test('Docker dependency contract rejects every missing gate and unrelated-job decoys', () => {
  const fixture = needs => `jobs:\n  other:\n    needs: [test, browser, touch, mochi]\n  docker:\n    needs: [${needs.join(', ')}]\n    steps: []\n`;
  assertMandatoryDockerGates(fixture([...mandatoryDockerGates].reverse()));
  assertMandatoryDockerGates(fixture([...mandatoryDockerGates, 'future-yard-media']));
  for (const missing of mandatoryDockerGates) assert.throws(() => assertMandatoryDockerGates(fixture(mandatoryDockerGates.filter(gate => gate !== missing))), new RegExp(`require ${missing}`));
  assert.throws(() => assertMandatoryDockerGates(fixture([...mandatoryDockerGates, 'touch'])), /Duplicate/);
  assert.throws(() => assertMandatoryDockerGates('jobs:\n  other:\n    needs: [test, browser, touch, mochi]\n'), /job must exist/);
});

for (const failureStage of ['before-switch', 'up', 'health', 'none']) {
  test(`release ${failureStage} preserves data and restores the prior app only on failure`, () => {
    const deploy = read('.github/workflows/deploy.yml');
    const exitStart = deploy.indexOf('            release_exit() {');
    const exitEnd = deploy.indexOf('            cat > .env << EOF', exitStart);
    const rollbackStart = deploy.indexOf('            rollback_application() {');
    const rollbackEnd = deploy.indexOf('            compose -p ccgh pull app', rollbackStart);
    const switchStart = deploy.indexOf('            RELEASE_SWITCH_STARTED=1');
    const switchEnd = deploy.indexOf('\n\n', switchStart);
    assert.ok(exitStart >= 0 && exitEnd > exitStart && rollbackStart >= 0 && rollbackEnd > rollbackStart && switchStart >= 0 && switchEnd > switchStart);
    assert.ok(deploy.indexOf('cp -p .env "$PREVIOUS_ENV_BACKUP"') < exitEnd);
    const previous = 'b'.repeat(40), oldEnv = `APP_BUILD_ID=${previous}\nAPP_IMAGE_SUFFIX=@prior\n`;
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-gh-release-'));
    try {
      fs.writeFileSync(path.join(fixture, '.env.before'), oldEnv);
      fs.writeFileSync(path.join(fixture, 'player-data.json'), '{"wallet":37,"receipt":"retained"}\n');
      const stubs = String.raw`
docker() {
  printf 'docker %s\n' "$*" >> calls
  case "$1 $2" in
    'image tag') test "$3" = "$PREVIOUS_IMAGE_ID" ;;
    'inspect --format')
      case "$3" in
        '{{.Image}}') printf '%s\n' "$PREVIOUS_IMAGE_ID" ;;
        '{{.State.Running}}') printf 'true\n' ;;
        *) return 5 ;;
      esac ;;
    *) return 6 ;;
  esac
}
compose() {
  printf 'compose %s build=%s image=%s\n' "$*" "$APP_BUILD_ID" "$APP_IMAGE_SUFFIX" >> calls
  printf '%s\n' "$APP_BUILD_ID" > app-build
  if [ "$FAILURE_STAGE" = up ] && [ "$APP_BUILD_ID" = "$CANDIDATE_BUILD" ]; then return 23; fi
}
`;
      const script = [
        'set -euo pipefail', `APP_BUILD_ID=${sha}`, `CANDIDATE_BUILD=${sha}`, `PREVIOUS_BUILD_ID=${previous}`,
        'PREVIOUS_IMAGE_ID=sha256:retained', 'PREVIOUS_ENV_BACKUP=.env.before', 'REPO_LOWER=le-who/cc-gh',
        'APP_IMAGE_SUFFIX=@candidate', 'RELEASE_SWITCH_STARTED=0', `FAILURE_STAGE=${failureStage}`,
        stubs, deploy.slice(exitStart, exitEnd), deploy.slice(rollbackStart, rollbackEnd),
        'printf "APP_BUILD_ID=%s\\nAPP_IMAGE_SUFFIX=@candidate\\n" "$APP_BUILD_ID" > .env',
        'if [ "$FAILURE_STAGE" = before-switch ]; then exit 23; fi',
        deploy.slice(switchStart, switchEnd), 'if [ "$FAILURE_STAGE" = health ]; then exit 23; fi', 'exit 0',
      ].join('\n');
      fs.writeFileSync(path.join(fixture, 'run.sh'), script);
      const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
      const result = spawnSync(bash, ['--noprofile', '--norc', 'run.sh'], {cwd: fixture, encoding: 'utf8', timeout: 10000, windowsHide: true});
      assert.ifError(result.error);
      assert.equal(result.status, failureStage === 'none' ? 0 : 23, result.stderr);
      assert.equal(fs.readFileSync(path.join(fixture, 'player-data.json'), 'utf8'), '{"wallet":37,"receipt":"retained"}\n');
      if (failureStage === 'none') {
        assert.match(fs.readFileSync(path.join(fixture, '.env'), 'utf8'), new RegExp(sha));
        assert.equal(fs.readFileSync(path.join(fixture, 'app-build'), 'utf8').trim(), sha);
        assert.equal(fs.existsSync(path.join(fixture, '.env.before')), false);
      } else {
        assert.equal(fs.readFileSync(path.join(fixture, '.env'), 'utf8'), oldEnv);
        assert.equal(fs.existsSync(path.join(fixture, '.env.before')), true);
        if (failureStage === 'before-switch') assert.equal(fs.existsSync(path.join(fixture, 'calls')), false);
        else {
          const calls = fs.readFileSync(path.join(fixture, 'calls'), 'utf8');
          assert.match(calls, /compose -p ccgh up -d --no-deps app/);
          assert.equal(fs.readFileSync(path.join(fixture, 'app-build'), 'utf8').trim(), previous);
          assert.doesNotMatch(calls, /(?:pg_restore|volume|--remove-orphans).*build=b/);
        }
      }
    } finally {
      assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
      fs.rmSync(fixture, {recursive: true, force: true});
    }
  });
}
