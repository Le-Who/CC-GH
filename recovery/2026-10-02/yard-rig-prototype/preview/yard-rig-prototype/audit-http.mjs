import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const child=spawn(process.execPath,['preview/yard-rig-prototype/server.mjs'],{stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
const origin='http://127.0.0.1:4186';const rows=[];
try{
 let ready=false;for(let i=0;i<30;i++){try{const r=await fetch(origin);if(r.ok){ready=true;break;}}catch{}await delay(100);}if(!ready)throw new Error('Probe server did not become ready: '+stderr);
 const manifest=JSON.parse(fs.readFileSync('public/games/yard-v2-rig-prototype/rig-manifest.json','utf8'));
 for(const url of ['/','/app.js','/probe.css','/_rig/rig-motion.js','/games/yard-v2-rig-prototype/rig-manifest.json',manifest.stage.url,...Object.values(manifest.parts).map(x=>x.url)]){
  const r=await fetch(origin+url),bytes=new Uint8Array(await r.arrayBuffer());if(r.status!==200||bytes.length===0)throw new Error('HTTP failure '+url);rows.push({url,status:r.status,bytes:bytes.length,type:r.headers.get('content-type')});
 }
 for(const url of ['/raw-transfer/torso.b64','/recovered-image-manifest.json','/_rig/../../recovery-jobs.json']){const r=await fetch(origin+url);if(r.status!==404)throw new Error('Unexpected file exposure '+url);rows.push({url,status:r.status});}
 const denied=await fetch(origin+'/',{method:'POST'});if(denied.status!==405)throw new Error('POST must be rejected');
 const report={scope:'HTTP and local asset availability only; browser visual/touch QA NOT RUN',status:'PASS',rows,postStatus:denied.status,stdout};fs.writeFileSync('design/yard-v2/rig-proof/http-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,assets:rows.length,postStatus:denied.status}));
}finally{child.kill('SIGTERM');}
