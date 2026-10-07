/** The existing build harness deliberately builds with NODE_ENV=production.
 * That build sees unchanged source. Only its test server/seed subprocesses
 * register the established source-gate loader; no HTTP flag can do so. */
import {register} from 'node:module';
if(process.env.NODE_ENV==='test'){
 if(process.env.YARD_SAVED_VISIT_PG!=='1'||process.env.DEV_AUTH_ENABLED!=='true')throw Error('DISPOSABLE_BACKEND_TEST_REQUIRED');
 const db=new URL(process.env.DATABASE_URL||'invalid:');
 if(db.protocol!=='postgres:'||db.hostname!=='127.0.0.1'||db.port!=='55437'||db.username!=='ccgh_visit_test'
  ||db.pathname!=='/ccgh_visit_test'||db.password||db.search||db.hash||process.env.REDIS_URL)throw Error('ONLY_DISPOSABLE_CI_POSTGRES_ALLOWED');
 register('./runtime-test-loader.mjs',import.meta.url);
}
