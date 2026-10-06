/** One reusable worker, one in-flight admission, at most one latest queued job. */
export function createCanonicalPlannerWorker({workerFactory=()=>new Worker(new URL('./dynamic-prop-worker.mjs',import.meta.url),{type:'module'})}={}){
 const worker=workerFactory();let serial=0,current=null,queued=null,disposed=false,failed=false;
 const send=job=>{current=job;worker.postMessage({id:job.id,args:job.args});};
 worker.onmessage=event=>{if(!current||event.data.id!==current.id)return;current.resolve(event.data.result);current=null;if(queued){const next=queued;queued=null;send(next);}};
 worker.onerror=()=>{failed=true;current?.resolve({ok:false,code:'PLANNER_WORKER_FAILED'});queued?.resolve({ok:false,code:'PLANNER_WORKER_FAILED'});current=null;queued=null;};
 return {plan:args=>new Promise(resolve=>{if(disposed||failed){resolve({ok:false,code:disposed?'PLANNER_DISPOSED':'PLANNER_WORKER_FAILED'});return;}if(JSON.stringify(args).length>32768){resolve({ok:false,code:'PLANNER_INPUT_LIMIT'});return;}const job={id:++serial,args,resolve};if(current){queued?.resolve({ok:false,code:'PLANNER_SUPERSEDED'});queued=job;}else send(job);}),dispose(){if(disposed)return;disposed=true;worker.terminate();current?.resolve({ok:false,code:'PLANNER_DISPOSED'});queued?.resolve({ok:false,code:'PLANNER_DISPOSED'});current=null;queued=null;}};
}
