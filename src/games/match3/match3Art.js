/** Recovered game-only source from the owned Match3 v2 r2 preview. See recovery manifest. Runtime PNG exports were converted to exact lossless WebP. */
import {assetUrl} from '../../game-runtime/assetBundles.js';

const MATCH3_ART_BASE="/games/match3-v2/";
const MATCH3_ART=Object.freeze({
  backgroundPortrait:`${MATCH3_ART_BASE}library-background-portrait.webp`,
  backgroundLandscape:`${MATCH3_ART_BASE}library-background-landscape.webp`,
  frame:`${MATCH3_ART_BASE}board-frame.webp`,
  cell:`${MATCH3_ART_BASE}board-cell.webp`,
  hudPortrait:`${MATCH3_ART_BASE}hud-panel-portrait.webp`,
  hudLandscape:`${MATCH3_ART_BASE}hud-panel-landscape.webp`,
  card:`${MATCH3_ART_BASE}tool-card-base.webp`,
  round:`${MATCH3_ART_BASE}round-button-base.webp`,
  title:`${MATCH3_ART_BASE}title-plaque.webp`,
  pause:`${MATCH3_ART_BASE}pause-icon.webp`
});
const MATCH3_GEM_ART=Object.freeze(Object.fromEntries(["fire", "water", "earth", "air", "light", "dark"].map(n=>[n, `${MATCH3_ART_BASE}gems/${n}.webp`])));
const MATCH3_TOOL_ART=Object.freeze(Object.fromEntries(["mix", "bomb", "lightning", "rainbow", "hammer"].map(n=>[n, `${MATCH3_ART_BASE}icons/${n}.webp`])));
const MATCH3_NINE_SLICE=Object.freeze({
  frame:{
    source:[200, 200, 200, 200],
    destination:[14, 14, 14, 14]
  },
  hudPortrait:{
    source:[96, 86, 96, 86],
    destination:[16, 14, 16, 14]
  },
  hudLandscape:{
    source:[137, 137, 137, 137],
    destination:[16, 16, 16, 16]
  },
  card:{
    source:[65, 65, 65, 65],
    destination:[12, 12, 12, 12]
  }
});
const match3ArtUrl=n=>assetUrl(MATCH3_ART[n]||n);
function match3PanelSkin(n, i=MATCH3_NINE_SLICE[n].destination){
  const[o, u, c, f]=MATCH3_NINE_SLICE[n].source;
  const[d, h, b, g]=i;
  return{
    borderImageSource:`url(${JSON.stringify(match3ArtUrl(n))})`,
    borderImageSlice:`${u} ${c} ${f} ${o} fill`,
    borderImageWidth:`${h}px ${b}px ${g}px ${d}px`,
    borderImageOutset:0,
    borderImageRepeat:"stretch"
  }
}
const MATCH3_PIXI_ASSETS=[MATCH3_ART.frame, MATCH3_ART.cell, ...Object.values(MATCH3_GEM_ART)];
const MATCH3_TOOLS=["mix", "bomb", "lightning", "rainbow", "hammer"];
const MATCH3_SPECIAL_ASSET_KEYS={
  special_row:"match3.special.row",
  special_column:"match3.special.column",
  special_blast:"match3.special.blast",
  special_colour:"match3.special.colour",
  drop_gold:"match3.drop.gold",
  drop_seeds:"match3.drop.seeds",
  drop_energy:"match3.drop.energy"
};

const MATCH3_RETAINED_ASSET_KEYS=[...Object.values(MATCH3_SPECIAL_ASSET_KEYS),"match3.fx.clearBurst"];

export {MATCH3_RETAINED_ASSET_KEYS,MATCH3_ART,MATCH3_GEM_ART,MATCH3_TOOL_ART,MATCH3_NINE_SLICE,MATCH3_PIXI_ASSETS,MATCH3_TOOLS,MATCH3_SPECIAL_ASSET_KEYS,match3ArtUrl,match3PanelSkin};
