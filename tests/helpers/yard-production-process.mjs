/** Bounded process group ownership for the disposable acceptance runner. */
import {spawn} from 'node:child_process';
export function runBoundedCommand(command,args,{timeoutMs=60000,signal,inherit=false,maxBuffer=8*1024*1024,env=process.env}={}){
 if(signal?.aborted)return Promise.reject(signal.reason||Error('Acceptance interrupted'));
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{env,detached:true,stdio:inherit?'inherit':['ignore','pipe','pipe']});
  const stdout=[],stderr=[];let bytes=0,reason=null,settled=false,escalation,stopLimit;
  const kill=signal=>{if(!child.pid)return;try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')reason??=error;}};
  const finish=(error,value)=>{
   if(settled)return;settled=true;clearTimeout(deadline);clearTimeout(escalation);clearTimeout(stopLimit);signal?.removeEventListener('abort',abort);
   // An exited wrapper must not leave its browser/npm grandchildren running.
   kill('SIGKILL');error?reject(error):resolve(value);
  };
  const stop=error=>{
   if(reason||settled)return;reason=error;kill('SIGTERM');
   escalation=setTimeout(()=>kill('SIGKILL'),1000);
   stopLimit=setTimeout(()=>{kill('SIGKILL');finish(reason);},3000);
  };
  const abort=()=>stop(signal.reason||Error('Acceptance interrupted'));
  const deadline=setTimeout(()=>stop(Error(`${command} exceeded ${timeoutMs}ms deadline`)),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  for(const [stream,chunks]of [[child.stdout,stdout],[child.stderr,stderr]])stream?.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBuffer)stop(Error(`${command} exceeded output limit`));else chunks.push(chunk);});
  child.once('error',error=>finish(error));
  child.once('close',(code,killedBy)=>{
   const value={code,stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()};
   finish(reason||(code!==0?Error(`${command} failed (${code??killedBy}): ${value.stderr.slice(-4000)}`):null),value);
  });
  if(signal?.aborted)abort();
 });
}
