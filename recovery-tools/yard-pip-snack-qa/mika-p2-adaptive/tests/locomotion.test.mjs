import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sampleMikaLocomotion, createMikaLocomotionRoute} from '../src/mika-locomotion.mjs';
const data = name => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const calibration = data('../src/mika-p2-calibration.json');
const original = data('./fixtures/motion.json');

test('navigation owns root motion once and reconstructs the accepted P2 pose', () => {
  const expected = original.rows[54];
  const sample = sampleMikaLocomotion({kind:'accepted-p2-reference'}, calibration, expected.time);
  assert.equal(sample.rootOwner, 'navigation');
  assert.deepEqual(sample.root.position.map(v=>+v.toFixed(6)), expected.root.map(v=>+v.toFixed(6)));
  assert.ok(Math.abs(sample.root.heading - expected.yaw) < 1e-8);
  assert.equal(Object.keys(sample.boneMatrices).length, 22);
  const c=Math.cos(sample.root.heading),s=Math.sin(sample.root.heading);
  for (const [name, expectedMatrix] of Object.entries(expected.bones)) {
    const local=sample.boneMatrices[name];
    for(let j=0;j<4;j++) {
      assert.ok(Math.abs(c*local[0][j]-s*local[1][j]-expectedMatrix[0][j])<2e-6, `${name}: x ${j}`);
      assert.ok(Math.abs(s*local[0][j]+c*local[1][j]-expectedMatrix[1][j])<2e-6, `${name}: y ${j}`);
      assert.ok(Math.abs(local[2][j]-expectedMatrix[2][j])<2e-6, `${name}: z ${j}`);
    }
  }
});

test('all original and mirrored source samples preserve phase and four contact events', () => {
  for(const [mirror,fixture] of [[false,original],[true,data('./fixtures/mirrored-motion.json')]]) {
    const route={kind:'accepted-p2-reference',mirror};
    for(const expected of fixture.rows) {
      const sample=sampleMikaLocomotion(route,calibration,expected.time);
      assert.ok(Math.abs(sample.phase-expected.phase)<1e-9);
      assert.equal(sample.reachFailures.length,0);
      const c=Math.cos(sample.root.heading),s=Math.sin(sample.root.heading);
      for(const [name,m]of Object.entries(sample.boneMatrices))for(let j=0;j<4;j++) {
        const reconstructed=[c*m[0][j]-s*m[1][j],s*m[0][j]+c*m[1][j],m[2][j],m[3][j]];
        for(let i=0;i<4;i++)assert.ok(Math.abs(reconstructed[i]-expected.bones[name][i][j])<2e-6,`${mirror}/${expected.time}/${name}/matrix[${i}][${j}]`);
      }
      for(const f of calibration.phaseOrder) {
        const actual=sample.contacts[f],want=expected.limbs[f];
        assert.equal(actual.contact,want.contact,`${mirror}/${expected.time}/${f}/contact`);
        assert.equal(actual.stanceId,want.stanceId);
        for(const key of ['paw','hip','knee','ankle'])for(let i=0;i<3;i++)assert.ok(Math.abs(actual[key][i]-want[key][i])<2e-6,`${mirror}/${expected.time}/${f}/${key}`);
        for(const key of ['yaw','curl','load','reachMargin','swingStart','swingEnd','nextSwingStart'])assert.ok(Math.abs(actual[key]-want[key])<1e-8,`${mirror}/${expected.time}/${f}/${key}`);
      }
    }
    const first=sampleMikaLocomotion(route,calibration,2.25);
    sampleMikaLocomotion(route,calibration,4);sampleMikaLocomotion(route,calibration,.125);
    assert.deepEqual(sampleMikaLocomotion(route,calibration,2.25),first,'non-monotone queries are pure');
  }
});

test('stationary or unqualified-speed routes cannot make Mika walk in place or slide', () => {
  for(const speed of [0,.3,1.2])assert.throws(()=>createMikaLocomotionRoute(t=>({position:[speed*t,0,0],heading:0}),calibration),/UNQUALIFIED_ROOT_SPEED/);
});

test('invalid calibration is refused instead of emitting NaN or unreachable poses', () => {
  for(const [key,value] of [['referencePeakYawRate',0],['straightPeriod',0],['straightPeriod',NaN],['turnPeriodReduction',.92],['referenceSpeed',Infinity]]) {
    const broken=structuredClone(calibration);broken.gait[key]=value;
    assert.throws(()=>sampleMikaLocomotion({kind:'accepted-p2-reference'},broken,1),/INVALID_MIKA_CALIBRATION/,key);
    assert.throws(()=>createMikaLocomotionRoute(t=>({position:[.74*t,0,0],heading:0}),broken),/INVALID_MIKA_CALIBRATION/,key);
  }
});

test('turns exceeding the calibrated yaw-rate envelope are explicitly unsupported', () => {
  const rate=2,radius=.74/rate;
  assert.throws(()=>createMikaLocomotionRoute(t=>({position:[radius*Math.sin(rate*t),radius*(1-Math.cos(rate*t)),0],heading:rate*t}),calibration),/UNQUALIFIED_ROOT_YAW_RATE/);
});

test('an unreachable four-paw pose is refused, never emitted as valid locomotion', () => {
  const impossible=structuredClone(calibration);impossible.limbs.hindFar.upperLength=.1;impossible.limbs.hindFar.lowerLength=.1;
  const route=createMikaLocomotionRoute(t=>({position:[.74*t,0,0],heading:0}),impossible);
  assert.throws(()=>sampleMikaLocomotion(route,impossible,1.2),/UNREACHABLE_MIKA_POSE/);
});

test('route preparation snapshots callback values so later changes cannot bypass admission', () => {
  let speed=.74;
  const route=createMikaLocomotionRoute(t=>({position:[speed*t,0,0],heading:0}),calibration);
  const before=sampleMikaLocomotion(route,calibration,2);
  speed=0;
  assert.deepEqual(sampleMikaLocomotion(route,calibration,2),before);
});

test('the heading interpolant cannot conceal an excessive yaw rate between table nodes', () => {
  assert.throws(()=>createMikaLocomotionRoute(t=>({position:[.74*t,0,0],heading:Math.abs(t-1)<.0001?.0015:0}),calibration),/UNQUALIFIED_ROOT_YAW_RATE/);
});

test('a prepared route is bound to its immutable calibration and rejects changed parameters', () => {
  const mutable=structuredClone(calibration);
  const route=createMikaLocomotionRoute(t=>({position:[.74*t,0,0],heading:0}),mutable);
  const expected=sampleMikaLocomotion(route,mutable,2);
  mutable.gait.lower=.06;
  assert.throws(()=>sampleMikaLocomotion(route,mutable,2),/MIKA_ROUTE_CALIBRATION_MISMATCH/);
  assert.deepEqual(sampleMikaLocomotion(route,structuredClone(calibration),2),expected);
});
