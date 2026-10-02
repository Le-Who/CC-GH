/** Recovered game-only source from the owned Blox v2 r2 preview. See recovery manifest. Runtime PNG exports were converted to exact lossless WebP. */
import {assetUrl} from '../../game-runtime/assetBundles.js';

const BLOX_ART_BASE="/games/blox-v2/";
const BLOX_ART=Object.freeze({
  background:`${BLOX_ART_BASE}background.webp`,
  frame:`${BLOX_ART_BASE}board-frame.webp`,
  cell:`${BLOX_ART_BASE}empty-cell.webp`,
  panel:`${BLOX_ART_BASE}panel.webp`,
  button:`${BLOX_ART_BASE}button.webp`,
  rotate:`${BLOX_ART_BASE}rotate-icon.webp`,
  pause:`${BLOX_ART_BASE}pause-icon.webp`,
  energy:`${BLOX_ART_BASE}energy.webp`,
  burst:`${BLOX_ART_BASE}burst.webp`
});
const BLOX_BLOCK_FILES=Object.freeze({
  "#94a3b8":{
    name:"silver",
    glyph:"hexagon"
  },
  "#60a5fa":{
    name:"blue",
    glyph:"circle"
  },
  "#f97316":{
    name:"orange",
    glyph:"plus"
  },
  "#22c55e":{
    name:"green",
    glyph:"triangle"
  },
  "#fbbf24":{
    name:"gold",
    glyph:"square"
  },
  "#a78bfa":{
    name:"violet",
    glyph:"diamond"
  },
  "#ef4444":{
    name:"red",
    glyph:"heart"
  },
  "#06b6d4":{
    name:"cyan",
    glyph:"crescent"
  },
  "#e879f9":{
    name:"magenta",
    glyph:"star"
  }
});
const BLOX_BLOCK_ART=Object.freeze(Object.fromEntries(Object.entries(BLOX_BLOCK_FILES).map(([n, i])=>[n, `${BLOX_ART_BASE}tiles/${i.name}.webp`])));
const BLOX_NINE_SLICE=Object.freeze({
  frame:{
    source:[120, 120, 120, 120],
    destination:[8, 8, 8, 8]
  },
  panel:{
    source:[128, 128, 128, 128],
    destination:[10, 10, 10, 10]
  },
  button:{
    source:[96, 96, 96, 96],
    destination:[10, 10, 10, 10]
  }
});
const bloxArtUrl=n=>assetUrl(BLOX_ART[n]||n);
const bloxTileAsset=n=>bloxArtUrl(BLOX_BLOCK_ART[String(n||"").toLowerCase()]||BLOX_BLOCK_ART["#94a3b8"]);
function bloxPanelSkin(name, destination=BLOX_NINE_SLICE[name].destination){
  const[left, top, right, bottom]=BLOX_NINE_SLICE[name].source;
  const[destLeft, destTop, destRight, destBottom]=destination;
  return{
    borderImageSource:`url(${JSON.stringify(bloxArtUrl(name))})`,
    borderImageSlice:`${top} ${right} ${bottom} ${left} fill`,
    borderImageWidth:`${destTop}px ${destRight}px ${destBottom}px ${destLeft}px`,
    borderImageOutset:0,
    borderImageRepeat:"stretch"
  }
}
const BLOX_PIXI_ASSETS=[BLOX_ART.frame, BLOX_ART.cell, BLOX_ART.panel, BLOX_ART.energy, BLOX_ART.burst, ...Object.values(BLOX_BLOCK_ART)];

export {BLOX_ART,BLOX_BLOCK_ART,BLOX_NINE_SLICE,BLOX_PIXI_ASSETS,bloxArtUrl,bloxTileAsset,bloxPanelSkin};
