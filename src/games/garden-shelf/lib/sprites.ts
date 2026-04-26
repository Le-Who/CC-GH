export const GARDEN_SHEET_PATH = "/games/garden-shelf/plants_sheet_clean.png";

export const spriteData = {
  "fullWidth": 1672,
  "fullHeight": 941,
  "sprites": [
    {
      "col": 0,
      "row": 0,
      "x": 79,
      "y": 135,
      "width": 98,
      "height": 116
    },
    {
      "col": 0,
      "row": 1,
      "x": 77,
      "y": 346,
      "width": 100,
      "height": 133
    },
    {
      "col": 0,
      "row": 2,
      "x": 76,
      "y": 570,
      "width": 96,
      "height": 129
    },
    {
      "col": 0,
      "row": 3,
      "x": 76,
      "y": 783,
      "width": 93,
      "height": 122
    },
    {
      "col": 1,
      "row": 0,
      "x": 250,
      "y": 90,
      "width": 108,
      "height": 162
    },
    {
      "col": 1,
      "row": 1,
      "x": 248,
      "y": 324,
      "width": 104,
      "height": 155
    },
    {
      "col": 1,
      "row": 2,
      "x": 245,
      "y": 536,
      "width": 106,
      "height": 164
    },
    {
      "col": 1,
      "row": 3,
      "x": 232,
      "y": 760,
      "width": 130,
      "height": 145
    },
    {
      "col": 2,
      "row": 0,
      "x": 417,
      "y": 45,
      "width": 149,
      "height": 208
    },
    {
      "col": 2,
      "row": 1,
      "x": 423,
      "y": 284,
      "width": 148,
      "height": 196
    },
    {
      "col": 2,
      "row": 2,
      "x": 412,
      "y": 506,
      "width": 142,
      "height": 195
    },
    {
      "col": 2,
      "row": 3,
      "x": 398,
      "y": 732,
      "width": 171,
      "height": 175
    },
    {
      "col": 3,
      "row": 0,
      "x": 611,
      "y": 24,
      "width": 194,
      "height": 231
    },
    {
      "col": 3,
      "row": 1,
      "x": 613,
      "y": 270,
      "width": 181,
      "height": 218
    },
    {
      "col": 3,
      "row": 2,
      "x": 593,
      "y": 488,
      "width": 201,
      "height": 217
    },
    {
      "col": 3,
      "row": 3,
      "x": 588,
      "y": 718,
      "width": 226,
      "height": 191
    },
    {
      "col": 4,
      "row": 0,
      "x": 906,
      "y": 116,
      "width": 90,
      "height": 138
    },
    {
      "col": 4,
      "row": 1,
      "x": 904,
      "y": 349,
      "width": 100,
      "height": 133
    },
    {
      "col": 4,
      "row": 2,
      "x": 899,
      "y": 579,
      "width": 97,
      "height": 122
    },
    {
      "col": 4,
      "row": 3,
      "x": 900,
      "y": 789,
      "width": 87,
      "height": 124
    },
    {
      "col": 5,
      "row": 0,
      "x": 1072,
      "y": 76,
      "width": 105,
      "height": 178
    },
    {
      "col": 5,
      "row": 1,
      "x": 1072,
      "y": 313,
      "width": 108,
      "height": 170
    },
    {
      "col": 5,
      "row": 2,
      "x": 1057,
      "y": 548,
      "width": 127,
      "height": 155
    },
    {
      "col": 5,
      "row": 3,
      "x": 1051,
      "y": 761,
      "width": 118,
      "height": 154
    },
    {
      "col": 6,
      "row": 0,
      "x": 1244,
      "y": 28,
      "width": 145,
      "height": 226
    },
    {
      "col": 6,
      "row": 1,
      "x": 1246,
      "y": 286,
      "width": 128,
      "height": 197
    },
    {
      "col": 6,
      "row": 2,
      "x": 1232,
      "y": 527,
      "width": 151,
      "height": 178
    },
    {
      "col": 6,
      "row": 3,
      "x": 1223,
      "y": 729,
      "width": 160,
      "height": 186
    },
    {
      "col": 7,
      "row": 0,
      "x": 1422,
      "y": 20,
      "width": 189,
      "height": 234
    },
    {
      "col": 7,
      "row": 1,
      "x": 1443,
      "y": 272,
      "width": 152,
      "height": 211
    },
    {
      "col": 7,
      "row": 2,
      "x": 1418,
      "y": 506,
      "width": 191,
      "height": 201
    },
    {
      "col": 7,
      "row": 3,
      "x": 1416,
      "y": 722,
      "width": 197,
      "height": 195
    }
  ]
}

export function getGardenSpriteFrame(spriteIndex = 0, phase = 0) {
  const safePhase = Math.max(0, Math.min(3, Number(phase) || 0));
  const col = (spriteIndex % 2) * 4 + safePhase;
  const row = Math.floor(spriteIndex / 2);
  return spriteData.sprites.find((sprite) => sprite && sprite.col === col && sprite.row === row);
}

export function getGardenSpriteStyle(spriteIndex = 0, phase = 0, scale = 1) {
  const safePhase = Math.max(0, Math.min(3, Number(phase) || 0));
  const sprite = getGardenSpriteFrame(spriteIndex, safePhase);
  if (!sprite) {
    return {
      backgroundImage: `url('${GARDEN_SHEET_PATH}')`,
      backgroundSize: "800% 400%",
      backgroundPosition: `${(((spriteIndex % 2) * 4 + safePhase) / 7) * 100}% ${(Math.floor(spriteIndex / 2) / 3) * 100}%`,
      width: `${96 * scale}px`,
      height: `${96 * scale}px`,
      transformOrigin: "bottom center",
    };
  }

  const pX = (sprite.x / (spriteData.fullWidth - sprite.width)) * 100;
  const pY = (sprite.y / (spriteData.fullHeight - sprite.height)) * 100;
  return {
    backgroundImage: `url('${GARDEN_SHEET_PATH}')`,
    backgroundSize: `${(spriteData.fullWidth / sprite.width) * 100}% ${(spriteData.fullHeight / sprite.height) * 100}%`,
    backgroundPosition: `${pX}% ${pY}%`,
    width: `${sprite.width * scale}px`,
    height: `${sprite.height * scale}px`,
    transformOrigin: "bottom center",
  };
}
