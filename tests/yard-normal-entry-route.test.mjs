import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNormalYardRoute} from './helpers/yard-normal-entry-route.mjs';
test('normal Home to Yard accepts tab and preserves Telegram/auth routing',()=>{
 for(const suffix of ['', '?tab=room','?tab=room&auth_date=123&hash=abc#tgWebAppPlatform=android&tgWebAppVersion=8.0','?tgWebAppData=user%3Dexample&tab=room'])assert.equal(assertNormalYardRoute('https://example.test/'+suffix).previewOrTestFlags,false);
});
test('normal entry rejects actual preview switches, duplicate flags and test entry switches',()=>{
 for(const suffix of ['?tab=room&yardPipPreview=1','?yardCanonicalFood=1&tab=room','?tab=room&yardPipGrounding=pip-garden-grounding-v1','?tab=room&yardPipPreview=0&yardPipPreview=1','?tab=room&fixture=1','?tab=room&testMode=1','?tab=room#yardPipPreview=1','?tab=garden','?tab=room&tab=room'])assert.throws(()=>assertNormalYardRoute('https://example.test/'+suffix));
});
test('Yard browser template uses the shared route oracle instead of an empty-query assertion',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('./development-batch-e2e/yard-framing.spec.mjs',import.meta.url),'utf8');
 assert.match(source,/assertNormalYardRoute\(page\.url\(\)\)/);
 assert.doesNotMatch(source,/\.search\)\.toBe\(['"]['"]\)|searchParams\.size\s*,\s*0/);
});
