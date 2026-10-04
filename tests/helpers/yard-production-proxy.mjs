/** Same-origin network switch/fault injection only. Never replaces app responses. */
import http from 'node:http';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {PRODUCTION_PORTS} from './yard-production-guard.mjs';
const CAPTURE_LIMIT=4*1024*1024;
const captureError=code=>Object.assign(Error(code),{code});
/** Decode evidence only; ordinary proxied response headers/bytes stay untouched. */
export function decodeCapturedJson(bytes,encoding='identity'){
 if(bytes.length>CAPTURE_LIMIT)throw captureError('CAPTURE_WIRE_TOO_LARGE');
 const type=String(encoding||'identity').trim().toLowerCase(),decode=type==='gzip'?gunzipSync:type==='deflate'?inflateSync:type==='br'?brotliDecompressSync:null;
 if(type!=='identity'&&!decode)throw captureError('UNSUPPORTED_CAPTURE_ENCODING');
 const decoded=decode?decode(bytes,{maxOutputLength:CAPTURE_LIMIT}):bytes;
 try{return JSON.parse(decoded.toString('utf8'));}catch{throw captureError('INVALID_CAPTURE_JSON');}
}
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
    dropped=true;const reply=[];let wireBytes=0,finished=false;const contentEncoding=response.headers['content-encoding']||'identity';
    const capture=async(error)=>{
     if(finished)return;finished=true;let body;
     if(!error)try{body=decodeCapturedJson(Buffer.concat(reply),contentEncoding);}catch(cause){error=cause;}
     const evidence={target:state.target,command,contentEncoding,wireBytes,committedAt:Date.now(),
      ...(error?{status:0,upstreamStatus:response.statusCode,captureError:String(error.code||'CAPTURE_FAILED')}:{status:response.statusCode,body})};
     try{await writeFile(evidencePath,JSON.stringify(evidence));}catch(cause){server.emit('acceptance-error',cause);}finally{res.destroy();}
    };
    response.on('data',chunk=>{wireBytes+=chunk.length;if(wireBytes>CAPTURE_LIMIT){void capture(captureError('CAPTURE_WIRE_TOO_LARGE'));response.destroy();}else reply.push(chunk);});
    response.on('end',()=>void capture());response.on('error',error=>void capture(error));response.on('aborted',()=>void capture(captureError('CAPTURE_ABORTED')));
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
