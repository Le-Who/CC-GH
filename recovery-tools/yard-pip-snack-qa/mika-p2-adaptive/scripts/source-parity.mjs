import {readFileSync,writeFileSync} from 'node:fs';
import {sampleMikaLocomotion} from '../src/mika-locomotion.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const calibration=read('../src/mika-p2-calibration.json');
let maximum=0,witness=null,count=0,rootMaximum=0,phaseMaximum=0;
for(const [mirror,file] of [[false,'motion.json'],[true,'mirrored-motion.json']]) {
  for(const expected of read('../tests/fixtures/'+file).rows) {
    const actual=sampleMikaLocomotion({kind:'accepted-p2-reference',mirror},calibration,expected.time),c=Math.cos(actual.root.heading),s=Math.sin(actual.root.heading);
    rootMaximum=Math.max(rootMaximum,...actual.root.position.map((v,i)=>Math.abs(v-expected.root[i])));
    phaseMaximum=Math.max(phaseMaximum,Math.abs(actual.phase-expected.phase));
    for(const [name,m]of Object.entries(actual.boneMatrices))for(let j=0;j<4;j++) {
      const reconstructed=[c*m[0][j]-s*m[1][j],s*m[0][j]+c*m[1][j],m[2][j],m[3][j]];
      for(let i=0;i<4;i++) {
        const error=Math.abs(reconstructed[i]-expected.bones[name][i][j]);
        if(error>maximum){maximum=error;witness={mirror,time:expected.time,bone:name,row:i,column:j};}count++;
      }
    }
  }
}
const report={scope:'independent immutable-source all-matrix parity, no renderer',sourceSamples:194,matrixComponents:count,maxAbsoluteMatrixComponentError:maximum,witness,maxRootError:rootMaximum,maxPhaseError:phaseMaximum,threshold:2e-6,passed:maximum<2e-6};
writeFileSync(new URL('../evidence/09-checkpoint02-all-matrix-parity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
