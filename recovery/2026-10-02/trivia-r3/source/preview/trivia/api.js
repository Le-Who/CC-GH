import {createAuthoritativeTriviaRoutes} from 'virtual:trivia-server-core';
import {createTriviaBackend} from './backend.js';
const fixture=typeof window==='undefined'?'progress':new URL(window.location.href).searchParams.get('fixture');
const backend=createTriviaBackend({createRoutes:createAuthoritativeTriviaRoutes,fixture});
export const api=(path,body)=>backend.request(path,body);
export const getPublicConfig=()=>api('/api/config');
export async function getAuthHeader(){return '';}
export function createBatcher(){return api;}
