import { sourceOnlyAssetDestination, RETIRED_UNUSED_PUBLIC_FILES } from "./asset-source-only-policy.mjs";

// These are renderer-specific retirements, not a blanket ban on legacy art.
// Yard, Merge schema fallbacks, Settlement and future canonical Yard media stay.
export const MATCH3_SEMANTIC_FILES = Object.freeze([
  'special-row.png', 'special-column.png', 'special-blast.png', 'special-colour.png',
  'drop-gold.png', 'drop-seeds.png', 'drop-energy.png', 'fx-clear-burst.png',
]);
const match3Files = new Set(MATCH3_SEMANTIC_FILES.map(file => `games/puzzling-potions/images/${file}`));
const gardenFiles = new Set([
  'games/garden-shelf/assets_transparent.png',
  // Shared index.css still owns this Hub chip skin. Retire only with its caller.
  'games/garden-shelf/quest_panel.png',
]);
const licenses = new Set(['games/bubbo-bubbo/LICENSE', 'games/puzzling-potions/LICENSE']);
export function isRetiredAssetPath(value) {
  const file = String(value).replaceAll('\\', '/').replace(/^\/?(?:public\/)?/, '').split(/[?#]/)[0];
  if (sourceOnlyAssetDestination(file) || RETIRED_UNUSED_PUBLIC_FILES.includes(`public/${file}`)) return true;
  if (licenses.has(file) || match3Files.has(file) || gardenFiles.has(file)) return false;
  return /^(?:games\/(?:trivia|blox|farm|bubbo-bubbo|garden-shelf|puzzling-potions)\/|assets-runtime\/(?:blox|farm|bubbo)\/)/.test(file)
    || (/^assets-runtime\/garden-shelf\//.test(file) && !/^assets-runtime\/garden-shelf\/transparent\.[a-f0-9]{8}\.webp$/.test(file))
    || (/^assets-runtime\/puzzling-potions\//.test(file) && !/^assets-runtime\/puzzling-potions\/(?:row|column|blast|colour|gold|seeds|energy|clearBurst)\.[a-f0-9]{8}\.webp$/.test(file));
}
