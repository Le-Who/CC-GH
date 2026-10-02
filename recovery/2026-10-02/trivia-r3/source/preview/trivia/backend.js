import { createTriviaLifelineState } from '../../game-logic/hud-bonuses.js';
const LOCAL={userId:'local-reviewer',username:'Local player'},BOT={userId:'simulated-opponent',username:'SIMULATED OPPONENT'};
export const LONG_QUESTIONS=Array.from({length:5},(_,index)=>({id:1000+index,question:`${index + 1}. Как называется способ организации данных, при котором элемент, добавленный последним, извлекается первым, а доступ к остальным элементам выполняется последовательно через вершину структуры?`,correctAnswer:'Стек: структура данных с порядком «последним пришёл — первым вышел»',wrongAnswers:['Очередь: структура данных с порядком «первым пришёл — первым вышел»','Связный список: последовательность узлов, каждый из которых хранит ссылку на следующий','Ассоциативный массив: коллекция пар ключей и значений с поиском по ключу'],category:'Синтетический тест длинного текста',difficulty:'medium',points:20,timeLimit:15}));
export function createTriviaBackend({createRoutes,fixture='progress'}={}) {
 const players=new Map();const queues=new Map();let failed=false;let simulatedRoom='';let botStarted='';
 const player=user=>{if(!players.has(user.userId))players.set(user.userId,{username:user.username,resources:{gold:0,energy:{current:100,max:100,lastRegenTimestamp:Date.now()}},trivia:{totalScore:fixture==='starter'?0:840,bestStreak:fixture==='starter'?0:3,totalPlayed:0,totalCorrect:0,session:null}});return players.get(user.userId);};
 const withPlayerLock=(id,fn,username)=>{const job=(queues.get(id)||Promise.resolve()).then(()=>fn(player({userId:id,username})));queues.set(id,job.catch(()=>{}));return job;};
 const routes=createRoutes({withPlayerLock,resolveUser:req=>req.previewUser,questionBank:fixture==='long-text'?LONG_QUESTIONS:undefined});
 const dispatch=(path,body,user=LOCAL)=>routes.dispatch(path,body,user);
 const tag=value=>({...value,_offlinePreview:true,_previewNotice:'LOCAL TRIVIA SIMULATION: simulated opponent, memory only, no real users, rewards, authentication or saves.'});
 async function finishBot(id){if(botStarted===id)return;botStarted=id;await dispatch('/api/trivia/duel/start',{roomId:id},BOT);const room=routes._duelRooms.get(id);for(const [i,q]of(room?.questions||[]).entries())await dispatch('/api/trivia/duel/answer',{roomId:id,answer:i%2?q.wrongAnswers[0]:q.correctAnswer,timeMs:8000},BOT);}
 return {async request(path,body){
  if(path==='/api/config')return tag({devAuthEnabled:false,appVersion:'LOCAL SIMULATION',buildId:'trivia-local'});
  if(path==='/api/player/snapshot')return tag({resources:structuredClone(player(LOCAL).resources),trivia:{...structuredClone(player(LOCAL).trivia),session:undefined}});
  if(fixture==='retry-start'&&!failed&&path==='/api/trivia/start'){failed=true;return tag({error:'LOCAL_TEST_START_REJECTED',_httpStatus:503});}
  if(path==='/api/trivia/duel/join'&&body?.inviteCode==='DEMO'){const created=await dispatch('/api/trivia/duel/create',{difficulty:'medium'},BOT);if(created.error)return tag(created);simulatedRoom=created.roomId;body={...body,inviteCode:created.roomId};}
  if(path==='/api/trivia/duel/ready'){const room=routes._duelRooms.get(body?.roomId);if(room&&!room.players[BOT.userId])await dispatch('/api/trivia/duel/join',{inviteCode:body.roomId},BOT);await dispatch('/api/trivia/duel/ready',{roomId:body?.roomId},BOT);simulatedRoom=body?.roomId;}
  const result=await dispatch(path,body);
  if(path==='/api/trivia/duel/create'&&!result.error)simulatedRoom=result.roomId;
  if(path==='/api/trivia/duel/answer'&&result.isComplete)await finishBot(simulatedRoom);
  if(fixture==='uncertain-answer'&&!failed&&path==='/api/trivia/answer'){failed=true;return tag({error:'TIMEOUT'});}
  return tag(result);
 },getInspection:()=>({players,rooms:routes._duelRooms,history:routes._duelHistory,lifelines:createTriviaLifelineState()})};
}
