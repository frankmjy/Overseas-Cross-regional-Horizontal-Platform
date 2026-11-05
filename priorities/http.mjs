import fs from 'node:fs';
import { failure,uuid } from './model.mjs';
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function bytes(req,limit){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw failure('提交内容超过大小限制。',413);chunks.push(chunk);}return Buffer.concat(chunks);}
async function input(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw failure('请使用 JSON 提交。',415);try{return JSON.parse((await bytes(req,180000)).toString('utf8'));}catch(e){if(e.status)throw e;throw failure('提交格式无效。');}}
export function createPriorityHandler(service){return async(req,res)=>{
 const url=new URL(req.url,'https://request.invalid');if(!url.pathname.startsWith('/api/priorities'))return false;
 try{
  if(!req.auth?.openId)throw failure('请先使用飞书登录。',401);
  if(!['GET','HEAD'].includes(req.method)){let origin;try{origin=new URL(req.headers.origin);}catch{}if(!origin||origin.host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')throw failure('不允许跨站提交。',403);}
  const project=url.searchParams.get('project')||'th-001';service.project(project);
  if(url.pathname==='/api/priorities'&&req.method==='GET'){if(!service.state.projects[project]||Date.now()-(service.state.projects[project].updatedAt||0)>60000)service.refresh(project).catch(()=>{});json(res,200,{ok:true,...service.snapshot(project,req.auth)});}
  else if(url.pathname==='/api/priorities'&&req.method==='POST'){const raw=await input(req);if(raw.project!==project)throw failure('项目范围不匹配。');json(res,202,{ok:true,...service.accept(raw,req.auth)});}
  else if(url.pathname==='/api/priorities/refresh'&&req.method==='POST'){service.refresh(project).catch(()=>{});json(res,202,{ok:true,...service.snapshot(project,req.auth)});}
  else if(url.pathname==='/api/priorities/retry'&&req.method==='POST'){const raw=await input(req);if(service.state.operations[raw.id]?.project!==project)throw failure('同步任务不存在。',404);json(res,202,{ok:true,operation:service.retry(raw.id,req.auth),...service.snapshot(project,req.auth)});}
  else if(url.pathname==='/api/priorities/discard'&&req.method==='POST'){const raw=await input(req);if(service.state.operations[raw.id]?.project!==project)throw failure('同步任务不存在。',404);service.discard(raw.id,req.auth);service.refresh(project).catch(()=>{});json(res,200,{ok:true,...service.snapshot(project,req.auth)});}
  else if(url.pathname==='/api/priorities/uploads'&&req.method==='POST'){const id=req.headers['x-upload-id'];if(!uuid.test(id||''))throw failure('附件标识无效。');service.upload(project,id,url.searchParams.get('name'),await bytes(req,20*1024*1024),req.auth);json(res,201,{ok:true});}
  else if(url.pathname==='/api/priorities/upload-failed'&&req.method==='POST'){const raw=await input(req);service.uploadFailed(project,raw.id,req.auth);json(res,200,{ok:true});}
  else if(/^\/api\/priorities\/files\/(rec\w+|pending-[a-f0-9-]{36})\/[a-f0-9-]{36}$/i.test(url.pathname)&&['GET','HEAD'].includes(req.method)){
   const [,recordId,id]=/\/files\/([^/]+)\/([^/]+)$/.exec(url.pathname),file=await service.download(project,recordId,id);
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':fs.statSync(file.file).size,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"});if(req.method==='HEAD')res.end();else fs.createReadStream(file.file).on('error',()=>res.destroy()).pipe(res);
  }else throw failure('接口不存在或不支持此操作。',404);
 }catch(e){if(!res.headersSent)json(res,e.status||503,{ok:false,error:e.status?e.message:'事项处理未完成，请保留输入后重试。'});else res.destroy();}
 return true;
};}
