/** Must run before importing/initializing database code. Deliberately rejects every remote DB. */
export function assertDisposableMergeDatabase(env=process.env){
  if(env.MERGE_LAB_PG_TEST!=='1')throw new Error('Real Merge DB suite requires MERGE_LAB_PG_TEST=1');
  if(env.CI!=='true'||env.NODE_ENV!=='test')throw new Error('Real Merge DB suite requires CI=true and NODE_ENV=test');
  let url;try{url=new URL(env.DATABASE_URL);}catch{throw new Error('A disposable local DATABASE_URL is required');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.port!=='5432'||url.pathname!=='/ccgh_merge_ci'||url.username!=='ccgh_merge_ci'||url.search||url.hash)throw new Error('Refusing database: expected local port5432, user/database ccgh_merge_ci, no URL options');
  if(env.REDIS_URL)throw new Error('Redis must be disabled for the isolated persistence suite');
  return {host:url.hostname,port:5432,database:'ccgh_merge_ci',user:'ccgh_merge_ci'};
}
export function assertFixturePlayerId(id){if(typeof id!=='string'||!/^merge_pg_[a-z0-9-]+$/.test(id))throw new Error('Only generated merge_pg_ fixture accounts are permitted');return id;}
