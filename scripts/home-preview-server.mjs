import {createServer} from 'vite';
import {realpathSync} from 'node:fs';
const port=Number(process.env.HOME_PREVIEW_PORT||3315),apiPort=Number(process.env.HOME_API_PORT||3314);
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/output/**']},fs:{allow:[process.cwd(),realpathSync('node_modules')]},proxy:{'/api':{target:`http://127.0.0.1:${apiPort}`},'/socket.io':{target:`http://127.0.0.1:${apiPort}`,ws:true}}}});
await server.listen();
