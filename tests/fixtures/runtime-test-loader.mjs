export async function load(url,context,next){
 const result=await next(url,context);
 const declarations={
 'canonical-runtime.mjs':'export const CANONICAL_RUNTIME_ENABLED=false;',
 'canonical-visit-reconciliation.mjs':'export const CANONICAL_RECONCILIATION_ENABLED=false;',
 'canonical-visit-transaction.mjs':'export const CANONICAL_VISIT_ADMISSION_ENABLED=false;',
 };
 for(const [file,needle] of Object.entries(declarations))if(url.endsWith('/game-logic/yard-v2/'+file)){
  const source=String(result.source);if(process.env.NODE_ENV!=='test'||source.split(needle).length!==2)throw Error('TEST_GATE_SOURCE_DRIFT');
  return {...result,source:source.replace(needle,needle.replace('false','true'))};
 }
 return result;
}
