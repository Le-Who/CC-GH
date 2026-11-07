import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const source = new URL('../src/app/ProfileNickname.jsx', import.meta.url).pathname;
const compiled = await build({entryPoints:[source],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'controlled-react-and-transport',setup(builder){
  builder.onResolve({filter:/^(react(?:\/jsx-runtime)?|\.\.\/services\/apiClient\.js|\.\.\/game-state\/useGameHub\.js|\.\/profile-nickname\.css)$/},args=>({path:args.path,namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='react' ? `const h=globalThis.__profileFence; export const useEffect=h.useEffect,useId=()=>"nickname",useRef=h.useRef,useState=h.useState;` : args.path==='react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;' : args.path.includes('apiClient') ? 'export const api=(...args)=>globalThis.__profileFence.api(...args);' : args.path.includes('useGameHub') ? 'export const useGameHub={getState:()=>({accountSession:globalThis.__profileFence.accountSession})};' : ''}));
}}]});

function harness() {
 const slots=[];let index=0;const effects=[];const requests=[];const sent=[];const names=[];
 const h={accountSession:'A',useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=value;}];},useRef(initial){const i=index++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(effect){index++;if(!effects.length)effects.push(effect);},api(path,body,options){return new Promise(resolve=>requests.push({path,body,options,resolve}));}};
 globalThis.__profileFence=h;
 return {h,slots,requests,sent,names,begin(){index=0;},mountEffect(){effects[0]();},release(request,result){if(request.body && request.options.isCurrent())sent.push(request.body);request.resolve(request.options.isCurrent()?result:{error:'ACCOUNT_CHANGED'});}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('real profile component rejects old GET reply after store switch before effect cleanup',async()=>{
 const f=harness();const {ProfileNickname}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text+'\n// get-case').toString('base64')}`);
 f.begin();ProfileNickname({accountSession:'A',onDisplayName:name=>f.names.push(name)});f.mountEffect();
 const old=f.requests[0];assert.equal(old.options.isCurrent(),true);
 f.h.accountSession='B'; // No React re-render or effect cleanup yet.
 assert.equal(old.options.isCurrent(),false,'store retirement must synchronously close the old request fence');
 old.resolve({nickname:'Old nickname',displayName:'Old nickname'});await flush();
 assert.deepEqual(f.names,[]);assert.equal(f.slots.includes('Old nickname'),false);
});

test('real profile component cannot send or apply old nickname when account changes during auth resolution',async()=>{
 const f=harness();const {ProfileNickname}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text+'\n// post-case').toString('base64')}`);
 const props={accountSession:'A',onDisplayName:name=>f.names.push(name)};
 f.begin();ProfileNickname(props);f.mountEffect();f.release(f.requests[0],{nickname:'',displayName:'Анна'});await flush();
 f.begin();let form=ProfileNickname(props);const input=form.props.children.find(node=>node.type==='input');input.props.onChange({target:{value:'Choice from account A'}});
 f.begin();form=ProfileNickname(props);form.props.onSubmit({preventDefault(){}});
 const old=f.requests[1];assert.equal(old.body.nickname,'Choice from account A');assert.equal(old.options.isCurrent(),true);
 f.h.accountSession='B';assert.equal(old.options.isCurrent(),false);
 f.release(old,{nickname:'Choice from account A',displayName:'Choice from account A'});await flush();
 assert.deepEqual(f.sent,[],'auth-resolution continuation must not send old intent under new account');
 assert.deepEqual(f.names,['Анна'],'old save reply must not set the next account profile name');
});
