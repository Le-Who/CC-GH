import {createServer} from 'node:http';
import {createResourceGate} from './resourceGate.mjs';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,extname,sep,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {Server as SocketServer} from 'socket.io';
import {createDefaultPlayer,createGardenEconomyState} from '../../../game-logic.js';
import {buildSnapshot,applyActionWithReceipt} from '../../../routes/player.js';
import {migrateGardenR2} from '../../../game-logic/garden-r2/domain.js';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(import.meta.url);
const {generateSW}=createRequire(require.resolve('vite-plugin-pwa'))('workbox-build');

export async function startSwFixture({gameActions=false,gardenMode='r2'}={}){
  const temporary=await mkdtemp(resolve(tmpdir(),'ccgh-sw-proof-'));
  const dist=resolve(root,'dist');
  const productionWorker=await readFile(resolve(dist,'sw.js'),'utf8');
  await generateSW({swDest:resolve(temporary,'legacy-sw.js'),globDirectory:dist,globPatterns:[],navigateFallback:null,skipWaiting:true,clientsClaim:true,mode:'production',runtimeCaching:[{
    urlPattern:/\/api\/(?!config)/,handler:'NetworkFirst',method:'GET',options:{cacheName:'api-get-cache',networkTimeoutSeconds:5,expiration:{maxEntries:50,maxAgeSeconds:300},cacheableResponse:{statuses:[0,200]}},
  }]});
  // Bundle real Hub/API/cache-maintenance code. No store or HTTP client adapter.
  const packages={
    zustand:require.resolve('zustand/vanilla').replace(/vanilla\.js$/,'esm/index.mjs'),
    'zustand/vanilla':require.resolve('zustand/vanilla').replace(/vanilla\.js$/,'esm/vanilla.mjs'),
    'zustand/react':require.resolve('zustand/vanilla').replace(/vanilla\.js$/,'esm/react.mjs'),
    react:require.resolve('react'),
    'idb-keyval':require.resolve('idb-keyval').replace(/dist[\\/]index\.cjs$/,'dist/index.js'),
  };
  await build({absWorkingDir:root,stdin:{contents:`import {useGameHub} from './src/game-state/useGameHub.js';import {api} from './src/services/apiClient.js';import {installPrivateApiCacheCleanup} from './src/services/privateApiCache.js';window.swProof={hub:useGameHub,api,installCleanup:installPrivateApiCacheCleanup};`,sourcefile:'sw-proof-entry.js',resolveDir:root},bundle:true,format:'esm',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},tsconfigRaw:{},outfile:resolve(temporary,'harness.js'),plugins:[{name:'readable-fs',setup(b){
    b.onResolve({filter:/.*/},args=>{
      if(args.path==='@telegram-apps/sdk')return {path:args.path,external:true};
      const candidate=packages[args.path]||resolve(args.importer?dirname(args.importer):root,args.path);
      const file=[candidate,candidate+'.js',candidate+'.jsx',candidate+'.mjs',resolve(candidate,'index.js')].find(existsSync);
      if(!file)throw Error(`Unresolved SW proof import: ${args.path}`);
      return {path:file,namespace:'proof-fs'};
    });
    b.onLoad({filter:/.*/,namespace:'proof-fs'},args=>({contents:readFileSync(args.path,'utf8'),loader:extname(args.path)==='.jsx'?'jsx':'js'}));
  }}]});
  let apiFailure=false,delayA=0,delayB=0,httpFresh=false;
  const requests=[],delayedResponses=[],timers=new Set(),players=new Map();
  const resourceGate=createResourceGate(),artRequests=[];
  function currentPlayer(account){
    if(gameActions&&players.has(account))return players.get(account);
    let player=createDefaultPlayer(account,account==='account-a'?'Fixture A':'Fixture B');
    player.resources.gold=account==='account-a'?123456:789;
    if(gameActions){
      const now=Date.now();player.garden={...createGardenEconomyState(now),plants:[{id:'split-saved-daisy',type:'daisy',level:1,phase:3,phaseProgress:0,shelfIndex:0,spotIndex:0,lastTapped:0}],shelvesUnlocked:1};
      if(gardenMode==='r2')player=migrateGardenR2(player,{now,legacyRevision:0,acknowledgedTotal:0});
      players.set(account,player);
    }
    return player;
  }
  function snapshot(account){
    const player=currentPlayer(account);
    return {...buildSnapshot(player),...(gameActions?{gardenR2Available:gardenMode==='r2'}:{}),privateMarker:`private-${account}`};
  }
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture.invalid');
    if (/^\/(?:games|assets-runtime)\//.test(url.pathname)) artRequests.push(url.pathname);
    await resourceGate.wait(url.pathname);
    if(url.pathname.startsWith('/api/')){
      const auth=req.headers.authorization||'',account=auth.endsWith('fixture-b')?'account-b':'account-a';
      const record={path:url.pathname,query:url.search,auth,account};requests.push(record);
      if(url.pathname==='/api/config'){
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify({buildId:'sw-proof',devAuthEnabled:true}));
      }
      if(apiFailure)return req.socket.destroy();
      if(req.method!=='GET'){
        if(gameActions&&url.pathname==='/api/player/mutate'){
          const chunks=[];for await(const chunk of req)chunks.push(chunk);
          const body=JSON.parse(Buffer.concat(chunks).toString());record.body=body;
          const player=currentPlayer(account);
          const result=await applyActionWithReceipt(player,body.action,body.payload||{},{clientActionId:body.clientActionId,gardenR2Enabled:gardenMode==='r2'});
          if(!result.body.error)player._syncSeq=(player._syncSeq||0)+1;
          if(result.body.snapshot){result.body.snapshot.player.syncSeq=player._syncSeq||0;result.body.snapshot.gardenR2Available=gardenMode==='r2';}
          res.statusCode=result.status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(result.body));
        }
        res.statusCode=409;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error:'SYNTHETIC_MUTATION_DISABLED'}));
      }
      const requestDelay=account==='account-a'?delayA:delayB;
      const answer=()=>{
        res.setHeader('Content-Type','application/json');res.setHeader('Vary','Origin');
        res.setHeader('Cache-Control',httpFresh?'private, max-age=300':'no-store');
        const body=snapshot(account);
        res.end(JSON.stringify(url.pathname==='/api/resources/state'?{resources:body.resources,privateMarker:body.privateMarker}:body));
        if(requestDelay)delayedResponses.push({account,delayMs:requestDelay,at:Date.now()});
      };
      if(requestDelay){const timer=setTimeout(()=>{timers.delete(timer);answer();},requestDelay);timers.add(timer);return;}
      return answer();
    }
    if(url.pathname==='/sw-proof.html'){
      res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');return res.end(`<!doctype html><title>SW privacy proof</title><script>window.Telegram={WebApp:{initData:'fixture-${url.searchParams.get('account')==='b'?'b':'a'}'}};</script><script type="module" src="/harness.js"></script>`);
    }
    let file;
    if(url.pathname==='/'||url.pathname==='/index.html'){
      const html=(await readFile(resolve(dist,'index.html'),'utf8')).replace('<!--APP_VERSION_INJECT-->','<script>window.__APP_BUILD_ID__="sw-proof";window.__APP_VERSION__="proof";</script>');
      res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');return res.end(html);
    }
    const local=resolve(temporary,'.'+url.pathname);
    const built=resolve(dist,'.'+url.pathname);
    if(local.startsWith(temporary+sep)&&existsSync(local))file=local;
    else if(built.startsWith(dist+sep)&&existsSync(built))file=built;
    if(!file){res.statusCode=404;return res.end('missing');}
    const types={'.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
    res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
  });
  // Real Socket.IO handshake keeps production connection status meaningful.
  // All identities and state stay inside this ephemeral localhost fixture.
  const realtime=new SocketServer(server,{serveClient:false});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  return {
    origin:`http://127.0.0.1:${server.address().port}`,productionWorker,dist,requests,delayedResponses,artRequests,
    holdResources:resourceGate.hold,holdArtResources:resourceGate.holdArt,releaseResources:resourceGate.release,pendingResources:resourceGate.pending,
    player:currentPlayer,
    // Test-only delivery of an authoritative fixture payload through the real socket client.
    emitPlayerSync(payload){realtime.emit('player_sync',{seq:payload.syncSeq||payload.player?.syncSeq||0,payload});},
    realtimeConnections(){return realtime.engine.clientsCount;},
    failApi(value=true){apiFailure=value;},delayAccountA(ms){delayA=ms;},delayAccountB(ms){delayB=ms;},freshHttpCache(value=true){httpFresh=value;},
    async close(){resourceGate.release();for(const timer of timers)clearTimeout(timer);await new Promise(done=>realtime.close(done));server.closeAllConnections();if(server.listening)await new Promise(done=>server.close(done));const base=resolve(tmpdir());if(!temporary.startsWith(base+sep)||!basename(temporary).startsWith('ccgh-sw-proof-'))throw Error('Unsafe fixture cleanup path');await rm(temporary,{recursive:true,force:true});},
  };
}

export async function registerWorker(page,path){
  await page.evaluate(async path=>{await navigator.serviceWorker.register(path,{scope:'/'});await navigator.serviceWorker.ready;},path);
  await page.waitForFunction(path=>navigator.serviceWorker.controller?.scriptURL.endsWith(path),path);
}
export async function rawSnapshot(page,auth='fixture-a'){
  return page.evaluate(async auth=>{try{const r=await fetch('/api/player/snapshot',{headers:{Authorization:`tma ${auth}`}});return {status:r.status,body:await r.json()};}catch(e){return {error:e.name};}},auth);
}
export async function legacyCache(page){
  return page.evaluate(async()=>{
    if(!(await caches.keys()).includes('api-get-cache'))return null;
    const cache=await caches.open('api-get-cache');const r=await cache.match('/api/player/snapshot');return r?await r.json():null;
  });
}
export async function legacyCacheRows(page){
  return page.evaluate(async()=>{
    if(!(await caches.keys()).includes('api-get-cache'))return [];
    const cache=await caches.open('api-get-cache');return Promise.all((await cache.keys()).map(async key=>({url:key.url,authorization:key.headers.get('authorization'),body:await(await cache.match(key)).json()})));
  });
}

