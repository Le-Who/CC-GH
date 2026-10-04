/** Authorized CI only. Read-only self-contained shared-scene acceptance files. */
import http from 'node:http';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {resolvePebbleFixturePath} from './yard-pebble-fixture-path.mjs';
import {fileURLToPath} from 'node:url';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw Error('Canonical Yard browser validation requires the authorized CI workflow');
const project=resolve(fileURLToPath(new URL('..',import.meta.url))),root=resolve(project,'recovery-tools/yard-canonical-pebble-qa');
const closure=JSON.parse(await readFile(resolve(root,'SOURCE-CLOSURE.json'),'utf8')),allowed=new Set(closure.files.map(f=>f.path));
for(const f of closure.files){const bytes=await readFile(resolve(project,f.path));if(createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error(`Changed canonical source: ${f.path}; regenerate fixture closure`);}
const server=http.createServer(async(req,res)=>{try{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const pathname=new URL(req.url,'http://127.0.0.1').pathname,target=resolvePebbleFixturePath({root,sourceRoot:project,publicRoot:resolve(project,'public/assets'),pathname,allowedSources:allowed});if(!target){res.writeHead(404).end();return;}
 const data=await readFile(target.path);res.writeHead(200,{'content-type':target.mime,'cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404).end();}});
server.listen(Number(process.env.PLAYWRIGHT_YARD_PEBBLE_PORT||3197),'127.0.0.1');for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
