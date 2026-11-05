import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {platforms,materialsUrl} from './config.mjs';
const routes={'/cross-coordination':['coordination/web/index.html','text/html'],'/coordination/model.mjs':['coordination/model.mjs','text/javascript']};
export function createCoordinationHandler({root,service}){return async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),route=url.pathname;if(!['/api/coordination','/api/coordination/retry'].includes(route)&&!Object.hasOwn(routes,route))return false;
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const canEdit=()=>!!req.auth?.openId&&(!Object.hasOwn(req.auth,'permissions')||req.auth.permissions?.materials?.edit===true);
 const send=(status,body)=>{if(body.ok)body={...body,capabilities:{edit:canEdit()}};res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(req.method==='HEAD'?undefined:JSON.stringify(body));};
 if(req.method==='POST'&&route.startsWith('/api/coordination')){try{
  if(!req.auth?.openId)throw Object.assign(Error('请先使用飞书登录。'),{status:401});if(!canEdit())throw Object.assign(Error('没有物资编辑权限。'),{status:403});let origin;try{origin=new URL(req.headers.origin);}catch{}if(!origin||origin.host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')throw Object.assign(Error('不允许跨站提交。'),{status:403});
  if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('提交格式无效。'),{status:415});let body='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>64000)throw Object.assign(Error('提交内容过长。'),{status:413});body+=chunk;}let raw;try{raw=JSON.parse(body);}catch{throw Object.assign(Error('提交格式无效。'),{status:400});}
  if(route.endsWith('/retry')){service.writer.retry(raw?.id,req.auth);send(202,{ok:true,...service.snapshot(req.auth)});}else{if((url.searchParams.get('platform')||'materials')!=='materials')throw Object.assign(Error('平台尚未接入。'),{status:404});const op=service.writer.accept(raw,req.auth);send(202,{ok:true,operation:{id:op.id,status:op.status},...service.snapshot(req.auth)});}
 }catch(error){send(error.status||503,{ok:false,error:error.status?error.message:'物资提交未保存，请重试。'});}return true;}
 if(!['GET','HEAD'].includes(req.method)||route.endsWith('/retry')){res.setHeader('Allow',route.startsWith('/api/')?'GET, HEAD, POST':'GET, HEAD');send(405,{ok:false,error:'不支持此请求方法。'});return true;}
 if(route==='/api/coordination'){
  const id=url.searchParams.get('platform')||'materials';if(!platforms.some(p=>p.id===id)){send(404,{ok:false,error:'平台尚未接入。'});return true;}
  try{send(200,{ok:true,platforms,platform:id,sourceUrl:materialsUrl,...service.read({refresh:url.searchParams.get('refresh')==='1',actor:req.auth})});}catch{send(503,{ok:false,error:'横向统筹读取失败，请重试。'});}return true;
 }
 try{const [file,type]=routes[route],bytes=await readFile(path.join(root,file));res.writeHead(200,{...headers,'Content-Type':type+'; charset=utf-8','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(500,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end('横向统筹页面加载失败。');}return true;
};}
