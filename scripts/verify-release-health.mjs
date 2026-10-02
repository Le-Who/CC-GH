import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function verifyReleaseHealth(payload,expectedBuild){
 if(typeof expectedBuild!=='string'||! /^[0-9a-f]{40}$/i.test(expectedBuild))throw Error('Expected full commit SHA is required');
 if(!payload||payload.status!=='ok')throw Error('Application health is not ok');
 if(payload.buildId!==expectedBuild)throw Error('Running build does not match requested release');
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{verifyReleaseHealth(JSON.parse(readFileSync(0,'utf8')),process.argv[2]);console.log('Expected release is healthy');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
