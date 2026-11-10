import fs from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import {authError} from './service.mjs';
import path from 'node:path';
const security={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
export function createAdminHandler({root,reader,access,availability}){
  return async(req,res)=>{
    const url=new URL(req.url,'https://admin.invalid');
    if(!['/admin','/auth/web/admin.html','/api/admin/login-records','/api/admin/permissions'].includes(url.pathname))return false;
    const send=(status,data)=>{res.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    if(!req.auth?.isAdmin){send(req.auth?403:401,{ok:false,error:'仅管理员可访问。'});return true;}
    if(url.pathname==='/api/admin/permissions'){
      try{
        if(!access)throw authError('权限服务尚未接入。',503);
        if(req.method==='GET'){
          if(availability){
            availability.refreshIfNeeded(url.searchParams.get('refresh')==='1');
            const {refreshing,error,writable}=availability.snapshot();
            send(200,{...access.list(),refreshing,error,writable});
          }else{
            const {refreshing,error}=reader.read(url.searchParams);
            send(200,{...access.list(),refreshing,error});
          }
        }
        else if(req.method==='POST'){
          let same=false;try{same=new URL(req.headers.origin).host===req.headers.host;}catch{}
          const csrf=req.headers['x-csrf-token'],expected=req.adminCsrf;
          if(!same||req.headers['sec-fetch-site']==='cross-site'||typeof csrf!=='string'||typeof expected!=='string'||Buffer.byteLength(csrf)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(csrf),Buffer.from(expected)))throw authError('配置请求已失效，请刷新后重试。',403);
          if(!req.headers['content-type']?.startsWith('application/json'))throw authError('请使用 JSON 提交。',415);
          let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16000)throw authError('提交内容过长。',413);chunks.push(Buffer.from(chunk));}
          let raw;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw authError('提交格式无效。');}
          await availability?.refreshIfNeeded();
          send(200,access.save(raw,req.auth));
        }else send(405,{ok:false,error:'不支持此请求方法。'});
      }catch(error){send(error.status||503,{ok:false,error:error.publicMessage||'权限配置未保存，请重试。'});}
      return true;
    }
    if(!['GET','HEAD'].includes(req.method)){send(405,{ok:false,error:'不支持此请求方法。'});return true;}
    try{
      if(url.pathname==='/api/admin/login-records')send(200,reader.read(url.searchParams));
      else{res.writeHead(200,{...security,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(req.method==='HEAD'?'':fs.readFileSync(path.join(root,'auth/web/admin.html')));}
    }catch(error){send(error.status||500,{ok:false,error:error.publicMessage||'登录记录读取失败，请重试。'});}
    return true;
  };
}
