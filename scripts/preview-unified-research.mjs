import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {BaseAdapter} from '../research/adapter.mjs';
import {ResearchService} from '../research/service.mjs';
import {createResearchHandler} from '../research/http.mjs';
import {createProjectResearchHandler} from '../research/projects.mjs';
const root=path.resolve(import.meta.dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'overseas-ui-preview-'));
class PreviewBase extends BaseAdapter{
 constructor(raw){super({tables:Object.fromEntries(['questions','findings','evidence','topics'].map(k=>[k,k]))});this.rows=structuredClone(raw);}
 async cli(command,args){
  const table=args[args.indexOf('--table-id')+1],rows=this.rows[table];
  if(command==='+record-list'){const offset=Number(args[args.indexOf('--offset')+1]),limit=Number(args[args.indexOf('--limit')+1]),page=rows.slice(offset,offset+limit),fields=[...new Set(rows.flatMap(r=>Object.keys(r).filter(k=>k!=='recordId')))];return {fields,data:page.map(r=>fields.map(f=>r[f]??null)),record_id_list:page.map(r=>r.recordId),has_more:offset+limit<rows.length};}
  if(command==='+record-upsert'){const fields=JSON.parse(args[args.indexOf('--json')+1]),index=args.indexOf('--record-id');let id=index<0?'preview-'+crypto.randomUUID():args[index+1];if(index<0)rows.push({recordId:id,...fields});else Object.assign(rows.find(r=>r.recordId===id),fields);return {record:{record_id_list:[id]}};}
  throw Error('Preview does not perform external operations.');
 }
}
const services={};
for(const key of ['thailand','malaysia']){
 const cache=JSON.parse(fs.readFileSync(path.join(root,'.runtime/research/projects',key,'state.json'),'utf8')).cache;
 const service=new ResearchService({dir:path.join(temporary,key),base:new PreviewBase(cache.raw),autoRun:false,project:{key,name:key==='thailand'?'泰国项目':'马来项目'},baseUrl:'https://vnet.feishu.cn/base/CID8b8V7CaCtKesWGFKcHTdqnlc?table=preview'});
 services[key]=service;await service.init();await service.refresh();service.autoRun=true;
}
const projectOptions=()=>Object.values(services).map(s=>({...s.project,categories:s.snapshot().categories}));
const handle=createProjectResearchHandler({defaultProject:'malaysia',handlers:Object.fromEntries(Object.entries(services).map(([key,service])=>[key,createResearchHandler({root,service,projectOptions})]))});
const server=createServer(async(req,res)=>{
 if(req.url==='/__preview/shutdown'&&req.method==='POST'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));setTimeout(close,20);return;}
 try{if(await handle(req,res))return;const route=new URL(req.url,'http://localhost').pathname;if(!route.startsWith('/src/')&&!route.startsWith('/assets/')){res.writeHead(404).end();return;}const file=path.resolve(root,'.'+route);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];if(!mime){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime});fs.createReadStream(file).pipe(res);}catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:'Preview request failed.'}));}
});
const port=Number(process.env.PREVIEW_PORT||59101);server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+port,temporary,pid:process.pid,realFeishuWrites:0})));
async function close(){server.closeIdleConnections();await new Promise(r=>server.close(r));for(const service of Object.values(services))await service.close();if(!temporary.startsWith(path.resolve(os.tmpdir())+path.sep+'overseas-ui-preview-'))throw Error('Unsafe cleanup');fs.rmSync(temporary,{recursive:true,force:true});process.exit(0);}
process.once('SIGINT',close);process.once('SIGTERM',close);
