import './register-real-backend-runtime.mjs';
import {register} from 'node:module';
// The imported guard rejects every non-disposable test target before this gate.
if(process.env.NODE_ENV==='test')register('./item-action-test-loader.mjs',import.meta.url);
