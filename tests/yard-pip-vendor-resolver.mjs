// Test-only resolution of the exact vendored Three module. No install/network.
export function resolve(specifier,context,nextResolve){
 if(specifier==='three')return{url:new URL('../src/games/companion-yard-v2/pip-prototype/vendor/three/build/three.module.js',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
