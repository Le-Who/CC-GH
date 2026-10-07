export function guard(){
 if(process.env.NODE_ENV!=='test'||process.env.YARD_SAVED_VISIT_PG!=='1'
  ||process.env.DATABASE_URL!=='postgres://ccgh_visit_test@127.0.0.1:55437/ccgh_visit_test'
  ||process.env.REDIS_URL||process.env.NODE_OPTIONS||Object.keys(process.env).some(k=>/^PG(HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|OPTIONS)$/.test(k)))throw Error('DISPOSABLE_PG_TARGET_REQUIRED');
}
export function ownerGuard(owner){if(typeof owner!=='string'||!/^yard_visit_pg_[0-9a-f-]{36}$/.test(owner))throw Error('DISPOSABLE_OWNER_REQUIRED');}
export async function verify(sql){const [row]=await sql`select current_database() as database, current_user as username, current_setting('server_version_num') as version`;
 if(row.database!=='ccgh_visit_test'||row.username!=='ccgh_visit_test'||Number(row.version)<170000||Number(row.version)>=180000)throw Error('DISPOSABLE_DATABASE_IDENTITY_MISMATCH');return row;}
