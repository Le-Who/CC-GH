import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const here=path.dirname(fileURLToPath(import.meta.url));
export const sourceRoot=process.env.YARD_SOURCE_ROOT||path.resolve(here,'../..');
export const assetRoot=process.env.YARD_ASSET_ROOT||sourceRoot;
export const overlayRoots=process.env.YARD_OVERLAY_ROOTS?.split(path.delimiter).filter(Boolean)||[];
export const roots=[...overlayRoots,sourceRoot,assetRoot];
export const pip='src/games/companion-yard-v2/pip-prototype/';
export function resolveSource(relative){
 if(relative.startsWith('/')||relative.split('/').includes('..'))throw Error('Invalid relative source path');
 for(const root of roots){const file=path.join(root,relative);if(existsSync(file))return file;}
 throw Error('Missing source: '+relative);
}
