// QA-origin only: ordinary game and saved-visit QA keep the unchanged R2 owner.
import {createPaintedFoodPreview,createPaintedFoodResourceOwner,paintedFoodAssetURL,PAINTED_FOOD_DESCRIPTOR} from './calibrated-food-painted.mjs';
import {installFoodAppearance} from './painted-food-appearance.mjs';
export const canonicalFoodAssetURL=paintedFoodAssetURL;
export const createCanonicalFoodResourceOwner=options=>createPaintedFoodResourceOwner({...options,resourceProfile:new URL(location.href).searchParams.get('sampling')==='1.5'?'isolated-native-sampling-1.5':'production'});
export async function createCalibratedFood(THREE,options){
 const owner=await createPaintedFoodPreview(THREE,{...options,descriptor:PAINTED_FOOD_DESCRIPTOR});
 const variant=new URL(location.href).searchParams.get('foodAppearance')||'baseline';
 let appearance;try{appearance=installFoodAppearance(owner.root,{variant});}catch(error){owner.dispose();throw error;}
 return{...owner,dispose(){appearance.dispose();owner.dispose();},get diagnostics(){return{...owner.diagnostics,appearance:appearance.diagnostics}}};
}
