import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';

const appId = 'cli_aa547c8de6785ce2';
const formal = 'https://www.sm.sjhl.online:3333';
const failure = code => new Error(code);

export function safeFailure(error) {
  const messages = {
    CONFIG_INPUT_INVALID:'输入无效，请重新运行并填写有效的 App Secret。',
    CONFIG_PORT_INVALID:'此工具仅配置 3333 服务，请检查部署目录中的端口配置。',
    CONFIG_SERVICE_INVALID:'未找到本平台的配置接口，请确认脚本放在实际部署目录，且服务已启动。',
    CONFIG_CREDENTIALS_REJECTED:'飞书应用凭据校验未通过，请核对定盘星的 App Secret。',
    CONFIG_BUSY:'平台正在同步，尚未保存配置。请等待同步完成后重新运行。',
    CONFIG_SAVE_FAILED:'配置保存或应用失败，请在服务器本机的应用配置中检查状态后重试。',
    CONFIG_SAVED_LOGIN_UNAVAILABLE:'凭据已保存，但正式登录入口尚未通过检查。请检查服务配置恢复状态；不要重复修改回调。',
    CONFIG_CONNECTION_REFUSED:'3333 服务未启动。请先运行部署目录中的 start-3333.bat，再重新运行本工具。',
    CONFIG_TLS_FAILED:'本机 HTTPS 证书校验未通过。请确认部署目录和正在运行的服务一致，证书有效。',
    CONFIG_REQUEST_FAILED:'未能确认请求结果，请检查服务器网络和平台配置状态后重试。',
    CONFIG_ROOT_INVALID:'请把此 BAT 放在 server.mjs 和 application-settings.mjs 所在的实际部署目录。',
  };
  return messages[error?.message] || '配置未完成，请核对部署目录、服务状态和服务器网络后重试。';
}

export function connectionSettings(root, certificatePem) {
  const file=path.join(root,'.env'),env={};
  if(fs.existsSync(file))for(const line of fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
    const match=/^\s*([A-Z_]+)\s*=(.*)$/.exec(line);
    if(match)env[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');
  }
  if(env.PORT && env.PORT!=='3333')throw failure('CONFIG_PORT_INVALID');
  let pem=certificatePem;
  if(env.HTTPS_CERT_PATH)pem=fs.readFileSync(path.resolve(root,env.HTTPS_CERT_PATH),'utf8');
  const result={hostname:'127.0.0.1',port:3333,servername:'www.sm.sjhl.online',rejectUnauthorized:true};
  if(pem){
    const cert=new X509Certificate(pem);
    if(cert.checkHost('www.sm.sjhl.online'))result.servername='www.sm.sjhl.online';
    else if(cert.checkHost('localhost'))result.servername='localhost';
    else throw failure('CONFIG_TLS_FAILED');
    // A self-signed certificate is trusted only when read from this deployment's configured certificate.
    if(cert.checkIssued(cert) && cert.verify(cert.publicKey))result.ca=[...tls.rootCertificates,pem];
  }
  return result;
}

export function localRequester(settings) {
  return (method,route,body,formalHost=false)=>new Promise((resolve,reject)=>{
    const origin=formalHost?formal:'https://localhost:3333';
    const bytes=body?Buffer.from(JSON.stringify(body)):null;
    const headers={Host:new URL(origin).host,Origin:origin,'Sec-Fetch-Site':'same-origin'};
    if(bytes){headers['Content-Type']='application/json';headers['Content-Length']=bytes.length;}
    const req=https.request({...settings,path:route,method,headers,agent:false},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>16384)res.destroy(failure('CONFIG_REQUEST_FAILED'));else chunks.push(chunk);});
      res.on('error',()=>reject(failure('CONFIG_REQUEST_FAILED')));
      res.on('end',()=>{
        let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}
        resolve({status:res.statusCode,body:parsed,location:res.headers.location});
      });
    });
    req.setTimeout(35000,()=>req.destroy(failure('CONFIG_REQUEST_FAILED')));
    req.on('error',error=>reject(failure(error.code==='ECONNREFUSED'?'CONFIG_CONNECTION_REFUSED':/CERT|TLS|SELF_SIGNED|ISSUER|ALTNAME/.test(error.code||'')?'CONFIG_TLS_FAILED':'CONFIG_REQUEST_FAILED')));
    req.end(bytes);
  });
}

export async function configureLogin(input,request) {
  const {appSecret,clientMutationId}=input||{};
  if(typeof appSecret!=='string'||!appSecret.trim()||appSecret.length>512||/[\r\n\0]/.test(appSecret)||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(clientMutationId||''))throw failure('CONFIG_INPUT_INVALID');
  const before=await request('GET','/api/application-settings');
  if(before.status!==200||before.body?.ok!==true||before.body.editable!==true)throw failure('CONFIG_SERVICE_INVALID');
  const saved=await request('POST','/api/application-settings',{appId,appSecret,clientMutationId});
  if(saved.status===409)throw failure('CONFIG_BUSY');
  if(saved.status===400)throw failure('CONFIG_CREDENTIALS_REJECTED');
  if(saved.status!==200||saved.body?.ok!==true||saved.body.configured!==true)throw failure('CONFIG_SAVE_FAILED');
  let response;
  try{response=await request('GET','/api/auth/feishu/authorize?returnTo=%2F',undefined,true);}catch{throw failure('CONFIG_SAVED_LOGIN_UNAVAILABLE');}
  let target;try{target=new URL(response.location);}catch{}
  if(response.status!==303||target?.origin!=='https://accounts.feishu.cn'||target.pathname!=='/open-apis/authen/v1/authorize'||target.searchParams.get('client_id')!==appId||target.searchParams.get('redirect_uri')!==formal+'/api/auth/feishu/callback')throw failure('CONFIG_SAVED_LOGIN_UNAVAILABLE');
  return {ok:true,message:'凭据校验、保存和应用成功，正式登录入口检查通过。无需重启服务。',loginUrl:formal+'/login'};
}

export async function main() {
  try{
    const chunks=[];let size=0;
    for await(const chunk of process.stdin){size+=chunk.length;if(size>32768)throw failure('CONFIG_INPUT_INVALID');chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));}catch{throw failure('CONFIG_INPUT_INVALID');}
    const root=path.resolve(input.root||'.');
    if(!['server.mjs','application-settings.mjs','auth/http.mjs'].every(file=>fs.existsSync(path.join(root,file))))throw failure('CONFIG_ROOT_INVALID');
    const request=localRequester(connectionSettings(root,input.certificatePem));
    if(input.action==='probe'){
      const result=await request('GET','/api/application-settings');
      if(result.status!==200||result.body?.ok!==true||result.body.editable!==true)throw failure('CONFIG_SERVICE_INVALID');
      console.log(JSON.stringify({ok:true,configured:result.body.configured===true}));return;
    }
    if(input.action!=='save')throw failure('CONFIG_INPUT_INVALID');
    console.log(JSON.stringify(await configureLogin(input,request)));
  }catch(error){console.log(JSON.stringify({ok:false,error:safeFailure(error)}));process.exitCode=1;}
}

if(process.env.VNET_CONFIG_EMBEDDED==='1')await main();
