import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(){
 const listeners=[],cleanups=[];
 const window={addEventListener:(name,fn,capture=false)=>listeners.push({name,fn,capture}),removeEventListener:(name,fn,capture=false)=>{const i=listeners.findIndex(x=>x.name===name&&x.fn===fn&&x.capture===capture);if(i>=0)listeners.splice(i,1);}};
 const source=readFileSync(new URL('../src/app/useDismissableLayer.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function','function');
 const context={window,Event:{CAPTURING_PHASE:1},useEffect:fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);}};vm.createContext(context);vm.runInContext(source+'\nthis.useEscapeDismiss=useEscapeDismiss;',context);
 return {register:context.useEscapeDismiss,retire:()=>cleanups.pop()?.(),escape(){const event={key:'Escape',eventPhase:1,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const phase of [1,3]){event.eventPhase=phase;for(const listener of [...listeners])if(listener.name==='keydown'&&listener.capture===(phase===1)&&!event.stopped)listener.fn(event);}return event;}};
}
test('native dialog alone loses Escape to the Hub fallback, reproducing the CI failure',()=>{
 const h=harness();let home=false,panel=true;h.register(true,()=>{home=true;},{priority:-100});const event=h.escape();if(!event.defaultPrevented)panel=false;
 assert.equal(home,true);assert.equal(panel,true,'preventDefault suppresses native dialog cancel');
});
test('registered Yard panel closes before Home, then a later Escape can open Home',()=>{
 const h=harness();let home=false,panel=true;h.register(true,()=>{home=true;},{priority:-100});h.register(true,()=>{panel=false;});
 assert.equal(h.escape().defaultPrevented,true);assert.equal(panel,false);assert.equal(home,false);h.retire();h.escape();assert.equal(home,true);
 const courtyard=readFileSync(new URL('../src/games/companion-yard-v2/CourtyardGame.jsx',import.meta.url),'utf8');assert.match(courtyard,/useEscapeDismiss\(!!panel,closePanel\)/);assert.match(courtyard,/onCancel=\{closePanel\} onClose=\{closePanel\}/);
});
