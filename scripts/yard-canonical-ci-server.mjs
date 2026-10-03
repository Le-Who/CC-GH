/** Authorized CI only. Read-only self-contained shared-scene acceptance files. */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw Error('Canonical Yard browser validation requires the authorized CI workflow');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)),'recovery-tools/yard-canonical-mochi-qa');
const closure=JSON.parse(await readFile(resolve(root,'SOURCE-CLOSURE.json'),'utf8')),allowed=new Set(closure.files.map(f=>f.path));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;let base,relative;
 if(pathname.startsWith('/__yard_qa__/')){base=root;relative=decodeURIComponent(pathname.slice('/__yard_qa__/'.length))||'index.html';if(!['index.html','preview.mjs','fixture.json'].includes(relative)){res.writeHead(404).end();return;}}
 else if(pathname.startsWith('/__yard_source__/')){base=resolve(root,'source');relative=decodeURIComponent(pathname.slice('/__yard_source__/'.length));if(!allowed.has(relative)){res.writeHead(404).end();return;}}
 else if(pathname.startsWith('/assets/yard-mika/')||pathname.startsWith('/assets/yard-mochi/')){base=resolve(root,'public');relative=decodeURIComponent(pathname.slice(1));}
 else{res.writeHead(404).end();return;}
 const path=resolve(base,relative);if(!path.startsWith(base+sep)||!mime[extname(path)]){res.writeHead(404).end();return;}
 const data=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)],'cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404).end();}});
server.listen(Number(process.env.PLAYWRIGHT_YARD_CANONICAL_PORT||3198),'127.0.0.1');for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
