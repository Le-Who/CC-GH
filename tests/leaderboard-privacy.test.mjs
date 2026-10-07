import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import leaderboardRoutes from '../routes/leaderboard.js';
import {publicDisplayName, publicLeaderboardEntry, validateNickname} from '../game-logic/public-profile.js';
import {publicLeaderboardName} from '../src/app/publicLeaderboardName.js';

const PRIVATE = { username:'SYNTHETIC_PRIVATE_HANDLE', last_name:'SYNTHETIC_PRIVATE_SURNAME', displayName:'SYNTHETIC_OLD_HANDLE', telegramId:'123456789' };
function fixture() {
  const players = new Map([
    ['acct:one',{id:'acct:one',first_name:'Анна',nickname:null,high_score:900,total_games:3,...PRIVATE}],
    ['telegram:123456789',{id:'telegram:123456789',first_name:'',nickname:null,high_score:800,total_games:2,...PRIVATE}],
    ['acct:three',{id:'acct:three',first_name:'Имя',nickname:'Игровой 🐈',high_score:700,total_games:1,...PRIVATE}],
  ]);
  let scoreReads=0;
  function sql(strings,...values) {
    if (!strings.raw) return strings;
    const query=strings.join('?');
    if (query.includes('ORDER BY')) {scoreReads++; return Promise.resolve([...players.values()].map(row=>({...row})));}
    if (query.includes('LEFT JOIN')) return Promise.resolve([...players.values()]);
    if (query.includes('FROM players WHERE id')) return Promise.resolve([players.get(values[0])].filter(Boolean));
    throw Error(`Unexpected fixture query: ${query}`);
  }
  const requireAuth=(req,res,next)=>{
    const id=req.headers.authorization?.replace('test ','');
    if (!players.has(id)) return res.status(401).json({error:'Unauthorized'});
    req.authenticatedUser={accountId:id,telegramUser:{firstName:players.get(id).first_name}}; next();
  };
  const resolveUser=req=>({userId:req.authenticatedUser?.accountId});
  const lock=async(id,cb)=>{
    const row=players.get(id);
    const player={publicProfile:{nickname:row.nickname}, match3:{highScore:row.high_score,totalGames:row.total_games},blox:{highScore:row.high_score}};
    const before=JSON.stringify({match3:player.match3,blox:player.blox});
    const result=await cb(player);
    assert.equal(JSON.stringify({match3:player.match3,blox:player.blox}),before);
    row.nickname=player.publicProfile.nickname;
    return result;
  };
  const app=express();app.use(express.json());app.use(leaderboardRoutes(requireAuth,resolveUser,{getDb:()=>sql,withPlayerLock:lock}));
  return {app,players,scoreReads:()=>scoreReads};
}
async function withServer(fn) {
  const f=fixture();
  const server=f.app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,auth,body)=>{
    const res=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{...(auth?{Authorization:`test ${auth}`} : {}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,headers:res.headers,json:await res.json()};
  };
  try {await fn({...f,request});} finally {await new Promise(resolve=>server.close(resolve));}
}
function assertPrivate(json) {
  const serialized=JSON.stringify(json);
  for (const secret of [...Object.values(PRIVATE),'acct:one','acct:three','telegram:123456789']) assert.equal(serialized.includes(secret),false,secret);
  for(const row of json) {
    assert.equal(Object.hasOwn(row,'username'),false);assert.equal(Object.hasOwn(row,'last_name'),false);assert.equal(Object.hasOwn(row,'id'),false);assert.equal(Object.hasOwn(row,'telegramId'),false);
  }
}

test('naming precedence never uses legacy profile fields, handles Unicode/reset/empty names',()=>{
  assert.equal(publicDisplayName({...PRIVATE,nickname:'Лиса 🦊',firstName:'Анна'}),'Лиса 🦊');
  assert.equal(publicDisplayName({...PRIVATE,firstName:'Анна'}),'Анна');
  assert.equal(publicDisplayName(PRIVATE,'ru'),'Игрок');
  assert.equal(publicDisplayName(PRIVATE,'en'),'Player');
  assert.equal(publicDisplayName(null,'ru'),'Игрок');
  assert.equal(publicDisplayName({nickname:'bad\nname',firstName:'Анна'}),'Анна');
  assert.equal(publicDisplayName({firstName:'bad\u202Ename'},'ru'),'Игрок');
  assert.equal(publicDisplayName({firstName:'Миша 👨‍💻'}),'Миша 👨‍💻');
  assert.equal(validateNickname('Лиса 👩‍💻').nickname,'Лиса 👩‍💻');
  assert.equal(validateNickname('\u200D\uFE0F').error,'INVALID_NICKNAME');
  assert.deepEqual(validateNickname('  '),{nickname:null});
  assert.deepEqual(validateNickname('я'.repeat(32)),{nickname:'я'.repeat(32)});
  for(const invalid of [null,{},'я'.repeat(33),'bad\nname','bad\u202Ename']) assert.equal(validateNickname(invalid).error,'INVALID_NICKNAME');
  assert.equal(publicLeaderboardName({username:'handle',displayName:'old'},'Игрок'),'Игрок');
  const projected=publicLeaderboardEntry({...PRIVATE,id:'telegram:123456789',high_score:77,total_games:4},1,null,'ru');
  assertPrivate([projected]); assert.equal(projected.displayName,'Игрок'); assert.equal(projected.highScore,77);
});
for(const path of ['/api/leaderboard','/api/blox/leaderboard']) test(`${path}: real HTTP JSON is private and self flags are not cached`,async()=>withServer(async({request,scoreReads})=>{
  const a=await request(path+'?lang=ru','acct:one');
  assert.equal(a.status,200);assertPrivate(a.json);
  assert.deepEqual(a.json.map(x=>x.displayName),['Анна','Игрок','Игровой 🐈']);
  assert.deepEqual(a.json.map(x=>x.isSelf),[true,false,false]);
  assert.deepEqual(a.json.map(x=>x.highScore),[900,800,700]);
  assert.deepEqual(a.json.map(x=>x.rank),[1,2,3]);
  assert.match(a.headers.get('cache-control'),/private.*no-store/);assert.match(a.headers.get('vary'),/Authorization/);
  const b=await request(path,'telegram:123456789');
  assertPrivate(b.json);assert.deepEqual(b.json.map(x=>x.isSelf),[false,true,false]);assert.equal(b.json[1].displayName,'Player');
  const anonymous=await request(path);assertPrivate(anonymous.json);assert.ok(anonymous.json.every(x=>!x.isSelf));
  assert.equal(scoreReads(),1,'ranking stays cached while identity projection is request specific');
  assert.equal((await request(path,'invalid')).status,401);
}));
test('authenticated nickname edit/reset is immediate in both cached leaderboards, idempotent, self-only',async()=>withServer(async({request,players,scoreReads})=>{
  for(const path of ['/api/leaderboard','/api/blox/leaderboard']) await request(path,'acct:one');
  assert.equal((await request('/api/profile/nickname')).status,401);
  assert.equal((await request('/api/profile/nickname',null,{nickname:'stolen'})).status,401);
  assert.equal((await request('/api/profile/nickname','acct:one',{nickname:'Лиса <img src=x>',userId:'acct:three'})).status,200);
  assert.equal(players.get('acct:three').nickname,'Игровой 🐈');
  assert.equal((await request('/api/profile/nickname','acct:one')).json.nickname,'Лиса <img src=x>');
  await request('/api/profile/nickname','acct:one',{nickname:'Лиса <img src=x>'});
  for(const path of ['/api/leaderboard','/api/blox/leaderboard']) {
    const res=await request(path,'acct:three');assertPrivate(res.json);assert.equal(res.json[0].displayName,'Лиса <img src=x>');assert.deepEqual(res.json.map(x=>x.highScore),[900,800,700]);
  }
  assert.equal(scoreReads(),2);
  for(const nickname of ['bad\u0000name','bad\u2066name','я'.repeat(33),{},null]) assert.equal((await request('/api/profile/nickname','acct:one',{nickname})).status,400);
  assert.equal(players.get('acct:one').nickname,'Лиса <img src=x>');
  await request('/api/profile/nickname','acct:one',{nickname:''});
  for(const path of ['/api/leaderboard','/api/blox/leaderboard']) assert.equal((await request(path)).json[0].displayName,'Анна');
}));
test('empty scores stay empty and legacy invalid nickname never revives stored handle',async()=>withServer(async({request,players})=>{
  players.get('acct:one').nickname='bad\u0000name';
  players.get('acct:one').first_name='';
  assert.equal((await request('/api/leaderboard?lang=ru')).json[0].displayName,'Игрок');
  players.clear();
  assert.deepEqual((await request('/api/blox/leaderboard')).json,[]);
}));
