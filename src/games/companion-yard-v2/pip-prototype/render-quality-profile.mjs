// Two named reviewed profiles; caller-supplied arbitrary caps are forbidden.
export const DEFAULT_RENDER_PROFILE='garden-reference-1x';
export const PAINTED_RENDER_PROFILE='painted-native-1.5-v1';
const profiles=Object.freeze({
 [DEFAULT_RENDER_PROFILE]:Object.freeze({id:DEFAULT_RENDER_PROFILE,sampling:1,width:390,height:648,pixels:390*648,estimatedGPU:12*1024*1024,paintedFood:false}),
 [PAINTED_RENDER_PROFILE]:Object.freeze({id:PAINTED_RENDER_PROFILE,sampling:1.5,width:585,height:972,pixels:585*972,estimatedGPU:20*1024*1024,paintedFood:true})
});
export function pipRenderProfile(id=DEFAULT_RENDER_PROFILE){if(!Object.hasOwn(profiles,id))throw Error('Unqualified renderer profile');return profiles[id];}
