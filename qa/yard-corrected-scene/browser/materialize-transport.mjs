/** QA transport only. The browser receives the original raster bytes at their
 * original URLs. Base64 payloads are never copied into the served dist tree. */
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(process.env.YARD_PREVIEW_REPO_ROOT||path.join(root,'../..'));
const sharp=createRequire(path.join(repo,'package.json'))('sharp');
const transport=JSON.parse(await fs.readFile(path.join(root,'RASTER-TRANSPORT.json'),'utf8'));
const allowlist=JSON.parse(await fs.readFile(path.join(root,'PUBLICATION-ALLOWLIST.json'),'utf8'));
const allowed=new Map(allowlist.files.filter(row=>row.kind==='raster').map(row=>[row.path,row]));
let restored=0;
for(const row of transport.files){
 const expected=allowed.get(row.path);
 if(!expected||expected.sha256!==row.sha256||expected.bytes!==row.bytes||!row.path.startsWith('public/')||row.path.includes('..')||
    row.payload!==`transport/${row.sha256}.base64`)throw Error('Unapproved transport destination');
 const text=await fs.readFile(path.join(root,row.payload),'utf8');
 if(!/^[A-Za-z0-9+/=]+\n?$/.test(text))throw Error('Invalid base64 transport');
 const bytes=Buffer.from(text.trim(),'base64');
 if(bytes.length!==expected.bytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Restored raster byte identity differs');
 const metadata=await sharp(bytes).metadata();
 if(metadata.width!==expected.canvas[0]||metadata.height!==expected.canvas[1])throw Error('Restored raster dimensions differ');
 const target=path.join(root,row.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);restored++;
}
console.log(JSON.stringify({restored,scope:'same approved raster bytes; QA transport only',browserBase64Owners:0}));
