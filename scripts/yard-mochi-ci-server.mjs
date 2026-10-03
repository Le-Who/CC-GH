/** CI-only read-only media fixture server. Not a local restriction workaround. */
import http from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,sep,extname} from 'node:path';import {fileURLToPath} from 'node:url';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw Error('Mochi browser validation runs only through the authorized CI workflow');
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),qa=resolve(root,'recovery-tools/yard-mochi-combined-qa'),sourceRoot=resolve(qa,'source');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webp':'image/webp','.png':'image/png'};
const allowedSource=p=>p.startsWith('game-logic/yard-v2/')||['game-logic/yard-catalog.js','game-logic/yard-playzones.js','src/games/companion-yard-v2/atlas.mjs','src/games/companion-yard-v2/projection.mjs'].includes(p);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');let base,relative;
  if(url.pathname.startsWith('/__mochi_qa__/')){base=qa;relative=decodeURIComponent(url.pathname.slice('/__mochi_qa__/'.length))||'index.html';}
  else if(url.pathname.startsWith('/__mochi_source__/')){base=sourceRoot;relative=decodeURIComponent(url.pathname.slice('/__mochi_source__/'.length));if(!allowedSource(relative)){res.writeHead(404).end();return;}}
  else{res.writeHead(404).end();return;}
  const path=resolve(base,relative);if(!path.startsWith(base+sep)||!mime[extname(path)]){res.writeHead(404).end();return;}
  const body=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)],'cache-control':'no-store'});res.end(body);
 }catch{res.writeHead(404).end();}
});
server.listen(Number(process.env.PLAYWRIGHT_MOCHI_PORT||3197),'127.0.0.1');for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
