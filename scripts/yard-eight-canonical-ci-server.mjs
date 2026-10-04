/** Read-only, loopback-only authorized acceptance server with exact witness hashes. */
import http from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,sep,extname} from 'node:path';import {createHash} from 'node:crypto';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')throw Error('Canonical Yard acceptance requires authorized CI');
const project=resolve(import.meta.dirname,'..'),root=resolve(project,'recovery-tools/yard-canonical-eight-qa'),closure=JSON.parse(await readFile(resolve(root,'SOURCE-CLOSURE.json'),'utf8')),allowed=new Set(closure.files.map(f=>f.path));
for(const f of closure.files)if(createHash('sha256').update(await readFile(resolve(project,f.path))).digest('hex')!==f.sha256)throw Error(`Changed browser source: ${f.path}`);
const mediaClosure=JSON.parse(await readFile(resolve(root,'MEDIA-CLOSURE.json'),'utf8'));
const mediaPaths=new Map(mediaClosure.files.map(f=>[f.path,f.repositoryPath]));
for(const f of mediaClosure.files){const file=resolve(project,f.repositoryPath);if(!file.startsWith(project+sep))throw Error('Media closure escaped project');const bytes=await readFile(file);if(bytes.length!==f.bytes||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error(`Changed browser media: ${f.path}`);}
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webp':'image/webp'};
const nativeRuntime=process.env.YARD_NATIVE_GAMEPLAY_TEST==='1'?(await import('./yard-native-gameplay-runtime.mjs')).createNativeGameplayRuntime(JSON.parse(await readFile(resolve(root,'fixture.json'),'utf8'))):null;
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://127.0.0.1').pathname;if(nativeRuntime&&pathname.startsWith('/__yard_live__/'))return nativeRuntime(req,res);if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}let base,relative;
 if(pathname.startsWith('/__yard_qa__/')){base=root;relative=decodeURIComponent(pathname.slice(13))||'index.html';if(!['index.html','preview.mjs','fixture.json'].includes(relative)){res.writeHead(404).end();return;}}
 else if(pathname.startsWith('/__yard_source__/')){base=project;relative=decodeURIComponent(pathname.slice('/__yard_source__/'.length));if(!allowed.has(relative)){res.writeHead(404).end();return;}}
 else if(/^\/assets\/yard-(mika|mochi|pebble|pip|family|fox|turtles)\//.test(pathname)){base=project;relative=mediaPaths.get(decodeURIComponent(pathname.slice(1)));if(!relative){res.writeHead(404).end();return;}}
 else{res.writeHead(404).end();return;}const path=resolve(base,relative);if(!path.startsWith(base+sep)||!mime[extname(path)]){res.writeHead(404).end();return;}const data=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)],'cache-control':'no-store'}).end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404).end();}});
server.listen(Number(process.env.PLAYWRIGHT_YARD_EIGHT_PORT||3204),'127.0.0.1');for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>server.close(()=>process.exit(0)));
