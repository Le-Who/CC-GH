export function assertDisposableGardenDatabase(env=process.env){
  if(env.GARDEN_ACCOUNTING_PG_TEST!=='1'||env.CI!=='true'||env.NODE_ENV!=='test')throw Error('Garden PG gate requires explicit opt-in, CI=true, NODE_ENV=test');
  let url;try{url=new URL(env.DATABASE_URL);}catch{throw Error('Disposable local DATABASE_URL required');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ccgh_merge_ci'||url.username!=='ccgh_merge_ci'||url.search||url.hash||env.REDIS_URL)throw Error('Refusing non-disposable Garden database');
  return url;
}
export function assertGardenFixtureId(id){if(!/^garden_accounting_pg_[a-z0-9-]+$/.test(id||''))throw Error('Only generated Garden accounting fixture IDs may be touched');return id;}
