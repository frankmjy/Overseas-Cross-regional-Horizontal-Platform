import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/model.mjs',['model.mjs','text/javascript; charset=utf-8']],['/styles.css',['styles.css','text/css; charset=utf-8']],['/data.json',['data.json','application/json; charset=utf-8']],['/logo.png',['../assets/vnet-official-logo.png','image/png']],['/favicon.svg',['../assets/vnet-favicon.svg','image/svg+xml']]]);
export function createPreviewServer(){return createServer(async(req,res)=>{
 const path=new URL(req.url||'/','http://localhost').pathname,entry=files.get(path);
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end();return;}
 if(!entry){res.writeHead(404,headers);res.end('Not found');return;}
 try{const bytes=await readFile(new URL(entry[0],import.meta.url));res.writeHead(200,{...headers,'Content-Type':entry[1],'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(503,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end('预览文件尚未准备好。');}
 });}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const port=Number(process.env.SAMPLES_PORT||4178);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');
 const server=createPreviewServer();server.on('error',e=>{console.error('预览未启动：'+e.code);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`页面样板：http://127.0.0.1:${port}/`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
