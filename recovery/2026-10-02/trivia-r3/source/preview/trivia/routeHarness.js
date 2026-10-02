/** Express-free in-memory dispatch. Final route handlers are unchanged server source. */
export function makeRouteTable() {
 const routes=[];
 const router={routes};
 for(const method of ['get','post'])router[method]=(path,...handlers)=>{routes.push({method:method.toUpperCase(),path,handle:handlers.at(-1)});return router;};
 router.dispatch=async(path,body,user)=>{
  const url=new URL(path,'http://local.invalid'),method=body===undefined?'GET':'POST';
  for(const route of routes){const names=[];const pattern=route.path.replace(/:([A-Za-z]+)/g,(_,name)=>{names.push(name);return '([^/]+)';});const match=url.pathname.match(new RegExp(`^${pattern}$`));if(!match||route.method!==method)continue;
   const req={body:body||{},query:Object.fromEntries(url.searchParams),params:Object.fromEntries(names.map((name,i)=>[name,decodeURIComponent(match[i+1])])),previewUser:user};let status=200,result;
   const res={status(value){status=value;return this;},json(value){result=value;return this;}};
   await route.handle(req,res);return {...structuredClone(result),...(status===200?{}:{_httpStatus:status})};
  }
  return {error:'TRIVIA_PREVIEW_ENDPOINT_BLOCKED',_httpStatus:404};
 };
 return router;
}
