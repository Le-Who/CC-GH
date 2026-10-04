import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=path.dirname(fileURLToPath(import.meta.url));
const repository=path.resolve(directory,'../..');
const adapter=path.join(directory,'adapters.jsx');
const isolated=new Set([
  'src/game-state/useGameHub.js', 'src/app/hud-layout/index.js', 'src/app/i18n.jsx',
  'src/app/homeNavigation.js', 'src/games/companion-yard-v2/scene.mjs',
  'src/games/companion-yard-v2/presentation.mjs',
  'game-logic/yard-v2/media/mika-clips.mjs', 'game-logic/yard-v2/mika-media.mjs',
].map(file=>path.join(repository,file)));

// This isolated entry never uses the production Vite config, server or release flags.
export default defineConfig({
  root:directory,
  publicDir:path.join(repository,'public'),
  plugins:[{
    name:'yard-ui-fixed-fixture-boundary',enforce:'pre',
    resolveId(source,importer){
      if(!importer || !source.startsWith('.')) return null;
      const resolved=path.resolve(path.dirname(importer.split('?')[0]),source);
      return isolated.has(resolved)?adapter:null;
    },
  },react()],
  server:{host:'127.0.0.1',port:4196,strictPort:true,fs:{allow:[repository]}},
});
