import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leaveGameForHome} from '../src/app/homeNavigation.js';
const state={activeTab:'garden',snapshot:{player:{id:'A'}},busy:{},pendingActions:[],outboxLoaded:true,outboxAccountId:'A'};
test('a game must acknowledge leave before its caller can switch',async()=>{
 let acknowledge,settled=false;const receipt=new Promise(resolve=>acknowledge=resolve);
 const leave=leaveGameForHome({state,accountId:'A',controls:{activeRun:true,safeLeave:()=>receipt}}).then(result=>{settled=true;return result});
 await Promise.resolve();assert.equal(settled,false);acknowledge(true);assert.equal(await leave,true);
});
test('pending, failed outbox, foreign account and missing active-run leave keep the game mounted',async()=>{
 for(const candidate of [{...state,busy:{save:true}},{...state,pendingActions:[{status:'failed'}]},{...state,snapshot:{player:{id:'B'}}}])assert.equal(await leaveGameForHome({state:candidate,accountId:'A',controls:{safeLeave:async()=>true}}),false);
 assert.equal(await leaveGameForHome({state,accountId:'A',controls:{activeRun:true}}),false);
 assert.equal(await leaveGameForHome({state,accountId:'A',controls:{safeLeave:async()=>false}}),false);
 for(const candidate of [{...state,outboxLoaded:false},{...state,outboxStorageError:'READ_FAILED'},{...state,outboxAccountId:'B'},{...state,retainedLegacyOutbox:[{action:'unknown'}]}])assert.equal(await leaveGameForHome({state:candidate,accountId:'A',controls:{safeLeave:async()=>true}}),false);
 assert.equal(await leaveGameForHome({state:{...state,activeTab:'blox'},accountId:'A',controls:null}),false);
 assert.equal(await leaveGameForHome({state:{...state,activeTab:'blox',snapshot:{...state.snapshot,blox:{activeGame:true}}},accountId:'A',controls:{id:'blox',activeRun:false,safeLeave:async()=>true}}),false);
 for(const id of ['bubbo','match3'])assert.equal(await leaveGameForHome({state:{...state,activeTab:id,snapshot:{...state.snapshot,[id]:{currentGame:{score:10}}}},accountId:'A',controls:{id,activeRun:false,safeLeave:async()=>true}}),false);
 assert.equal(await leaveGameForHome({state,accountId:'A',controls:{hasPendingActions:true,safeLeave:async()=>true}}),false);
});
test('persistent games can leave only after the shared store has settled',async()=>{
 assert.equal(await leaveGameForHome({state,accountId:'A',controls:{activeRun:false}}),true);
 assert.equal(await leaveGameForHome({state,accountId:'A',controls:{canLeave:()=>false}}),false);
});

import {createHomeHistoryLayer, installHomeHistoryGuard} from '../src/app/homeHistory.js';
import {historyTarget, homeWorkflow, tick} from './helpers/homeHistoryHarness.js';
const ownedState=()=>({...state,activeTab:'blox',accountSession:{},snapshot:{player:{id:'A'},blox:{activeGame:true}}});
function assertMountedUrl(workflow) {
 const fromUrl=workflow.target.location.searchParams.get('tab')||'garden';
 assert.equal(fromUrl,workflow.state.activeTab);assert.equal(workflow.target.history.state.unrelated,'preserve');
}
test('successful Home switch waits for acknowledgement and Forward/reload retain the mounted game URL',async()=>{
 let release;const receipt=new Promise(resolve=>release=resolve);
 const workflow=homeWorkflow({state:ownedState(),controls:{id:'blox',activeRun:true,safeLeave:()=>receipt}});
 workflow.open();const switching=workflow.select('garden');await tick();
 assert.equal(workflow.selectionCount,0);assert.equal(workflow.homeOpen,true);assert.equal(workflow.switching,true);
 release(true);await switching;assert.equal(workflow.selectionCount,1);assert.equal(workflow.homeOpen,false);assertMountedUrl(workflow);
 workflow.target.history.forward();await tick();assertMountedUrl(workflow);assert.equal(workflow.homeOpen,false);assert.equal(workflow.selectionCount,1);
 workflow.target.history.back();await tick();assertMountedUrl(workflow);workflow.stopGuard();assert.equal(workflow.target.listeners.length,0);
});
test('failed or rejected leave preserves the game, and dismissed Home Forward cannot select a target',async()=>{
 for(const safeLeave of [async()=>false,async()=>{throw Error('SAVE_FAILED');}]) {
  const workflow=homeWorkflow({state:ownedState(),controls:{id:'blox',activeRun:true,safeLeave}});
  workflow.open();await workflow.select('garden');assert.equal(workflow.homeOpen,true);assert.equal(workflow.error,'leave-failed');assert.equal(workflow.selectionCount,0);
  workflow.target.history.back();await tick();assert.equal(workflow.homeOpen,false);workflow.target.history.forward();await tick();assertMountedUrl(workflow);assert.equal(workflow.selectionCount,0);workflow.stopGuard();
 }
});
test('busy, pending and unavailable storage block Home switching without invoking leave or history retirement',async()=>{
 for(const patch of [{busy:{save:true}},{pendingActions:[{status:'failed'}]},{outboxLoaded:false},{outboxStorageError:'OUTBOX_STORAGE_UNAVAILABLE'}]) {
  let leaves=0;const workflow=homeWorkflow({state:{...ownedState(),...patch},controls:{id:'blox',activeRun:true,safeLeave:async()=>{leaves++;return true;}}});
  workflow.open();await workflow.select('garden');assert.equal(leaves,0);assert.equal(workflow.selectionCount,0);assert.equal(workflow.homeOpen,true);assertMountedUrl(workflow);await workflow.close();workflow.stopGuard();
 }
});
test('account-session changes during leave cannot commit a target or stale Forward URL',async()=>{
 let release;const receipt=new Promise(resolve=>release=resolve);
 const workflow=homeWorkflow({state:ownedState(),controls:{id:'blox',activeRun:true,safeLeave:()=>receipt}});
 workflow.open();const switching=workflow.select('garden');await tick();workflow.update({accountSession:{}});release(true);await switching;
 assert.equal(workflow.selectionCount,0);assert.equal(workflow.homeOpen,true);await workflow.close();workflow.target.history.forward();await tick();assertMountedUrl(workflow);workflow.stopGuard();
});
test('repeated Home close/Back/Forward and later switches keep every owned history entry on the mounted game',async()=>{
 const workflow=homeWorkflow({state:{...ownedState(),snapshot:{player:{id:'A'}}},controls:{id:'blox',activeRun:false,safeLeave:async()=>true}});
 for(const id of ['garden','match3','bubbo','trivia']) {
  if(workflow.state.activeTab!=='garden')workflow.update({activeGameShell:{id:workflow.state.activeTab,activeRun:false,safeLeave:async()=>true}});
  workflow.open();await workflow.select(id);assertMountedUrl(workflow);
  workflow.target.history.forward();await tick();assertMountedUrl(workflow);
  for(let i=0;i<2;i++){workflow.open();await workflow.close();workflow.target.history.forward();await tick();assertMountedUrl(workflow);workflow.target.history.back();await tick();assertMountedUrl(workflow);}
 }
 for(let i=0;i<workflow.target.history.length;i++){workflow.target.history.back();await tick();assertMountedUrl(workflow);}
 for(let i=0;i<workflow.target.history.length;i++){workflow.target.history.forward();await tick();assertMountedUrl(workflow);}
 workflow.stopGuard();assert.equal(workflow.target.listeners.length,0);
});
test('retired Home URL repair does not trap or rewrite unrelated history entries',async()=>{
 const target=historyTarget('https://example.test/?tab=blox#external');let events=0;
 const stop=installHomeHistoryGuard(target,()=> 'garden');target.addEventListener('popstate',()=>events++);
 target.history.pushState({external:'real-entry'},'','/?tab=trivia#other');target.history.back();await tick();
 assert.equal(target.location.href,'https://example.test/?tab=blox#external');assert.equal(target.history.state.unrelated,'preserve');assert.equal(events,1);
 target.history.forward();await tick();assert.equal(target.location.href,'https://example.test/?tab=trivia#other');assert.deepEqual(target.history.state,{external:'real-entry'});assert.equal(events,2);stop();
});
test('saving Back retains Home; close/dispose remove their exact captured listener',async()=>{
 const target=historyTarget();let locked=true,backs=0;const stop=installHomeHistoryGuard(target,()=> 'blox');
 const layer=createHomeHistoryLayer(target,()=>backs++,()=>locked);
 target.history.back();await tick();assert.equal(backs,0);assert.equal(target.listeners.length,2);assert.equal(target.history.state.__gameHubHome>0,true);
 locked=false;await layer.close();assert.equal(backs,0);assert.equal(target.listeners.length,1);
 for(let i=0;i<5;i++){const next=createHomeHistoryLayer(target,()=>backs++);target.history.back();await tick();assert.equal(target.listeners.length,1);next.dispose();}
 const last=createHomeHistoryLayer(target,()=>backs++);const pending=last.close();last.dispose();await pending;await tick();assert.equal(target.listeners.length,1);stop();assert.equal(target.listeners.length,0);
});


import { shouldDismissYardSettingsAfterHome } from '../src/games/companion-yard/homeReturn.js';
const readyYard = () => ({ ...state, activeTab: 'room', accountSession: {}, busy: {}, pendingActions: [] });
const yardReturn = (current, patch = {}) => ({ previous: { open: true, accountSession: current.accountSession, accountId: current.snapshot?.player?.id }, homeOpen: false, activeScreen: 'settings', state: current, ...patch });
test('settled same-account Home return dismisses only the retained Yard Settings launcher', () => {
 const current = readyYard(), input = yardReturn(current);
 assert.equal(shouldDismissYardSettingsAfterHome(input), true);
 for (const activeScreen of [null, 'food', 'goodies', 'companion']) assert.equal(shouldDismissYardSettingsAfterHome({ ...input, activeScreen }), false);
 assert.equal(shouldDismissYardSettingsAfterHome({ ...input, previous: { ...input.previous, open: false } }), false);
 assert.equal(shouldDismissYardSettingsAfterHome({ ...input, homeOpen: true }), false);
 assert.equal(shouldDismissYardSettingsAfterHome({ ...input, state: { ...current, activeTab: 'garden' } }), false);
});
test('failed switches, pending actions, failed storage and account changes preserve Yard Settings', () => {
 const current = readyYard(), input = yardReturn(current);
 for (const patch of [
  { busy: { mutate: true } }, { pendingActions: [{ status: 'sending' }] }, { pendingActions: [{ status: 'failed' }] },
  { outboxLoaded: false }, { outboxAccountId: 'B' }, { outboxStorageError: 'READ_FAILED' },
  { retainedLegacyOutbox: [{ action: 'yard.buyFood' }] }, { accountSession: {} }, { snapshot: { player: { id: 'B' } } }, { snapshot: { player: { id: 'B' } }, outboxAccountId: 'B' },
 ]) assert.equal(shouldDismissYardSettingsAfterHome({ ...input, state: { ...current, ...patch } }), false);
 const before = structuredClone(current);
 assert.equal(shouldDismissYardSettingsAfterHome({ ...input, homeOpen: true }), false);
 assert.deepEqual(current, before);
});
test('dismissed pending return is not reinterpreted as a new Home return after acknowledgement', () => {
 const current = readyYard();
 assert.equal(shouldDismissYardSettingsAfterHome(yardReturn({ ...current, pendingActions: [{ status: 'sending' }] })), false);
 assert.equal(shouldDismissYardSettingsAfterHome(yardReturn(current, { previous: { open: false, accountSession: current.accountSession, accountId: current.snapshot.player.id } })), false);
 assert.equal(shouldDismissYardSettingsAfterHome(yardReturn(current)), true);
});

test('A-to-B-to-A Home return cannot reuse the first account session intent', () => {
 const first = readyYard(), input = yardReturn(first);
 const second = { ...first, snapshot: { player: { id: 'B' } }, outboxAccountId: 'B', accountSession: {} };
 const restored = { ...first, accountSession: {} };
 assert.equal(shouldDismissYardSettingsAfterHome({ ...input, state: second }), false);
 assert.equal(shouldDismissYardSettingsAfterHome({ ...input, state: restored }), false);
 assert.equal(shouldDismissYardSettingsAfterHome(yardReturn(restored)), true);
});
