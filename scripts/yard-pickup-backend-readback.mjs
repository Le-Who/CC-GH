import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {requireDisposableBackend,requireExternalId} from './yard-real-backend-contract.mjs';
requireDisposableBackend();
const [metadataFile,commandFile,output]=process.argv.slice(2);assert.ok(metadataFile&&commandFile&&output);
const metadata=JSON.parse(await fs.readFile(metadataFile,'utf8')),command=JSON.parse(await fs.readFile(commandFile,'utf8'));
const initial=JSON.parse(await fs.readFile(metadataFile+'.snapshot.json','utf8'));
requireExternalId(metadata.externalId);
const {initDb,ensureDbSchema,closeDb}=await import('../db.js');const sql=initDb();await ensureDbSchema();
try{
 const identities=await sql`SELECT account_id FROM account_identities WHERE provider='dev' AND external_id=${metadata.externalId}`;
 assert.equal(identities.length,1);assert.equal(identities[0].account_id,metadata.accountId);
 const rows=await sql`SELECT data FROM players WHERE id=${metadata.accountId}`;assert.equal(rows.length,1);
 const player=rows[0].data,r=player._yardV2.runtime,w=r.canonicalVisits[metadata.candidate.visitId];
 assert.equal(command.action,'yard.pickupGoodie');assert.equal(command.accountId,metadata.accountId);
 assert.deepEqual(r.canonicalPlacements,[]);assert.equal(w.status,'active');assert.equal(w.leavesAt,metadata.candidate.leavesAt);
 assert.equal(w.releasedPickupActionId,command.clientActionId);assert.equal(r.commandReceipts[command.clientActionId].status,200);
 assert.equal(Object.values(r.commandReceipts).filter(x=>x.action==='yard.pickupGoodie'&&x.status===200).length,1);
 assert.equal(player.yard.goodieInventory.leaf_pot,(initial.yard.goodieInventory.leaf_pot||0)+1);
 assert.deepEqual(player.yard.currencies,initial.yard.currencies);assert.deepEqual(player.yard.bowls,initial.yard.bowls);
 assert.equal(player.yard.activeVisitors.length,1);assert.equal(player.yard.activeVisitors[0].leavesAt,metadata.candidate.leavesAt);
 await fs.writeFile(output,JSON.stringify({persisted:true,source:'Actual PostgreSQL readback after authenticated API pickup, nonce replay and browser reload',visitId:w.visitId,leavesAt:w.leavesAt,actionId:command.clientActionId,inventory:player.yard.goodieInventory},null,2)+'\n');
}finally{await closeDb();}
