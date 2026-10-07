export async function resolve(specifier,context,next){
 if(specifier==='./util.mjs'&&context.parentURL?.endsWith('/canonical-visit-worker-thread.mjs'))return {url:new URL('./visit-worker-drift-source.mjs',import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}
