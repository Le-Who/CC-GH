import path from 'node:path';
import { YARD_CONTRACT_DATA_MODULES } from './yard-contract-data.mjs';

export const GAME_DATA_MODULES = new Set([
  ...YARD_CONTRACT_DATA_MODULES,
  'game-logic/merge-lab-catalog.js',
  'src/games/garden-shelf/lib/gardenTranslations.ts',
  'src/games/settlement/gameData.js',
  'src/games/settlement/settlementText.js',
  'src/games/settlement/assetRegistry.js',
]);

const GAME_ENTRIES = {
  'garden-shelf': 'src/games/garden-shelf/GardenShelfGame.tsx',
  settlement: 'src/games/settlement/SettlementGame.jsx',
  merge: 'src/games/merge/MergeGame.jsx',
  blox: 'src/games/blox/BloxGame.jsx',
  match3: 'src/games/match3/Match3Game.jsx',
  bubbo: 'src/games/bubbo/BubboGame.jsx',
  trivia: 'src/games/trivia/TriviaGame.jsx',
  'companion-yard': 'src/games/companion-yard/CompanionYardGame.jsx',
  'companion-yard-v2': 'src/games/companion-yard-v2/CourtyardGame.jsx',
  'yard-player-entry': 'src/games/companion-yard-v2/YardReleaseGame.jsx',
};

// Rollup module ownership makes the budget independent of chunk names.
export function gameLoadingGraph() {
  let root;
  return {
    name: 'game-loading-graph',
    apply: 'build',
    configResolved(config) { root = config.root; },
    generateBundle(_options, bundle) {
      const entries = {};
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(chunk => {
        const rendered = Object.entries(chunk.modules).filter(([, info]) => info.renderedLength > 0);
        const sources = rendered
          .filter(([id]) => !id.includes('node_modules') && !id.startsWith('\0'))
          .map(([id]) => path.relative(root, id.split('?')[0]).replaceAll('\\', '/'));
        for (const [game, source] of Object.entries(GAME_ENTRIES)) if (sources.includes(source)) entries[game] = chunk.fileName;
        const gameModules = sources.filter(source => source.startsWith('src/games/'));
        const dataOnly = sources.length > 0 && rendered.length === sources.length && sources.every(source => GAME_DATA_MODULES.has(source));
        return {
          file: chunk.fileName, imports: chunk.imports, dynamicImports: chunk.dynamicImports,
          css: [...(chunk.viteMetadata?.importedCss || [])], isEntry: chunk.isEntry,
          renderedModuleCount: rendered.length, modules: sources, gameModules, dataModules: sources.filter(source => GAME_DATA_MODULES.has(source)), dataOnly,
          hasPixi: Object.keys(chunk.modules).some(id => /(?:node_modules[/\\](?:@pixi|pixi\.js))/.test(id)),
        };
      });
      this.emitFile({type:'asset', fileName:'game-loading-graph.json', source:JSON.stringify({schemaVersion:1, entries, chunks}, null, 2)+'\n'});
    },
  };
}
