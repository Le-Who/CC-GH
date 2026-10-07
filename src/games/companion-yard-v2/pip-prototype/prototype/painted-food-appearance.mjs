/** Food-only, fixed-owner native fidelity probe. No texture, target, geometry
 * buffer, Pip material or physical navigation footprint is added/changed. */
export const FOOD_APPEARANCE_VARIANTS=Object.freeze(['baseline','authored-color','authored-color-contact']);
export function installFoodAppearance(root,{variant='baseline'}={}){
 if(!FOOD_APPEARANCE_VARIANTS.includes(variant))throw Error('Unknown food appearance probe');
 const contact=root.getObjectByName('FoodContactLobe');if(!contact?.isMesh)throw Error('Pinned food contact missing');
 const materials=new Set();root.traverse(o=>{if(o.isMesh)materials.add(o.material)});
 const saved=[],scale=contact.scale.clone(),position=contact.position.clone();let disposed=false;
 for(const material of materials){const isContact=material===contact.material,fill=material.name==='Painted ceramic'?.28:.16;
  if(variant==='baseline'||isContact&&variant!=='authored-color-contact')continue;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
  material.onBeforeCompile=function(shader,renderer){compile.call(this,shader,renderer);const chunk='#include <opaque_fragment>';if(!shader.fragmentShader.includes(chunk))throw Error('Unqualified food shader');shader.fragmentShader=shader.fragmentShader.replace(chunk,(isContact?'outgoingLight = diffuseColor.rgb;':`outgoingLight = mix( outgoingLight, diffuseColor.rgb, ${fill.toFixed(2)} );`)+'\n'+chunk);};
  material.customProgramCacheKey=function(){return key.call(this)+'|yard-food-fidelity-v1|'+variant+'|'+(isContact?'contact':fill);};material.needsUpdate=true;saved.push({material,compile,key});
 }
 if(variant==='authored-color-contact'){contact.scale.set(1.25,1,1.18);contact.position.x+=.40/12;contact.position.z+=.35/12;contact.updateMatrixWorld(true);}
 const diagnostics=Object.freeze({variant,scope:'Food-only native probe; not installed in ordinary app',solidNavigationRadiusCanonical:3.843,
  contactVisualRadiusUpperBoundCanonical:variant==='authored-color-contact'?5.24:3.761,contactVisualOffsetCanonical:variant==='authored-color-contact'?[.40,-.35,0]:[0,0,0],
  ceramicAuthoredColorMix:variant==='baseline'?0:.28,foodAuthoredColorMix:variant==='baseline'?0:.16,
  colorTreatment:'Bounded mix toward authored albedo, not additive emission; majority of native shading retained',
  addedTextureBytes:0,addedGeometryBufferBytes:0,addedRenderTargetBytes:0,addedDrawCalls:0,shaderProgramDriverBytesKnown:false,PipChanged:false});
 return{diagnostics,dispose(){if(disposed)return;disposed=true;for(const {material,compile,key} of saved){material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;}contact.scale.copy(scale);contact.position.copy(position);}};
}
