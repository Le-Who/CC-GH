/** Pure path resolution, testable without opening a socket. */
import {resolve,sep,extname} from 'node:path';
export const PEBBLE_FIXTURE_MIME=Object.freeze({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png'});
export function resolvePebbleFixturePath({root,sourceRoot,publicRoot,pathname,allowedSources=new Set()}={}){
 try{
  root=resolve(root);let base,relative;
  if(pathname.startsWith('/__yard_qa__/')){base=root;relative=decodeURIComponent(pathname.slice('/__yard_qa__/'.length))||'index.html';if(!['index.html','preview.mjs','fixture.json'].includes(relative))return null;}
  else if(pathname.startsWith('/__yard_source__/')){base=resolve(sourceRoot||resolve(root,'source'));relative=decodeURIComponent(pathname.slice('/__yard_source__/'.length));if(!allowedSources.has(relative))return null;}
  else{const namespace=['yard-mika','yard-pebble'].find(id=>pathname.startsWith(`/assets/${id}/`));if(!namespace)return null;base=resolve(publicRoot||resolve(root,'public/assets'),namespace);relative=decodeURIComponent(pathname.slice(`/assets/${namespace}/`.length));}
  const path=resolve(base,relative),mime=PEBBLE_FIXTURE_MIME[extname(path)];
  return path.startsWith(base+sep)&&mime?{path,mime}:null;
 }catch{return null;}
}
