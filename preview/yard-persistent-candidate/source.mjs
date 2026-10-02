import {readFile,readFileSync} from 'node:fs';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {relative,resolve} from 'node:path';
import {requireCandidateMode} from './guard.mjs';
requireCandidateMode();
export const candidateRoot = fileURLToPath(new URL('./',import.meta.url));
export const repositoryRoot = fileURLToPath(new URL('../../',import.meta.url));
export const overlayMap = JSON.parse(readFileSync(new URL('./overlay-map.json',import.meta.url),'utf8'));
export function candidateSourcePath(original) {
  const path=original instanceof URL ? fileURLToPath(original) : String(original).startsWith('file:') ? fileURLToPath(original) : resolve(original);
  const key=relative(repositoryRoot,path).split('\\').join('/');
  return Object.hasOwn(overlayMap,key) ? resolve(candidateRoot,overlayMap[key]) : path;
}
/** Explicit static-source lookup: callers opt into candidate bytes. Native fs is untouched. */
export async function readCandidateSource(original,encoding='utf8') {
  return promisify(readFile)(candidateSourcePath(original),encoding);
}
export const originalUrlFor = relativePath => pathToFileURL(resolve(repositoryRoot,relativePath)).href;
