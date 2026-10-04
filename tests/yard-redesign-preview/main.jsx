import React from 'react';
import {createRoot} from 'react-dom/client';
import CourtyardGame from '../../src/games/companion-yard-v2/CourtyardGame.jsx';
import {fixtureScope} from './adapters.jsx';

const style=document.createElement('style');
style.textContent='html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}';
document.head.append(style);
document.documentElement.lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'ru';
document.body.dataset.fixtureScope=fixtureScope;
createRoot(document.getElementById('root')).render(<CourtyardGame/>);
