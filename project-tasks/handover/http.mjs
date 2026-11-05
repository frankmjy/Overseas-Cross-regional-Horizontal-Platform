import fs from 'node:fs/promises';
import path from 'node:path';
import {buildModel} from '../../samples/handover-preview/model.mjs';
import {normalizeTask,binding,fields,failure,uuid} from './model.mjs';
import {orderScope} from './ordering.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
async function bytes(req,max){const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>max)throw failure('提交内容过大。',413);chunks.push(part);}return Buffer.concat(chunks);}
async function input(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw failure('请使用JSON提交。',415);try{return JSON.parse((await bytes(req,160000)).toString('utf8'));}catch(e){if(e.status)throw e;throw failure('提交格式不正确。');}}
export function handoverView(service,actor){
 const snapshot=service.snapshot(actor),raw=service.rawRecords(),canonical=new Map(snapshot.records.map(r=>[r.id,r]));
 const result=buildModel(raw.map(r=>({id:r.recordId,fields:{...r,[fields.code.name]:normalizeTask(r,service.now()).code,...(snapshot.schema?.order&&snapshot.schema?.displayCode?{[fields.order.name]:r[fields.order.name]??null,[fields.displayCode.name]:r[fields.displayCode.name]??''}:{})}})),new Date(snapshot.updatedAt||service.now()).toISOString(),service.now());
 for(const row of result.records){const task=canonical.get(row.id);Object.assign(row,{version:task.version,values:task.values,ownerIds:task.owner,owner:task.owner.map(id=>snapshot.users.find(u=>u.id===id)?.name||'').filter(Boolean).join('、'),attachments:task.attachments,resourceArchives:Object.values(service.state.operations).filter(o=>o.kind==='deliverable'&&o.recordId===row.id&&o.status==='success'&&o.archiveRecord).map(o=>({title:o.archiveValue.title,contentUrl:o.archiveValue.url,archiveUrl:o.archiveRecord.url,storedNames:o.uploads.map(u=>u.storedName)}))});}
 return{...result,ready:snapshot.ready,revision:snapshot.revision,refreshing:snapshot.refreshing,error:snapshot.error,users:snapshot.users,schema:snapshot.schema,operations:snapshot.operations,numberingPending:!!service.state.orderScopes?.length,numberingError:service.numberingError||'',pendingRecordIds:[...new Set([...Object.values(service.state.operations).filter(o=>!['success','discarded'].includes(o.status)).map(o=>o.recordId),...snapshot.records.filter(r=>service.numberingInFlight?.has(orderScope(r))||r.parentId&&service.numberingInFlight?.has(orderScope(canonical.get(r.parentId)||{}))).map(r=>r.id)])],deletedRecords:snapshot.records.filter(r=>r.ownDeleted&&!canonical.get(r.parentId)?.deleted).map(r=>({id:r.id,code:r.code,title:r.title,level:r.level,version:r.version,childrenCount:r.level==='任务组'?snapshot.records.filter(c=>c.parentId===r.id&&!c.ownDeleted).length:0})),capabilities:{editable:snapshot.ready&&!!actor.permissions?.projects?.edit,ordering:!!(snapshot.schema?.order&&snapshot.schema?.displayCode),project:actor.project.id,actorName:actor.name,actorId:actor.openId}};
}
export function handoverMutationReceipt(before,after,result){
 const prior=new Map(before.records.map(r=>[r.id,JSON.stringify(r)])),metadata={};
 for(const[key,value]of Object.entries(after))if(!['records','tasks','parents','milestones'].includes(key)&&JSON.stringify(value)!==JSON.stringify(before[key]))metadata[key]=value;
 const order=after.records.map(r=>r.id),removed=before.records.filter(r=>!order.includes(r.id)).map(r=>r.id);
 return{ok:true,...result,receipt:'handover-patch-v1',baseRevision:before.revision,revision:after.revision,records:after.records.filter(r=>prior.get(r.id)!==JSON.stringify(r)),removedIds:removed,...(JSON.stringify(order)!==JSON.stringify(before.records.map(r=>r.id))?{recordOrder:order}:{}),modelPatch:metadata};
}
export function createHandoverHandler({root,service,organization}={}){
 const files=new Map(['app.mjs','model.mjs','styles.css','editor.mjs','pages.mjs','inline.mjs'].map(name=>['/handover-preview/'+name,['samples/handover-preview/'+name,name.endsWith('.css')?'text/css':'text/javascript']]));
 files.set('/project-tasks/handover/priority.mjs',['project-tasks/handover/priority.mjs','text/javascript']);
 for(const name of ['resources','summary','ordering'])files.set(`/project-tasks/handover/${name}.mjs`,[`project-tasks/handover/${name}.mjs`,'text/javascript']);
 files.set('/handover-preview/logo.png',['assets/vnet-official-logo.png','image/png']);files.set('/handover-preview/favicon.svg',['assets/vnet-favicon.svg','image/svg+xml']);files.set('/project-tasks/handover/status.mjs',['project-tasks/handover/status.mjs','text/javascript']);
 return async(req,res)=>{
  const url=new URL(req.url,'https://local.invalid'),currentProject=req.auth?.project?.id===binding.project;
  const page=['/project-management','/index.html'].includes(url.pathname)&&(currentProject||url.searchParams.get('view')==='handover'),api=/^\/api\/handover-plan(?:\/|$)/.test(url.pathname),asset=files.has(url.pathname);
  const archived=currentProject&&(url.pathname==='/api/base-sync'||/^\/api\/project-tasks(?:\/|$)/.test(url.pathname));
  if(!page&&!api&&!asset&&!archived&&!url.pathname.startsWith('/handover-preview/'))return false;
  const send=(code,value)=>{res.writeHead(code,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try{
   service.assertActor(req.auth);
   if(url.searchParams.has('project')&&(url.searchParams.getAll('project').length!==1||url.searchParams.get('project')!==binding.project))throw failure('当前请求与登录项目不一致。',409);
   if(archived)throw failure('旧任务表已归档，请从项目管理打开最新接维计划。',410);
   if(page||asset){
    if(!['GET','HEAD'].includes(req.method))throw failure('不支持此请求方法。',405);
    const entry=page?['samples/handover-preview/index.html','text/html']:files.get(url.pathname);let data=await fs.readFile(path.join(root,entry[0]));
    if(page)data=Buffer.from(data.toString('utf8').replaceAll('href="/styles.css"','href="/handover-preview/styles.css"').replaceAll('src="/app.mjs"','src="/handover-preview/app.mjs"').replaceAll('src="/logo.png"','src="/handover-preview/logo.png"').replaceAll('href="/favicon.svg"','href="/handover-preview/favicon.svg"').replaceAll('/project-management-preview','/project-management?project='+binding.project));
    res.writeHead(200,{...headers,'Content-Type':entry[1]+(entry[1].startsWith('text/')?'; charset=utf-8':''),'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);return true;
   }
   if(!api)throw failure('页面不存在。',404);
   const route=url.pathname.slice('/api/handover-plan'.length)||'/',upload=/^\/uploads\/([\da-f-]{36})$/i.exec(route);
   const method=upload?'POST':{'/':'GET','/options':'GET','/operations':'GET','/mutations':'POST','/retry':'POST','/discard':'POST','/refresh':'POST','/organization':'GET'}[route];
   if(!method)throw failure('接口不存在。',404);if(req.method!==method)throw failure('不支持此请求方法。',405);
   if(method==='POST'){
    let origin;try{origin=new URL(req.headers.origin);}catch{}if(!origin||origin.host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')throw failure('不允许跨站提交。',403);
   }
   if(route==='/'){service.warm();send(200,{ok:true,...handoverView(service,req.auth)});}
   else if(route==='/options'){service.warm();const snapshot=service.snapshot(req.auth);send(200,{ok:true,ready:snapshot.ready,schema:snapshot.schema,users:snapshot.users,parents:snapshot.records.filter(r=>!r.deleted&&r.level==='任务组').map(r=>({id:r.id,code:r.code,title:r.title,stage:r.stage})),documents:(()=>{const options=service.documents?.options(req.auth);return options?{...options,targets:options.targets.map(t=>{const source=service.documents.sources?.find(s=>s.id===t.id);return{...t,name:source?.name||'项目资料库',url:service.documents.config?.baseUrl?service.documents.config.baseUrl+'?table='+encodeURIComponent(t.id):''};})}:{state:'error',natures:[],directoryNodes:[],error:'归档服务尚未接入。'};})()});}
   else if(route==='/operations')send(200,{ok:true,operations:service.snapshot(req.auth).operations,revision:service.state.revision||0});
   else if(route==='/organization'){if(!organization)throw failure('项目组织服务暂不可用。',503);send(200,{ok:true,data:await organization(req.auth.project.knowledgeKey)});}
   else if(upload){
    if(!/^application\/octet-stream(?:;|$)/i.test(req.headers['content-type']||''))throw failure('附件提交格式不正确。',415);
    const plan=service.deliverables.uploadPlan(upload[1],req.auth);service.deliverables.storeUpload(upload[1],await bytes(req,Math.min(plan.size,64*1024*1024)),req.auth);send(201,{ok:true});
   }else if(route==='/refresh'){await input(req);await service.refresh();send(200,{ok:true,...handoverView(service,req.auth)});}
   else{
    const body=await input(req),compact=route==='/mutations'&&url.searchParams.get('receipt')==='compact'&&req.headers['x-vnet-model-revision']===String(service.state.revision||0),before=compact?handoverView(service,req.auth):null;let result;
    if(route==='/mutations')result=service.accept(body,req.auth);else if(!uuid.test(body?.id||''))throw failure('同步任务标识无效。');else result=route==='/retry'?service.retry(body.id,req.auth):service.discard(body.id,req.auth);
    const after=handoverView(service,req.auth);send(route==='/discard'?200:202,compact?handoverMutationReceipt(before,after,result):{ok:true,...result,...after});
   }
  }catch(e){send(e.status||503,{ok:false,error:e.status?e.message:'接维服务暂不可用，已受理内容会保留。'});}
  return true;
 };
}
