import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { extractTriviaCore } from '../../preview/trivia/server-core.mjs';
import pin from '../../preview/trivia/server-core-pin.json' with {type:'json'};
let factory;
export async function triviaCore() { if(factory)return factory;const r=await build({stdin:{contents:extractTriviaCore(pin,process.cwd()),resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'cjs',platform:'node',logLevel:'silent'});const mod={exports:{}};new Function('require','module','exports',r.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);factory=mod.exports.createAuthoritativeTriviaRoutes;return factory; }
