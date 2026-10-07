import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import triviaRoutes from '../routes/trivia.js';
import {publicDuelPlayers,publicDuelOutcome} from '../game-logic/public-duel-profile.js';
process.env.NODE_ENV='test';
const privateFields={username:'PRIVATE_SYNTHETIC_HANDLE',displayName:'PRIVATE_OLD_DISPLAY',lastName:'PRIVATE_SURNAME'};
const raw=[{userId:'telegram:123456789',...privateFields,score:4,answers:[{correct:true}],finished:true,publicProfile:{firstName:'Анна'}},{userId:'telegram:987654321',...privateFields,score:9,answers:[{correct:true}],finished:true,publicProfile:{nickname:'Лиса'}}];
function noPrivate(data){const json=JSON.stringify(data);for(const value of [...Object.values(privateFields),...raw.map(p=>p.userId),'123456789','987654321'])assert.equal(json.includes(value),false,value);}
test('public duel projection sanitizes snapshots and resolves winner by score/index when names collide',async()=>{
 const same=raw.map(p=>({...p,publicProfile:{nickname:'Same'}}));const projected=await publicDuelPlayers(same,null,raw[0].userId);noPrivate(projected);
 assert.deepEqual(publicDuelOutcome(same,projected),{isTie:false,winnerIndex:1,winner:'Same'});
 const tied=same.map((p,i)=>({...p,score:5,finishedAt:i?999999:1,startedAt:i?5000:0}));assert.deepEqual(publicDuelOutcome(tied,projected),{isTie:true,winnerIndex:null,winner:null});
 const legacy=raw.map(({publicProfile,...row})=>row);const old=await publicDuelPlayers(legacy,null,null,'ru');noPrivate(old);assert.ok(old.every(p=>p.displayName==='Игрок'));
});
test('public duel room/status/history/start/join/ready responses never expose raw identity or legacy names',async()=>{
 const auth=(req,res,next)=>{const userId=req.headers.authorization?.slice(5);if(!userId)return res.status(401).json({error:'Unauthorized'});req.authenticatedUser={accountId:userId,telegramUser:{firstName:userId===raw[0].userId?'Анна':'Борис'}};next();};
 const resolve=req=>({userId:req.authenticatedUser.accountId,username:'PRIVATE_SYNTHETIC_HANDLE'});
 const router=triviaRoutes(auth,resolve);const app=express();app.use(express.json());app.use(router);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const request=async(path,id,body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method:body===undefined?'GET':'POST',headers:{...(id?{Authorization:`test ${id}`} : {}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(res.status,200);const data=await res.json();noPrivate(data);return data;};
 try{
  const created=await request('/api/trivia/duel/create',raw[0].userId,{count:1});
  const joined=await request('/api/trivia/duel/join',raw[1].userId,{inviteCode:created.inviteCode});assert.deepEqual(joined.players.map(p=>p.displayName),['Анна','Борис']);
  const ready=await request('/api/trivia/duel/ready',raw[0].userId,{roomId:created.roomId});assert.equal(ready.players[0].isSelf,true);
  const start=await request('/api/trivia/duel/start',raw[0].userId,{roomId:created.roomId});assert.equal(start.opponent,'Борис');
  router._duelRooms.set('LEGACY',{roomId:'LEGACY',createdAt:Date.now(),status:'finished',questions:[{}],players:Object.fromEntries(raw.map(p=>[p.userId,p]))});
  router._duelHistory.push({roomId:'LEGACY',finishedAt:Date.now(),players:raw.map(p=>({...p,correctCount:1,totalQuestions:1})),winner:'PRIVATE_SYNTHETIC_HANDLE'});
  const status=await request('/api/trivia/duel/status/LEGACY',raw[0].userId);assert.deepEqual(status.players.map(p=>p.isSelf),[true,false]);assert.equal(status.winnerIndex,1);assert.equal(status.winner,'Лиса');
  const history=await request('/api/trivia/duel/history');assert.equal(history.entries[0].winner,'Лиса');assert.equal(history.entries[0].players[0].score,4);
  delete raw[0].publicProfile;delete raw[1].publicProfile;
  const old=await request('/api/trivia/duel/status/LEGACY?lang=ru');assert.ok(old.players.every(p=>p.displayName==='Игрок'));assert.equal(old.winner,'Игрок');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
