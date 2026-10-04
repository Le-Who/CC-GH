import React from 'react';
import {createRoot} from 'react-dom/client';
import CourtyardGame from '../../src/games/companion-yard-v2/CourtyardGame.jsx';
import {fixtureScope} from './adapters.jsx';
import '../../src/fonts.css';

const style=document.createElement('style');
// The study Canvas draws the entire scene plate through its calibrated transform.
// No HUD, card, type, spacing or control CSS is recreated here.
style.textContent='html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}body[data-fixture-scope="'+fixtureScope+'"] .cy-background{display:none}';
document.head.append(style);
document.documentElement.lang='ru';
document.body.dataset.fixtureScope=fixtureScope;
createRoot(document.getElementById('root')).render(<CourtyardGame/>);
