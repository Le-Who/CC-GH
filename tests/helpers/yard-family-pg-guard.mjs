import {assertDisposableYardV2Database} from './yard-v2-pg-guard.mjs';
/** Exact existing PostgreSQL15 CI service only; the production family gate stays closed. */
export function assertFamilyPgGate(env=process.env){
 if(env.YARD_FAMILY_PG_TEST!=='1')throw Error('Family PostgreSQL requires explicit YARD_FAMILY_PG_TEST=1');
 assertDisposableYardV2Database(env);
 if(env.YARD_V2_PG_TARGET!=='integrated')throw Error('Family PostgreSQL uses integrated source with no candidate overlays');
}
