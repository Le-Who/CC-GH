/** React/Lucide/audio shape stubs for pure component-tree checks; NOT a browser/render test. */
import {registerHooks} from 'node:module';
const icons=['BookOpen','ChevronLeft','CircleQuestionMark','FlaskConical','House','Leaf','PackageOpen','Pause','Search','Sparkles','Star','Volume2','VolumeX','X'];
const sources={
 react:`export const Fragment='fragment';export const useState=init=>[typeof init==='function'?init():init,()=>{}];export const useMemo=fn=>fn();export const useRef=current=>({current});export const useCallback=fn=>fn;export const useEffect=()=>{};export const useId=()=> 'test-dialog';`,
 jsx:`export const Fragment='fragment';export const jsx=(type,props,key)=>typeof type==='function'?type(props):({type,props:props||{},key});export const jsxs=jsx;`,
 icons:icons.map(name=>`export const ${name}=props=>({type:'icon:${name}',props});`).join('\n'),
 audio:`export const audioManager={isEnabled:()=>false,play:async()=>{},setEnabled:async()=>{},toggle:async()=>false};`,
};
registerHooks({resolve(specifier,context,next){const key=specifier==='react'?'react':specifier==='react/jsx-runtime'?'jsx':specifier==='lucide-react'?'icons':specifier.endsWith('/audioManager.js')?'audio':null;return key?{shortCircuit:true,url:'merge-ui-test:'+key}:next(specifier,context);},load(url,context,next){return url.startsWith('merge-ui-test:')?{shortCircuit:true,format:'module',source:sources[url.slice('merge-ui-test:'.length)]}:next(url,context);}});
