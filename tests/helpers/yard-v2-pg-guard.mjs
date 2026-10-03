/** Fail closed before importing application/database modules. No local setup. */
export function assertDisposableYardV2Database(env = process.env) {
  if (env.YARD_V2_PG_TEST !== '1' || env.CI !== 'true' || env.NODE_ENV !== 'test') {
    throw new Error('Yard v2 PG gate requires explicit opt-in, CI=true, NODE_ENV=test');
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error('Disposable local DATABASE_URL required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.port !== '5432' || url.pathname !== '/ccgh_merge_ci'
      || url.username !== 'ccgh_merge_ci' || url.password !== 'ccgh_merge_ci'
      || url.search || url.hash || env.REDIS_URL || env.NODE_OPTIONS) {
    throw new Error('Refusing non-disposable Yard v2 database or injected runtime options');
  }
  if (!['integrated', 'candidate'].includes(env.YARD_V2_PG_TARGET)) {
    throw new Error('Choose YARD_V2_PG_TARGET=integrated or candidate explicitly');
  }
  if (env.YARD_V2_PG_TARGET === 'candidate' && env.YARD_CANDIDATE_CI !== '1') {
    throw new Error('Candidate target requires YARD_CANDIDATE_CI=1');
  }
  if (env.YARD_V2_PG_TARGET === 'integrated' && env.YARD_CANDIDATE_CI) {
    throw new Error('Integrated gate must not use candidate overlays');
  }
  return url;
}

export function assertYardV2FixtureId(id) {
  if (typeof id !== 'string' || id.length !== 'yard_v2_pg_'.length + 36
      || !/^yard_v2_pg_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
    throw new Error('Only generated Yard v2 PostgreSQL fixture IDs may be touched');
  }
  return id;
}

export async function loadYardV2PgTarget() {
  assertDisposableYardV2Database();
  if (process.env.YARD_V2_PG_TARGET === 'candidate') {
    const { verifyProductionUntouched } = await import('../../preview/yard-persistent-candidate/verify-production.mjs');
    verifyProductionUntouched(); // Explicit rebase required; never bypass a stale base contract.
    await import('../../preview/yard-persistent-candidate/load-overlays.mjs');
  }
  // No dependency substitutes, mock SQL, test service policies or memory fallback.
}
