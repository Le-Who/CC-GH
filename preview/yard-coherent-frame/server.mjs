import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base='preview/yard-coherent-frame/',manifest=JSON.parse(await readFile(new URL('./payload-manifest.json',import.meta.url),'utf8'));
const allowed=new Map(manifest.files.map(row=>[row.path,row]));allowed.set(base+'payload-manifest.json',{});
for(const row of manifest.files){const bytes=await readFile(resolve(root,row.path));if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error(`Frozen probe input mismatch: ${row.path}`);}
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webp':'image/webp'};
const server=http.createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\//,'');if(path===''||path===base.slice(0,-1)){res.writeHead(302,{Location:'/'+base});res.end();return;}if(path===base)path=base+'index.html';
 if(!allowed.has(path)){res.writeHead(404);res.end();return;}
 const file=resolve(root,path);if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
 const bytes=await readFile(file),sha=createHash('sha256').update(bytes).digest('hex'),extension=path.slice(path.lastIndexOf('.'));
 res.writeHead(200,{'Content-Type':mime[extension]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-SHA256':sha,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:; object-src 'none'"});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){res.writeHead(500);res.end(String(error));}});
server.listen(Number(process.env.YARD_FRAME45_PORT||4318),'127.0.0.1',()=>console.log('Yard single coherent frame only; static source/media server ready'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
