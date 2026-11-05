import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {BaseAdapter} from '../research/adapter.mjs';
import {ResearchService} from '../research/service.mjs';
import {researchProjectConfigs,createProjectResearchHandler} from '../research/projects.mjs';
import {createResearchHandler} from '../research/http.mjs';

const root=path.resolve(import.meta.dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'research/config.json'),'utf8'));
const source=JSON.parse(fs.readFileSync(process.env.RESEARCH_PREVIEW_SOURCE,'utf8'));
const settings=JSON.parse(fs.readFileSync(path.join(root,'.runtime/research/app-settings.json'),'utf8'));
if(settings.appId!=='cli_aa547c8de6785ce2')throw Error('预览需要项目绑定的定盘星应用。');
process.env.FEISHU_APP_ID=settings.appId;process.env.FEISHU_APP_SECRET=settings.appSecret;
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'research-upgrade-preview-'));
class PreviewBase extends BaseAdapter {
 constructor(config){super(config);this.rows=Object.fromEntries(Object.entries(source).map(([k,v])=>[k,structuredClone(v.rows)]));this.files=new Map();}
 async list(table){return this.normalizeSubjects(table,structuredClone(this.rows[table]));}
 async create(table,fields){const recordId='recPreview'+randomUUID().replaceAll('-','');this.rows[table].push({...structuredClone(fields),recordId});return recordId;}
 async update(table,id,fields){const row=this.rows[table].find(r=>r.recordId===id);if(!row)throw Error('预览记录不存在。');Object.assign(row,structuredClone(fields));}
 async ensureDeletionField(){}
 async upload(recordId,file){const token='preview-'+randomUUID();this.files.set(token,file);this.rows.evidence.find(e=>e.recordId===recordId).附件=[{file_token:token,name:path.basename(file),size:fs.statSync(file).size}];}
 async download(recordId,token,file){if(this.files.has(token))fs.copyFileSync(this.files.get(token),file);else await new BaseAdapter(this.config).download(recordId,token,file);}
 async recordUrl(){return config.baseUrl;}
}
const services={};
for(const [key,c]of Object.entries(researchProjectConfigs(config))){const service=new ResearchService({dir:path.join(temporary,key),base:new PreviewBase(c),baseUrl:c.baseUrl,project:c.project,binding:c.binding,autoRun:false});services[key]=service;await service.init();await service.refresh();service.autoRun=true;}
const projectOptions=()=>Object.values(services).map(s=>({...s.project,categories:s.snapshot().categories}));
const handle=createProjectResearchHandler({defaultProject:config.defaultProject,handlers:Object.fromEntries(Object.entries(services).map(([key,service])=>[key,createResearchHandler({root,service,projectOptions})]))});
let closing=false;
const server=createServer(async(req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 if(route==='/__preview/shutdown'&&req.method==='POST'){res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true}');setTimeout(close,20);return;}
 if(route==='/api/auth/session'){res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true,"authenticated":false}');return;}
 try{
  if(await handle(req,res))return;
  if(!/^\/(src|assets)\/[\w./-]+\.(js|css|svg|png)$/.test(route)){res.writeHead(404).end();return;}
  const file=path.resolve(root,'.'+route);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]});fs.createReadStream(file).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end('{"ok":false,"error":"预览请求失败。"}');}
});
server.listen(Number(process.env.PREVIEW_PORT||59102),'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,temporary,realFeishuWrites:0,pid:process.pid})));
async function close(){if(closing)return;closing=true;server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));for(const s of Object.values(services))await s.close();const target=path.resolve(temporary);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep+'research-upgrade-preview-'))throw Error('临时目录边界错误');fs.rmSync(target,{recursive:true,force:true});process.exit(0);}
process.once('SIGINT',close);process.once('SIGTERM',close);
