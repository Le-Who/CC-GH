import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHomeHistoryLayer, installHomeHistoryGuard, markHomeHistoryEntry} from '../../src/app/homeHistory.js';
import {isHomeLeaveReady, leaveGameForHome} from '../../src/app/homeNavigation.js';
const require=createRequire(import.meta.url);
const {extract}=require('../../recovery-tools/ast-recovery.cjs');

// A same-document history model with native listener capture ownership and
// asynchronous traversal. It is not a browser, renderer or database substitute.
export function historyTarget(url='https://example.test/?tab=blox') {
  const entries=[{state:{unrelated:'preserve'},url}],listeners=[];let index=0;
  const target={location:new URL(url),sessionStorage:{setItem(){}},entries,listeners,
    addEventListener(name,fn,capture=false){if(!listeners.some(x=>x.name===name&&x.fn===fn&&x.capture===!!capture))listeners.push({name,fn,capture:!!capture});},
    removeEventListener(name,fn,capture=false){const i=listeners.findIndex(x=>x.name===name&&x.fn===fn&&x.capture===!!capture);if(i>=0)listeners.splice(i,1);},
  };
  function navigate(next) {
    if(next<0||next>=entries.length)return;
    index=next;target.location=new URL(entries[index].url);let stopped=false;
    const event={state:entries[index].state,stopImmediatePropagation(){stopped=true;}};
    for(const listener of [...listeners].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(listener.name==='popstate')listener.fn(event);if(stopped)break;}
  }
  target.history={get state(){return entries[index].state;},get length(){return entries.length;},
    pushState(state,title,url){entries.splice(index+1);entries.push({state,url:new URL(url,target.location).href});index++;target.location=new URL(entries[index].url);},
    replaceState(state,title,url){entries[index]={state,url:new URL(url,target.location).href};target.location=new URL(entries[index].url);},
    back(){queueMicrotask(()=>navigate(index-1));},forward(){queueMicrotask(()=>navigate(index+1));},
  };
  return target;
}
export const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
export function homeWorkflow({state,controls=null,target=historyTarget()}={}) {
  const source=readFileSync(new URL('../../src/App.jsx',import.meta.url),'utf8');
  const start=source.indexOf('const selectHomeGame = useCallback(')+'const selectHomeGame = useCallback('.length;
  const end=source.indexOf(', [closeHome, openCatalogue, setActiveTab]);',start);
  if(start<0||end<start)throw Error('Home switch callback source changed');
  let current={...state,activeGameShell:controls},homeOpen=false,selectionCount=0,error='',switching=false;
  const switchLock={current:false},homeHistory={current:null};
  const persist=vm.runInNewContext('('+extract(new URL('../../src/game-state/useGameHub.js',import.meta.url),['persistActiveTab'])+')',{window:target,URL,ACTIVE_TAB_STORAGE_KEY:'game_hub_active_tab_v1',ACTIVE_TAB_QUERY_PARAM:'tab'});
  const openCatalogue=()=>{if(homeHistory.current)return;homeOpen=true;homeHistory.current=createHomeHistoryLayer(target,()=>{homeHistory.current=null;homeOpen=false;},()=>switchLock.current);};
  const closeHome=async()=>{if(switchLock.current)return;await homeHistory.current?.close();homeHistory.current=null;homeOpen=false;};
  const stopGuard=installHomeHistoryGuard(target,()=>current.activeTab);
  const select=vm.runInNewContext('('+source.slice(start,end)+')',{
    switchLock,homeHistory,window:target,VISIBLE_GAME_IDS:['garden','blox','match3','merge','bubbo','trivia','room','settlement'],
    useGameHub:{getState:()=>current},closeHome,openCatalogue,isHomeLeaveReady,leaveGameForHome,markHomeHistoryEntry,
    setSwitching:value=>switching=value,setSwitchError:value=>error=value,setHomeOpen:value=>homeOpen=value,
    setActiveTab:id=>{selectionCount++;persist(id);current={...current,activeTab:id,activeGameShell:null};},haptic(){},audioManager:{play(){}},
  });
  return {target,open:openCatalogue,close:closeHome,select,stopGuard,homeHistory,
    get state(){return current;},update(patch){current={...current,...patch};},
    get homeOpen(){return homeOpen;},get selectionCount(){return selectionCount;},get switching(){return switching;},get error(){return error;},
  };
}
