/** Dedicated source-fixture server for approved CI, never a production route. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fixtureFilePath} from './yard-pip-fixture-path.mjs';
const root=path.resolve(fileURLToPath(new URL('../recovery-tools/yard-pip-snack-qa/',import.meta.url))),port=Number(process.env.PLAYWRIGHT_PIP_PORT||3199),prefix='/__pip_qa__/';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(pathname==='/'||pathname==='/__pip_qa__'){res.writeHead(302,{Location:prefix+'index.html'});res.end();return;}if(!pathname.startsWith(prefix)){res.writeHead(404);res.end('Fixture only');return;}let target=fixtureFilePath(root,pathname.slice(prefix.length)||'index.html');if(target===null){res.writeHead(403);res.end('Out of fixture scope');return;}if((await stat(target)).isDirectory())target=path.join(target,'index.html');const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Fixture file missing');}});
server.listen(port,'127.0.0.1',()=>console.log(`Pip source QA: http://127.0.0.1:${port}${prefix}index.html`));
for(const signal of['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
