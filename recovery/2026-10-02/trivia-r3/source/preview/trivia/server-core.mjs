import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
export const TRIVIA_AUTHORITATIVE_FILES = ['routes/trivia.js','routes/mutationResults.js','game-logic/farm.js','game-logic/hud-bonuses.js','game-logic/economy.js','game-logic/player.js','data/questions.json'];
export function triviaSourcePin(root) { return Object.fromEntries(TRIVIA_AUTHORITATIVE_FILES.map(file => [file, createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')])); }
export function extractTriviaCore(pin, root) {
 const actual = triviaSourcePin(root); for (const [file, hash] of Object.entries(actual)) if(pin[file] !== hash) throw new Error(`Trivia authoritative source changed; review before repinning: ${file}`);
 const source=readFileSync(path.join(root,'routes/trivia.js'),'utf8'); const start=source.indexOf('export default function triviaRoutes('); if(start<0)throw new Error('Trivia route boundary changed');
 const helpers=readFileSync(path.join(root,'routes/mutationResults.js'),'utf8').replaceAll('export function','function');
 const implementation=source.slice(start).replace('export default function triviaRoutes(', 'function triviaRoutes(');
 return `import {ECONOMY,createTriviaLifelineState,calcRegen,pickQuestions,makeClientQuestion,selectTriviaAudiencePoll,selectTriviaFiftyFiftyAnswers,spendTriviaLifeline} from ${JSON.stringify(path.join(root,'game-logic.js'))};
import defaultQuestions from ${JSON.stringify(path.join(root,'data/questions.json'))};
${helpers}
import {makeRouteTable as Router} from ${JSON.stringify(path.join(root,'preview/trivia/routeHarness.js'))};
export function createAuthoritativeTriviaRoutes({withPlayerLock,resolveUser,questionBank}){const QUESTIONS=questionBank||defaultQuestions;const setInterval=()=>({unref(){}});\n${implementation}\nreturn triviaRoutes(()=>{},resolveUser);}\n`;
}
