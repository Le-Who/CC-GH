import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {checkPlacement,visibleStatus} from '../src/games/companion-yard-v2/presentation.mjs';
import {createPreviewTranslator} from './yard-corrected-scene/browser/preview-i18n.mjs';
import {uiImageLifetimeLedger} from './yard-corrected-scene/vendor/r5/src/games/companion-yard-v2/ui-image-reserve.mjs';

// Code-only check. No browser, raster decoding, network/API fixture, or artifact
// output. The completed browser packet and its allowlists remain historical.
const repo=fileURLToPath(new URL('../',import.meta.url));
const preview=path.join(repo,'qa/yard-corrected-scene');
const {transform}=createRequire(path.join(repo,'package.json'))('esbuild');
for(const [file,loader] of [
 ['vendor/r5/src/games/companion-yard-v2/courtyard.css','css'],
 ['browser/main.jsx','jsx'],
 ['browser/preview-i18n.mjs','js'],
]){
 const result=await transform(await fs.readFile(path.join(preview,file),'utf8'),{loader,sourcefile:file,target:'chrome131',jsx:'automatic'});
 assert.deepEqual(result.warnings,[],file+' syntax warnings');
}
const guarded={yardRuntime:{mutable:false,display:{issues:[]}}};
assert.equal(checkPlacement(guarded,{}).errors[0].code,'YARD_READ_ONLY');
for(const [language,expected]of [['en','Read-only preview · changes disabled'],['ru','Предпросмотр · изменения отключены']]){
 const t=createPreviewTranslator(language,()=>{throw Error('Unexpected fallback for preview status');});
 assert.equal(visibleStatus({mutable:false},t),expected);
}
let forwarded;const variables={count:3};
const t=createPreviewTranslator('ru',(...args)=>{forwarded=args;return 'original';});
assert.equal(t('yard.persistent.status.gifts',variables),'original');
assert.deepEqual(forwarded,['ru','yard.persistent.status.gifts',variables]);
assert.equal(forwarded[2],variables);
const config=JSON.parse(await fs.readFile(path.join(preview,'public/runtime/scene.json'),'utf8'));
const reachable=uiImageLifetimeLedger({...config.catalog,baseURL:'https://yard.invalid/assets/yard-scene45/'});
const reserved=config.uiLifetime.bytes+config.extraUiOwners.reduce((sum,row)=>sum+row.bytes,0);
assert.equal(reachable.owners,69);assert.equal(reachable.bytes,18849376);
assert.equal(reserved,19163952);assert.ok(reachable.bytes<=reserved);
console.log(JSON.stringify({syntaxFiles:3,previewTranslations:2,readOnlyGuard:'passed',translationDelegation:'passed',reachableUiOwners:reachable.owners,reachableUiBytes:reachable.bytes,reservedUiBytes:reserved,browserRun:false,rasterDecode:false,visualAcceptance:false}));
