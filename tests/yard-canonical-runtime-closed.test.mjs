import test from 'node:test';
import assert from 'node:assert/strict';
import {CANONICAL_RUNTIME_ENABLED,ensureCanonicalPlayerYard,executeCanonicalYardAction,closeCanonicalRuntime} from '../game-logic/yard-v2/canonical-runtime.mjs';
import {ensurePersistentPlayerYard,publicPersistentYard} from '../game-logic/yard-v2/service.mjs';
test('normal runtime stays source-closed and preserves explicit v3 data',async()=>{
 assert.equal(CANONICAL_RUNTIME_ENABLED,false);
 const p={id:'closed-v3',schemaVersion:11,yard:{sentinel:'preserved'},_yardV2:{format:'yard-persistent/v1',version:3,runtime:{version:1}}};
 const before=structuredClone(p);
 assert.equal(ensureCanonicalPlayerYard(p,{now:1000,simulate:true}).error,'CANONICAL_RUNTIME_DISABLED');
 assert.equal(ensurePersistentPlayerYard(p,{now:1000,simulate:true}).error,'UNSUPPORTED_YARD_STORAGE_VERSION');
 assert.equal(publicPersistentYard(p,{now:1000}).mutable,false);
 assert.equal(executeCanonicalYardAction(p,'yard.setFood',{},{}).status,409);
 assert.deepEqual(p,before);await closeCanonicalRuntime();
});
