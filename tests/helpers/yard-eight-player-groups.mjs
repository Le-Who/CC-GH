/** Exact ownership of all 59 genuine cases; never test-name grep or retries. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {EIGHT_IDS} from './yard-eight-player-candidate.mjs';
export const EIGHT_PLAYER_VIEWPORTS=Object.freeze([
 {name:'small-phone',width:320,height:568,dpr:1,touch:true},
 {name:'phone',width:390,height:844,dpr:2,touch:true},
 {name:'landscape',width:844,height:390,dpr:2,touch:true},
 {name:'desktop',width:1280,height:800,dpr:1,touch:false},
]);
export const EIGHT_PLAYER_GROUPS=Object.freeze(EIGHT_PLAYER_VIEWPORTS.map(v=>v.name));
export const EIGHT_PAIR_KEYS=Object.freeze(['mika-willow','pip-starlit','willow-starlit']);
export const EIGHT_WEAR_KEYS=Object.freeze(['willow','starlit','basil','sage'].flatMap(id=>[`${id}:worn`,`${id}:broken`]));
export const EIGHT_REJECT_KEYS=Object.freeze(['reject:pip:worn','reject:pip:broken','reject:starlit:threshold']);
export function assertEightPlayerGroup(group=process.env.YARD_EIGHT_PLAYER_GROUP){if(!EIGHT_PLAYER_GROUPS.includes(group))throw Error('Choose one exact Yard eight-player viewport group');return group;}
export function fixtureKeysForGroup(group){assertEightPlayerGroup(group);return [...EIGHT_IDS,...EIGHT_PAIR_KEYS,...(group==='phone'?[...EIGHT_WEAR_KEYS,...EIGHT_REJECT_KEYS]:[])];}
export function expectedEightPlayerTitles(group){
 assertEightPlayerGroup(group);
 const titles=[...[...EIGHT_PAIR_KEYS,...EIGHT_IDS].map(key=>`${group} > actual native admission, atlas and pixels: ${key}`),`${group} > all 14 intent contracts through real controls or explicit unavailable affordances`];
 if(group==='phone'){
  for(const key of EIGHT_WEAR_KEYS){const [id,condition]=key.split(':');titles.push(`supported wear pixels on phone > ${id} ${condition}: real persisted source condition reaches renderer`);}
  for(const key of EIGHT_REJECT_KEYS)titles.push(`supported wear pixels on phone > ${key}: actual native rejection preserves serving, wear and balance`);
 }
 return titles;
}
export function verifyEightPlayerDiscovery(report,group){
 if(report.errors?.length)throw Error('Playwright could not load every assigned test');
 const actual=[];function visit(suites,parents=[]){for(const suite of suites||[]){const path=[...parents,suite.title];for(const spec of suite.specs||[]){if(spec.tests?.length!==1||spec.tests.some(t=>t.projectName!=='chromium'||(t.expectedStatus&&t.expectedStatus!=='passed')))throw Error('Only one runnable Chromium case may satisfy discovery');actual.push([...path,spec.title].slice(-2).join(' > '));}visit(suite.suites,path);}}
 visit(report.suites);const expected=expectedEightPlayerTitles(group);if(new Set(actual).size!==actual.length||JSON.stringify(actual.sort())!==JSON.stringify(expected.sort()))throw Error(`Incomplete/duplicate ${group} discovery: expected ${expected.length}, got ${actual.length}`);
 return {group,tests:actual.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]!=='--verify-list'||process.argv.length!==5)throw Error('Usage: yard-eight-player-groups.mjs --verify-list report.json group');
 console.log(JSON.stringify(verifyEightPlayerDiscovery(JSON.parse(readFileSync(process.argv[3],'utf8')),process.argv[4])));
}
