import assert from 'node:assert/strict';
/** Normal Home navigation may write ?tab=room and preserve Telegram/auth data.
 * The invariant is absence of preview/test entry switches, not an empty query.
 * Reuse this helper when authoring ordinary Yard app/browser coverage. */
export function assertNormalYardRoute(href){
 const url=new URL(href),flags=[];
 const forbidden=key=>/^yard(?:pippreview|pipgrounding|canonicalfood)$/i.test(key)||/(?:preview|fixture|test|debug)/i.test(key)||/^qa(?:$|[_-])/i.test(key);
 for(const [source,params] of [['query',url.searchParams],['hash',new URLSearchParams(url.hash.slice(1))]])for(const key of params.keys())if(forbidden(key))flags.push({source,key});
 assert.deepEqual(flags,[],'Ordinary Yard route must not use preview/test flags');
 const tabs=url.searchParams.getAll('tab');assert.ok(tabs.length<=1&&(!tabs.length||tabs[0]==='room'),'Expected ordinary Yard tab routing');
 return{pathname:url.pathname,tab:tabs[0]??null,queryKeys:[...url.searchParams.keys()],hashKeys:[...new URLSearchParams(url.hash.slice(1)).keys()],previewOrTestFlags:false};
}
