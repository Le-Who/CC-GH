import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Source contracts follow the same runtime components after a module split.
// Assertions are unchanged; forbidden UI behavior is checked in every view.
export function readSplitGameSource(entry) {
  const filename = entry instanceof URL ? fileURLToPath(entry) : entry;
  const folder = path.dirname(filename), name = path.basename(filename);
  const matches = name === 'GardenShelfGame.tsx'
    ? file => ['GardenShelfGame.tsx', 'LegacyGardenGame.tsx'].includes(file)
    : name === 'GardenPresentation.tsx'
      ? file => /^(GardenPresentation|GardenViewShared|GardenSettingsDialog|GardenQuests|GardenShop|GardenDetail)\.tsx$/.test(file)
      : name === 'SettlementGame.jsx'
        ? file => /^(Settlement.*|settlementViewShared)\.jsx$/.test(file)
        : file => file === name;
  return readdirSync(folder).filter(matches).sort().map(file => readFileSync(path.join(folder, file), 'utf8')).join('\n');
}
