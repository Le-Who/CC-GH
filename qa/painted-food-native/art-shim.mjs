// Served only by the isolated painted-food QA origin. The ordinary game and
// saved-visit QA continue importing their unchanged R2 source module.
import {createPaintedFoodPreview,createPaintedFoodResourceOwner,paintedFoodAssetURL,PAINTED_FOOD_DESCRIPTOR} from './calibrated-food-painted.mjs';
export const canonicalFoodAssetURL=paintedFoodAssetURL;
export const createCanonicalFoodResourceOwner=createPaintedFoodResourceOwner;
export const createCalibratedFood=(THREE,options)=>createPaintedFoodPreview(THREE,{...options,descriptor:PAINTED_FOOD_DESCRIPTOR});
