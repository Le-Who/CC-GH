import {readFile}from'node:fs/promises';import{createHash}from'node:crypto';import path from'node:path';import{fileURLToPath}from'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),manifest=JSON.parse(await readFile(new URL('./FILES.sha256.json',import.meta.url),'utf8'));let count=0;
for(const[name,sha]of Object.entries(manifest.files)){if(name.includes('..')||path.isAbsolute(name))throw Error('Unsafe integrity path');const actual=createHash('sha256').update(await readFile(path.join(app,name))).digest('hex');if(actual!==sha)throw Error('QA file mismatch: '+name+'. Extract the complete current archive; do not overlay an older kit.');count++;}
console.log(`Yard QA package verified: ${count} files. Static integrity only; no browser launched.`);
