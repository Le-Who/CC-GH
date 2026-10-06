/** One unchanged parent-owned service supplies the trusted disposable fixture seam. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const INHERITED_SERVICE='game-logic/yard-v2/service.mjs';
export function inheritedServicePin(bytes){return {path:INHERITED_SERVICE,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')};}
export function validateInheritedService(rows,current,parent){
 assert(Array.isArray(rows));assert.equal(rows.length,1);const expected=inheritedServicePin(parent);assert.deepEqual(rows[0],expected,'Inherited service pin must equal the immutable parent bytes');assert.deepEqual(inheritedServicePin(current),expected,'Current service must remain unchanged from the parent');return rows[0];
}
