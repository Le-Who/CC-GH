/** Artifact completeness is independent of the browser's claimed metadata. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const REQUIRED_ORIGINALS=Object.freeze([
 'source.json','reused.json','source.tap','builds.json','food-builds.json','food-paths.json','browser.json','food-encoded-video.json',
 'food-interactions-native.webm','food-observed-motion.json','food-state-composition-reference-390x844-dpr2.webp',
 'food-state-empty-390x844-dpr2-native.png','food-state-kibble-390x844-dpr2-native.png','food-state-berry_plate-390x844-dpr2-native.png','food-state-bonito_bowl-390x844-dpr2-native.png',
 'hud-390x844-dpr2-ru-header-native.png','hud-390x844-dpr2-ru-dialog-native.png',
 'food-reserved-union-invalid-placement.webp',
 ...[[320,568],[390,844],[568,320]].flatMap(([w,h])=>['stage','food-reason','decor-escape'].map(s=>`food-occupied-${w}x${h}-ru-${s}.webp`)),
 ...[[320,568],[390,844],[568,320]].map(([w,h])=>`food-retained-${w}x${h}-ru-rejection.webp`),
]);
export async function verifyRequiredEvidence(rawDir,browser={}){
 const files=[],issues=[],captures=Array.isArray(browser.captures)?browser.captures:[],states=Array.isArray(browser.food?.nativeStateCaptures)?browser.food.nativeStateCaptures:[];if(browser.captures&&!Array.isArray(browser.captures)||browser.food?.nativeStateCaptures&&!Array.isArray(browser.food.nativeStateCaptures))issues.push({path:'browser.json',error:'Malformed capture manifest'});
 const names=[...new Set([...REQUIRED_ORIGINALS,...captures,...states.map(row=>row?.file)])].sort();
 for(const name of names){
  try{assert(/^[A-Za-z0-9_.-]+$/.test(name)&&!['.','..'].includes(name),'Unsafe evidence name');const target=path.join(rawDir,name),stat=await fs.lstat(target);assert(stat.isFile()&&!stat.isSymbolicLink(),'Original must be a regular file');assert(stat.size>0,'Original is empty');const bytes=await fs.readFile(target);files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  catch(error){issues.push({path:name,error:error.code??String(error.message)});}
 }
 return {complete:issues.length===0,requiredOriginals:names.length,verifiedOriginals:files.length,files,issues};
}

/** Preserve malformed originals; their metadata cannot establish acceptance. */
export async function readEvidenceJSON(rawDir,name){
 try{const value=JSON.parse(await fs.readFile(path.join(rawDir,name),'utf8'));assert(value&&typeof value==='object'&&!Array.isArray(value),'Expected an evidence object');return value;}
 catch(error){return {missingOrInvalid:true,error:String(error.message)};}
}
