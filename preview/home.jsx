import React from 'react';
import {createRoot} from 'react-dom/client';
import {HomeCatalogue} from '../src/app/HomeCatalogue.jsx';
import {appTranslate} from '../src/app/i18n.jsx';
import '../src/fonts.css';
const language=new URLSearchParams(location.search).get('lang')||'en';
createRoot(document.getElementById('root')).render(<HomeCatalogue language={language} t={key=>appTranslate(language,key)} activeTab="garden" onClose={()=>{}} onSelect={()=>{}} profileName="Alex" resources={{gold:1240,energy:{current:8,max:10},gachaTokens:3}} settings={<button>Sound</button>}/>);
