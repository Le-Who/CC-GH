/** Fourteen runtime assets; marine token art retains the original color IDs.
 * Token source/export provenance: assets-source/imagegen/bubbo-marine/manifest.json.
 * The remaining v2 art and all shared physics geometry are unchanged.
 */
import {assetUrl} from '../../game-runtime/assetBundles.js';

const BUBBO_ART=Object.freeze(Object.fromEntries(["background", "background-portrait", "panel", "button", "cannon", "mint", "amber", "coral", "sky", "berry", "swap", "bomb", "rainbow", "lightning"].map(i=>[i, `/games/bubbo-v2/${i}.webp`])));
const bubboArtUrl=i=>assetUrl(BUBBO_ART[i]||i);
const bubboPanelSkin=(i="panel", o=12)=>({
  borderImageSource:`url(${JSON.stringify(bubboArtUrl(i))})`,
  borderImageSlice:"140 fill",
  borderImageWidth:`${o}px`,
  borderImageRepeat:"stretch"
});
const BUBBO_TOKEN_ART=["mint", "amber", "coral", "sky", "berry"];

export {BUBBO_ART, BUBBO_TOKEN_ART, bubboArtUrl, bubboPanelSkin};
