/** Re-export the exact recovered source. No generation, install, serving or upscaling. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [sourceFile,outputDirectory]=process.argv.slice(2);
if(!sourceFile||!outputDirectory)throw Error('Pass the recovered source PNG and an output directory');
const bytes=await readFile(sourceFile),sourceSha256=createHash('sha256').update(bytes).digest('hex');
if(sourceSha256!=='a815909b5cca92e8d78aca15b5fe2b2403af5f1700a002bafc7f0f7345ccf2e8')throw Error('Wrong original wood strip');
const crop=[26,156,2145,530],cropped=await sharp(bytes).extract({left:crop[0],top:crop[1],width:crop[2]-crop[0],height:crop[3]-crop[1]}).png().toBuffer();
const sx=[0,180,1939,2119],sy=[0,144,230,374],dx=[0,80,1728,1808],dy=[0,64,150,214],patches=[],receipts=[];
for(let row=0;row<3;row++)for(let col=0;col<3;col++){
 const width=dx[col+1]-dx[col],height=dy[row+1]-dy[row],sourceWidth=sx[col+1]-sx[col],sourceHeight=sy[row+1]-sy[row];
 if(width>sourceWidth||height>sourceHeight)throw Error('Source pixels must not be enlarged');
 patches.push({input:await sharp(cropped).extract({left:sx[col],top:sy[row],width:sourceWidth,height:sourceHeight}).resize(width,height,{fit:'fill',kernel:'lanczos3'}).png().toBuffer(),left:dx[col],top:dy[row]});
 receipts.push({row,col,source_rect_in_cropped_pixels:[sx[col],sy[row],sx[col+1],sy[row+1]],output_rect:[dx[col],dy[row],dx[col+1],dy[row+1]],scale_x:width/sourceWidth,scale_y:height/sourceHeight,uniform_corner:(row!==1&&col!==1)?Math.abs(width/sourceWidth-height/sourceHeight)<1e-9:false});
}
const result=await sharp({create:{width:1808,height:214,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(patches).webp({quality:90,alphaQuality:100,effort:6}).toBuffer();
const outputHash=createHash('sha256').update(result).digest('hex'),outputName=`yard-ui-wood-strip-${outputHash.slice(0,12)}.webp`;
await mkdir(outputDirectory,{recursive:true});await writeFile(path.join(outputDirectory,outputName),result);
await writeFile(path.join(outputDirectory,'header-export-receipt.json'),JSON.stringify({source:'11-wood-strip-source.png',source_sha256:sourceSha256,source_size:[2172,724],crop,source_insets:[144,180,144,180],size:[1808,214],insets:[64,80,64,80],safe:[100,68,1708,146],css_border_width:[16,20,16,20],codec:{format:'webp',quality:90,alphaQuality:100,effort:6},file:outputName,output_sha256:outputHash,bytes:result.length,decoded_rgba_bytes:1808*214*4,patch_receipts:receipts},null,2)+'\n');
console.log(JSON.stringify({bytes:result.length,decodedBytes:1808*214*4,sourceSha256}));
