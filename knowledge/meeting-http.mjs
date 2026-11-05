import {failure} from './storage.mjs';
async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>100000)throw failure('会议信息过大。',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure('会议信息格式不正确。');}}
export function createMeetingHandler({service,minutes}){return async(req,res)=>{
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/knowledge/meetings/'))return false;
 const send=(code,payload)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));};
 try{
  if(!req.auth?.openId)throw failure('请先使用飞书登录。',401);
  const route=url.pathname.slice('/api/knowledge/meetings/'.length),project=req.auth.project?.knowledgeKey;
  const allowed=value=>!project||value===project||value==='overseas';
  const assertScope=value=>{if(!allowed(value))throw failure('会议范围与登录项目不一致，请切换项目后处理。',409);};
  const method={options:'GET',minutes:'GET',operations:'GET',create:'POST',retry:'POST'}[route];if(!method)throw failure('接口不存在。',404);if(req.method!==method){res.setHeader('Allow',method);throw failure('请求方式不支持。',405);}
  if(method==='POST'){const origin=req.headers.origin;let same=false;try{same=!!origin&&new URL(origin).host===req.headers.host;}catch{}if(!same||req.headers['sec-fetch-site']==='cross-site')throw failure('请求来源不受支持。',403);if(!req.headers['content-type']?.startsWith('application/json'))throw failure('请使用 JSON 提交会议信息。',415);}
  if(route==='options'){if(!service.refreshing&&(!service.state.schemaUpdatedAt||Date.now()-service.state.schemaUpdatedAt>300000||url.searchParams.get('refresh')==='1'))service.refresh().catch(()=>{});const options=service.options(req.auth);send(200,{ok:true,...options,projects:options.projects.filter(scope=>allowed(scope.id))});}
  else if(route==='minutes')send(200,{ok:true,...minutes.read(url.searchParams.get('id'),url.searchParams.get('refresh')==='1')});
  else if(route==='operations')send(200,{ok:true,operations:Object.values(service.state.operations).filter(o=>allowed(o.project)).map(o=>service.publicOperation(o))});
  else if(route==='create'){const raw=await body(req);assertScope(raw.project);send(202,{ok:true,operation:service.accept(raw,req.auth)});}
  else if(route==='retry'){const id=(await body(req)).id,operation=service.state.operations[id];if(operation)assertScope(operation.project);send(202,{ok:true,operation:service.retry(id)});}
 }catch(e){send(e.status||503,{ok:false,error:e.status?e.message:'会议服务暂不可用，请重试；已受理的任务会保留。'});}return true;
};}
