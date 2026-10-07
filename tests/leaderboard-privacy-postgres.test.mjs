import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {initDb,ensureDbSchema,getDb,closeDb} from '../db.js';
import {getOrCreateAccountForIdentity} from '../accountManager.js';
import {createDefaultPlayer} from '../game-logic.js';
import leaderboardRoutes from '../routes/leaderboard.js';

test('real PostgreSQL: existing Telegram first name refresh, private leaderboard JSON, nickname persistence and score preservation', {skip:process.env.LEADERBOARD_PRIVACY_PG !== '1'}, async()=>{
  assert.equal(process.env.NODE_ENV,'test');
  assert.match(process.env.DATABASE_URL,/privacy_test/,'dedicated disposable CI database only');
  initDb();await ensureDbSchema();const sql=getDb();
  let server;
  try {
    const accountId=await getOrCreateAccountForIdentity('telegram','123456789',{firstName:'Old first name',username:'SYNTHETIC_PRIVATE_HANDLE',lastName:'PRIVATE_SURNAME'});
    const refreshedId=await getOrCreateAccountForIdentity('telegram','123456789',{firstName:'Анна',username:'SYNTHETIC_PRIVATE_HANDLE',lastName:'PRIVATE_SURNAME'});
    assert.equal(accountId,refreshedId);
    await sql`INSERT INTO players (id,data) VALUES (${accountId},${sql.json({...createDefaultPlayer(accountId,'SYNTHETIC_PRIVATE_HANDLE'),displayName:'OLD_UNSAFE_HANDLE',match3:{highScore:123,totalGames:2},blox:{highScore:456}})})`;
    const auth=(req,res,next)=>{req.authenticatedUser={accountId,telegramUser:{firstName:'Анна'}};next();};
    const app=express();app.use(express.json());app.use(leaderboardRoutes(auth,req=>({userId:req.authenticatedUser.accountId})));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const read=async path=>{const response=await fetch(base+path,{headers:{Authorization:'synthetic-test'}});assert.equal(response.status,200);return response.json();};
    for(const path of ['/api/leaderboard','/api/blox/leaderboard']){
      const rows=await read(path);assert.equal(rows[0].displayName,'Анна');assert.equal(rows[0].isSelf,true);
      for(const forbidden of ['123456789','SYNTHETIC_PRIVATE_HANDLE','PRIVATE_SURNAME','OLD_UNSAFE_HANDLE',accountId])assert.equal(JSON.stringify(rows).includes(forbidden),false);
    }
    for(const nickname of ['Лиса 🦊','Лиса 🦊','']){
      const response=await fetch(base+'/api/profile/nickname',{method:'POST',headers:{Authorization:'synthetic-test','Content-Type':'application/json'},body:JSON.stringify({nickname,userId:'someone-else'})});
      assert.equal(response.status,200,await response.text());
      for(const path of ['/api/leaderboard','/api/blox/leaderboard']) assert.equal((await read(path))[0].displayName,nickname||'Анна');
    }
    const [saved]=await sql`SELECT data FROM players WHERE id = ${accountId}`;
    assert.equal(saved.data.match3.highScore,123);assert.equal(saved.data.match3.totalGames,2);assert.equal(saved.data.blox.highScore,456);assert.equal(saved.data.publicProfile.nickname,null);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await closeDb();
  }
});
