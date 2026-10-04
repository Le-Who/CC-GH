/** Same-origin network switch/fault injection only. Never replaces app responses. */
import http from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {PRODUCTION_PORTS} from './yard-production-guard.mjs';
export async function setProxyState(path,value){await writeFile(path+'.next',JSON.stringify(value));await rename(path+'.next',path);}
export async function startProductionProxy({statePath,evidencePath,timeoutMs=15000}){
 let dropped=false,closing=false;const sockets=new Set(),requests=new Set();
 const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));return socket;};
 const own=request=>{requests.add(request);const deadline=setTimeout(()=>request.destroy(Error('Acceptance upstream deadline')),timeoutMs);request.once('close',()=>{clearTimeout(deadline);requests.delete(request);});request.once('upgrade',()=>clearTimeout(deadline));request.setTimeout(timeoutMs,()=>request.destroy(Error('Acceptance upstream timeout')));return request;};
 const server=http.createServer(async(req,res)=>{
  try{
   const state=JSON.parse(await readFile(statePath,'utf8'));
   if(closing||!['A','B'].includes(state.target))throw Error('Explicit A/B target required');
   const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>1024*1024)throw Error('Acceptance proxy body too large');chunks.push(chunk);}const body=Buffer.concat(chunks);
   let command;try{command=JSON.parse(body);}catch{}
   const isFault=state.dropCollect===true&&command?.action==='yard.collectGifts';
   if(isFault&&dropped){res.destroy();return;}
   const upstream=own(http.request({hostname:'127.0.0.1',port:PRODUCTION_PORTS[state.target],method:req.method,path:req.url,headers:req.headers},response=>{
    if(!isFault){res.writeHead(response.statusCode,response.headers);response.pipe(res);return;}
    dropped=true;const reply=[];response.on('data',chunk=>reply.push(chunk));response.on('end',()=>{
     void (async()=>{try{await writeFile(evidencePath,JSON.stringify({target:state.target,command,status:response.statusCode,body:JSON.parse(Buffer.concat(reply)),committedAt:Date.now()}));}catch(error){server.emit('acceptance-error',error);}finally{res.destroy();}})();
    });
   }));
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.once('close',()=>upstream.destroy());upstream.end(body);
  }catch(error){if(!res.headersSent)res.writeHead(503,{'content-type':'text/plain'});res.end(error.message);}
 });
 server.requestTimeout=timeoutMs;server.headersTimeout=timeoutMs;server.timeout=timeoutMs;
 server.on('connection',track);
 // Socket.IO websocket traffic uses the same selected production server.
 server.on('upgrade',async(req,socket,head)=>{
  try{const state=JSON.parse(await readFile(statePath,'utf8'));if(closing||!['A','B'].includes(state.target))throw Error('Bad proxy target');
   const upstream=own(http.request({hostname:'127.0.0.1',port:PRODUCTION_PORTS[state.target],path:req.url,headers:req.headers}));
   upstream.on('upgrade',(response,peer,upstreamHead)=>{if(closing){peer.destroy();socket.destroy();return;}track(peer);peer.setTimeout(0);socket.setTimeout(0);socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);if(head.length)peer.write(head);if(upstreamHead.length)socket.write(upstreamHead);socket.pipe(peer).pipe(socket);peer.on('error',()=>socket.destroy());socket.on('error',()=>peer.destroy());peer.once('close',()=>socket.destroy());socket.once('close',()=>peer.destroy());});
   upstream.on('error',()=>socket.destroy());socket.once('close',()=>upstream.destroy());upstream.end();
  }catch{socket.destroy();}
 });
 server.closeAcceptance=async()=>{
  closing=true;for(const request of requests)request.destroy();for(const socket of sockets)socket.destroy();
  await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('Acceptance proxy close exceeded 2000ms')),2000);server.close(error=>{clearTimeout(deadline);error?reject(error):resolve();});server.closeAllConnections();});
 };
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PRODUCTION_PORTS.origin,'127.0.0.1',resolve);});return server;
}
