/** Fail closed before importing any application/database modules. */
export function assertDisposableGardenR2Database(env = process.env) {
  if (env.GARDEN_R2_PG_TEST !== '1' || env.CI !== 'true' || env.NODE_ENV !== 'test') {
    throw new Error('Garden R2 PG gate requires explicit opt-in, CI=true, NODE_ENV=test');
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error('Disposable local DATABASE_URL required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.port !== '5432'
      || url.pathname !== '/ccgh_merge_ci'
      || url.username !== 'ccgh_merge_ci'
      || url.password !== 'ccgh_merge_ci'
      || url.search || url.hash || env.REDIS_URL || env.NODE_OPTIONS) {
    throw new Error('Refusing non-disposable Garden R2 database or injected runtime options');
  }
  return url;
}

export function assertGardenR2FixtureId(id) {
  if (typeof id !== 'string' || id.length !== 'garden_r2_pg_'.length + 36 || !/^garden_r2_pg_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw new Error('Only generated Garden R2 fixture IDs may be touched');
  }
  return id;
}
