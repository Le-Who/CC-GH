export async function load(url,context,next){
 const result=await next(url,context);
 if(url.endsWith('/game-logic/yard-v2/canonical-visit-reconciliation.mjs')){
  const source=String(result.source),needle='export const CANONICAL_RECONCILIATION_ENABLED=false;';
  if(process.env.NODE_ENV!=='test'||source.split(needle).length!==2)throw Error('TEST_GATE_SOURCE_DRIFT');
  return {...result,source:source.replace(needle,'export const CANONICAL_RECONCILIATION_ENABLED=true;')};
 }
 return result;
}
