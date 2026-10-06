import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const REPORT_RESERVE_BYTES = 128 * 1024;
const digest = text => createHash('sha256').update(text).digest('hex');
export function utf8Prefix(value, limit) {
  let result='',bytes=0;
  for(const codePoint of String(value)){const n=Buffer.byteLength(codePoint);if(bytes+n>limit)break;result+=codePoint;bytes+=n;}
  return result;
}
function eventValue(value, maxBytes) {
  const raw=JSON.stringify(value);
  if(Buffer.byteLength(raw)<=maxBytes)return value;
  const item = {type:utf8Prefix(value?.type??'diagnostic',80),message:utf8Prefix(value?.message??value?.text??raw,maxBytes-400),
    detailOmitted:true,originalUTF8Bytes:Buffer.byteLength(raw),sha256:digest(raw)};
  while(Buffer.byteLength(JSON.stringify(item))>maxBytes)item.message=utf8Prefix(item.message,Math.floor(Buffer.byteLength(item.message)/2));
  return item;
}
export function installBoundedDiagnostics(report) {
  report.diagnosticLimits={};
  for(const[name,maxEvents,maxBytes]of[['errors',48,24*1024],['console',24,8*1024]]){
    const entries=[],state=report.diagnosticLimits[name]={maxEvents,maxUTF8Bytes:maxBytes,seen:0,errorEventsSeen:0,omitted:0,retainedUTF8Bytes:0};
    Object.defineProperty(entries,'push',{value:(...values)=>{
      for(const value of values){
        state.seen++;if(value?.type==='error')state.errorEventsSeen++;const item=eventValue(value,2304),bytes=Buffer.byteLength(JSON.stringify(item));
        if(name==='errors'&&value?.type==='fatal'&&!report.firstFatal)report.firstFatal=eventValue(value,4096);
        if(entries.length>=maxEvents||state.retainedUTF8Bytes+bytes>maxBytes){state.omitted++;continue;}
        state.retainedUTF8Bytes+=bytes;Array.prototype.push.call(entries,item);
      }
      return entries.length;
    }});
    const old=report[name]??[];report[name]=entries;entries.push(...old);
  }
  return report;
}
export function serializeBoundedReport(report, maxBytes=REPORT_RESERVE_BYTES) {
  assert(Number.isSafeInteger(maxBytes)&&maxBytes>=16384&&maxBytes<=REPORT_RESERVE_BYTES);
  const full=JSON.stringify(report,null,2)+'\n',fullBytes=Buffer.byteLength(full);
  if(fullBytes<=maxBytes)return{bytes:Buffer.from(full),reduced:false};
  // Never write an oversized file and hope the post-write walk catches it.
  const reduced={format:report.format,status:'FAILED_OR_INCOMPLETE',limits:report.limits,phases:report.phases,
    visualAcceptance:'NOT_ESTABLISHED_EVIDENCE_TRUNCATED',releaseAcceptance:false,productionActivation:false,
    firstFatal:report.firstFatal??{type:'evidence-budget',message:'Report exceeded bounded metadata allowance'},
    diagnosticLimits:report.diagnosticLimits,errors:report.errors,console:report.console,captures:report.captures,
    omittedDetail:{originalUTF8Bytes:fullBytes,sha256:digest(full),fields:Object.keys(report).filter(k=>!['format','status','limits','phases','firstFatal','diagnosticLimits','errors','console','captures'].includes(k))}};
  let bytes=Buffer.from(JSON.stringify(reduced,null,2)+'\n');
  if(bytes.length>maxBytes){
    reduced.omittedDetail.retainedErrorEntriesOmitted=reduced.errors?.length??0;
    reduced.omittedDetail.retainedConsoleEntriesOmitted=reduced.console?.length??0;
    reduced.errors=[];reduced.console=[];bytes=Buffer.from(JSON.stringify(reduced,null,2)+'\n');
  }
  assert(bytes.length<=maxBytes,'Bounded report metadata schema unexpectedly exceeded its allowance');
  return{bytes,reduced:true};
}
