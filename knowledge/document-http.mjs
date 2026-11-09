import {failure} from './storage.mjs';
async function body(req,max){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw failure('提交内容过大。',413);chunks.push(chunk);}return Buffer.concat(chunks);}
export function createDocumentHandler({service,snapshot=()=>({documents:[]})}){return async(req,res)=>{
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/knowledge/documents/'))return false;
 const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 try{
  if(!req.auth?.openId)throw failure('请先使用飞书登录。',401);if(!req.auth.project?.knowledgeKey)throw failure('请先选择项目。',409);
  const route=url.pathname.slice('/api/knowledge/documents/'.length),upload=/^uploads\/([\da-f-]{36})$/i.exec(route),method=upload?'POST':{options:'GET',operations:'GET',create:'POST',update:'POST',retry:'POST'}[route];if(!method)throw failure('接口不存在。',404);if(req.method!==method){res.setHeader('Allow',method);throw failure('请求方式不支持。',405);}
  if(route==='update'&&req.auth.permissions?.knowledge?.edit!==true)throw failure('没有资料编辑权限。',403);
  if(method==='POST'){let origin;try{origin=new URL(req.headers.origin);}catch{}if(!origin||origin.host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')throw failure('不允许跨站提交。',403);if(!req.headers['content-type']?.startsWith(upload?'application/octet-stream':'application/json'))throw failure('提交格式不正确。',415);}
  if(route==='options'){if(!service.refreshing&&(!service.state.schemaUpdatedAt||Date.now()-service.state.schemaUpdatedAt>300000||url.searchParams.get('refresh')==='1'))service.refresh().catch(()=>{});send(200,{ok:true,...service.options(req.auth)});}
  else if(route==='operations')send(200,{ok:true,operations:service.operations(req.auth)});
  else if(upload){const plan=service.uploadPlan(upload[1],req.auth);service.storeUpload(upload[1],await body(req,Math.min(plan.size,64*1024*1024)),req.auth);send(201,{ok:true});}
  else{let raw;try{raw=JSON.parse((await body(req,100000)).toString('utf8'));}catch(e){if(e.status)throw e;throw failure('提交格式不正确。');}const operation=route==='create'?service.accept(raw,req.auth,{singleSpecialty:true}):route==='update'?service.acceptUpdate(raw,req.auth,snapshot()):service.retry(raw.id,req.auth);send(202,{ok:true,operation});}
 }catch(e){send(e.status||503,{ok:false,error:e.status?e.message:'资料服务暂不可用；已受理的记录会保留。'});}return true;
};}
