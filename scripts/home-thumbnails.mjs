import sharp from 'sharp';
import {mkdir,writeFile,stat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sources={garden:'games/garden-v2/background.webp',blox:'games/blox-v2/background.webp',match3:'games/match3-v2/library-background-landscape.webp',merge:'games/merge-lab-v3/background.webp',bubbo:'games/bubbo-v2/background.webp',trivia:'games/trivia-v2/background.webp',room:'assets/yard-mika/background.webp',settlement:'games/settlement/map-region-settlement-playable.webp'};
await mkdir('public/games/home-thumbnails',{recursive:true});
const files=[];
for(const [id,source] of Object.entries(sources)){
 const path=`public/games/home-thumbnails/${id}.webp`;
 const overlays=[];
 if(id==='blox'){
  const cells=[['cyan',0,0],['cyan',1,0],['cyan',1,1],['cyan',2,1],['gold',4,0],['gold',4,1],['gold',5,1],['magenta',0,3],['magenta',1,3],['magenta',2,3],['violet',4,3],['violet',5,3],['violet',5,2]];
  for(const [color,x,y] of cells)overlays.push({source:`games/blox-v2/tiles/${color}.webp`,left:43+x*27,top:19+y*27,size:25});
 }
 if(id==='garden')for(const [name,left] of [['basil-mature-r1',25],['daisy-mature-r2',93],['bonsai-mature-r1',163]])overlays.push({source:`games/garden-living/${name}.webp`,left,top:37,size:74});
 if(id==='merge')for(const [name,left,size] of [['light',37,64],['glass',105,54],['firefly',165,58]])overlays.push({source:`games/merge-lab-v3/items/${name}.webp`,left,top:43,size});
 const composites=[];
 for(const overlay of overlays)composites.push({input:await sharp(`public/${overlay.source}`).resize(overlay.size,overlay.size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).toBuffer(),left:overlay.left,top:overlay.top});
 await sharp(`public/${source}`).resize(256,144,{fit:'cover'}).composite(composites).webp({quality:72}).toFile(path);
 const sourceFiles=[...new Set([source,...overlays.map(item=>item.source)])];
 const hashes=await Promise.all(sourceFiles.map(async file=>({source:file,sha256:createHash('sha256').update(await readFile(`public/${file}`)).digest('hex')})));
 files.push({id,source,path,sourceFiles:hashes,bytes:(await stat(path)).size,width:256,height:144});
}
await writeFile('public/games/home-thumbnails/manifest.json',JSON.stringify({files,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0)},null,2)+'\n');
console.log(files);
