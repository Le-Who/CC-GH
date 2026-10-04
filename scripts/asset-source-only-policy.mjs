// Reviewed exports used only by source-art QA, never by a current renderer.
// Keep the bytes and their provenance outside Vite's unconditional public copy.
export const SOURCE_ONLY_PUBLIC_ASSETS = Object.freeze({
  "public/games/hud-redesign/garden/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/garden/tool-slot.png",
  "public/games/hud-redesign/garden/screen-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/garden/screen-panel.png",
  "public/games/hud-redesign/garden/dialog-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/garden/dialog-panel.png",
  "public/games/hud-redesign/blox/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/blox/tool-slot.png",
  "public/games/hud-redesign/blox/screen-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/blox/screen-panel.png",
  "public/games/hud-redesign/blox/dialog-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/blox/dialog-panel.png",
  "public/games/hud-redesign/match3/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/match3/tool-slot.png",
  "public/games/hud-redesign/match3/screen-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/match3/screen-panel.png",
  "public/games/hud-redesign/match3/dialog-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/match3/dialog-panel.png",
  "public/games/hud-redesign/merge/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/merge/tool-slot.png",
  "public/games/hud-redesign/merge/screen-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/merge/screen-panel.png",
  "public/games/hud-redesign/bubbo/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/bubbo/tool-slot.png",
  "public/games/hud-redesign/bubbo/screen-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/bubbo/screen-panel.png",
  "public/games/hud-redesign/bubbo/dialog-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/bubbo/dialog-panel.png",
  "public/games/hud-redesign/trivia/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/trivia/tool-slot.png",
  "public/games/hud-redesign/trivia/screen-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/trivia/screen-panel.png",
  "public/games/hud-redesign/trivia/dialog-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/trivia/dialog-panel.png",
  "public/games/hud-redesign/room/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/room/tool-slot.png",
  "public/games/hud-redesign/room/dialog-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/room/dialog-panel.png",
  "public/games/hud-redesign/settlement/tool-slot.png": "assets-source/imagegen/hud-redesign/qa-exports/settlement/tool-slot.png",
  "public/games/hud-redesign/settlement/screen-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/settlement/screen-panel.png",
  "public/games/ui-surfaces/garden-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/garden-panel.png",
  "public/games/ui-surfaces/blox-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/blox-panel.png",
  "public/games/ui-surfaces/merge-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/merge-panel.png",
  "public/games/ui-surfaces/bubbo-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/bubbo-panel.png",
  "public/games/ui-surfaces/trivia-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/trivia-panel.png",
  "public/games/ui-surfaces/farm-panel.png": "assets-source/imagegen/hud-redesign/qa-exports/ui-surfaces/farm-panel.png",
  "public/games/ui-surfaces/screen-surface-extract-manifest.json": "assets-source/imagegen/hud-redesign/screen-surface-extract-manifest.json",
  "public/games/ui-surfaces/portrait-panel-extract-manifest.json": "assets-source/imagegen/hud-redesign/portrait-panel-extract-manifest.json",
  "public/games/companion-yard/HUD.svg": "assets-source/games/companion-yard/source-svg/HUD.svg",
  "public/games/gacha-merge/ui/actionIconClose.png": "assets-source/imagegen/gacha-merge/semantic-inputs/actionIconClose.png",
  "public/games/gacha-merge/ui/actionIconFreeTaps.png": "assets-source/imagegen/gacha-merge/semantic-inputs/actionIconFreeTaps.png",
  "public/games/gacha-merge/ui/actionIconFuel.png": "assets-source/imagegen/gacha-merge/semantic-inputs/actionIconFuel.png"
});

export const RETIRED_UNUSED_PUBLIC_FILES = Object.freeze([
  "public/games/ui-surfaces/screen-surface-atlas.png",
  "public/games/gacha-merge/ui/actionIconBack.png",
  "public/games/gacha-merge/ui/cellInvalid.png",
  "public/games/gacha-merge/ui/cellTrashTarget.png",
  "public/games/gacha-merge/ui/exchangeIconFuture.png",
  "public/games/gacha-merge/ui/exchangeIconShinyTreat.png",
  "public/games/gacha-merge/ui/exchangeIconTreats.png",
  "public/games/gacha-merge/ui/itemShadow.png",
  "public/games/gacha-merge/ui/sourceChipCrop.png",
  "public/games/gacha-merge/ui/sourceChipEmpty.png",
  "public/games/gacha-merge/ui/sourceChipFree.png",
  "public/games/gacha-merge/fx/discoveryBurst.png",
  "public/games/gacha-merge/fx/itemLiftGlow.png",
  "public/games/gacha-merge/fx/missPuff.png",
  "public/games/gacha-merge/fx/perfectReactionBurst.png"
]);

export function sourceOnlyAssetDestination(value) {
  const file = String(value).replaceAll('\\', '/').replace(/^\//, '').split(/[?#]/)[0];
  const publicPath = file.startsWith('public/') ? file : `public/${file}`;
  return SOURCE_ONLY_PUBLIC_ASSETS[publicPath] || null;
}

export function isObsoleteImportedAssetPath(value) {
  const file = String(value).replaceAll('\\', '/').replace(/^\//, '');
  return /^assets-source\/games\/(?:bubbo-bubbo|puzzling-potions)\/(?:raw-assets|dist-source)\//.test(file);
}
