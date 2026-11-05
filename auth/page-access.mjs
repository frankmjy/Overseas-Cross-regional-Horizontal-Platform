import {createHash} from 'node:crypto';
import {authError} from './service.mjs';
import {isAdministrator} from './admin-role.mjs';
export const pageCatalog=Object.freeze([
 {id:'projects',name:'项目管理',href:'/project-management'},
 {id:'research',name:'调研工作台',href:'/research'},
 {id:'materials',name:'开办物资',href:'/cross-coordination'},
 {id:'staffing',name:'人员储备',href:'/staffing-reserve'},
 {id:'knowledge',name:'知识共享',href:'/knowledge-sharing'},
 {id:'meetings',name:'议事航迹',href:'/meeting-trail'}
]);
const defaults=()=>Object.fromEntries(pageCatalog.map(p=>[p.id,{view:p.id==='materials',edit:false}]));
export function routeAccess(url,method='GET'){
 const pathname=decodeURIComponent(url.pathname),write=!['GET','HEAD','OPTIONS'].includes(method);
 let pages=[];
 if(['/admin','/auth/web/admin.html','/api/application-settings'].includes(pathname)||pathname.startsWith('/api/admin/'))return {admin:true,pages,write};
 if(pathname==='/api/knowledge')pages=['knowledge','meetings'];
 else if(pathname==='/assets/malaysia-team-comparison.svg')pages=['research'];
 else if(['/assets/vnet-thailand-organization.svg','/src/data.js'].includes(pathname))pages=['projects'];
 else if(pathname==='/api/team-organization')pages=['projects','staffing'];
 else if(pathname==='/meeting-trail'||/^\/api\/knowledge\/(meetings|minutes)(?:\/|$)/.test(pathname))pages=['meetings'];
 else if(pathname==='/knowledge-sharing'||/^\/api\/knowledge(?:\/|$)/.test(pathname))pages=['knowledge'];
 else if(pathname==='/cross-coordination'||/^\/api\/coordination(?:\/|$)/.test(pathname))pages=['materials'];
 else if(pathname==='/staffing-reserve'||/^\/api\/staffing(?:\/|$)/.test(pathname))pages=['staffing'];
 else if(['/project-management','/index.html'].includes(pathname)||/^\/api\/(handover-plan|project-tasks|base-sync|priorities)(?:\/|$)/.test(pathname)||pathname.endsWith('.xlsx'))pages=['projects'];
 else if(['/','/research'].includes(pathname)||/^\/api\/research(?:\/|$)/.test(pathname)||pathname.startsWith('/research/pdfs/'))pages=['research'];
 return {pages,write,unknown:!pages.length&&pathname.startsWith('/api/')};
}
export class PageAccess{
 constructor({auth,people=()=>[]}){this.auth=auth;this.externalPeople=people;}
 get appId(){return this.auth.config().appId;}
 people(){
  const rows=[...this.externalPeople(),...Object.values(this.auth.state.events).filter(e=>e.appId===this.appId).map(e=>({...e.user,loginTime:e.loginTime}))],found=new Map();
  for(const row of rows){if(!/^ou_[A-Za-z0-9_-]+$/.test(row.openId||''))continue;const prior=found.get(row.openId);if(!prior||String(row.loginTime||'')>=String(prior.loginTime||''))found.set(row.openId,{openId:row.openId,name:row.name||row.openId,loginTime:row.loginTime||''});}
  return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
 }
 summary(user){
  const administrator=isAdministrator(user,this.appId),grant=this.auth.state.access?.grants?.[this.appId]?.[user?.openId];
  const permissions=administrator?Object.fromEntries(pageCatalog.map(p=>[p.id,{view:true,edit:true}])):structuredClone(grant?.permissions||defaults());
  const home=administrator?'/project-management':permissions.materials.view?'/cross-coordination':pageCatalog.find(p=>permissions[p.id].view)?.href||null;
  return {permissions,home,revision:grant?.revision||0};
 }
 allows(url,method,user){const rule=routeAccess(url,method);if(isAdministrator(user,this.appId))return true;if(rule.admin||rule.unknown)return false;if(!rule.pages.length)return ['GET','HEAD','OPTIONS'].includes(method);const {permissions}=this.summary(user);return rule.pages.some(id=>permissions[id]?.[rule.write?'edit':'view']);}
 destination(wanted,user){const url=new URL(wanted,'https://access.invalid');return this.allows(url,'GET',user)?wanted:this.summary(user).home;}
 list(){return {ok:true,pages:pageCatalog,people:this.people().map(person=>({...person,isAdmin:isAdministrator(person,this.appId),...this.summary(person)}))};}
 save(raw,actor){
  if(!isAdministrator(actor,this.appId))throw authError('仅管理员可配置权限。',403);
  if(!raw||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.clientMutationId||'')||!Number.isSafeInteger(raw.revision)||raw.revision<0)throw authError('权限提交参数无效。');
  if(!this.people().some(p=>p.openId===raw.openId)||isAdministrator({openId:raw.openId},this.appId))throw authError('请选择已授权的普通用户。');
  const input=raw.permissions;if(!input||Object.keys(input).length!==pageCatalog.length)throw authError('页面权限不完整。');
  const permissions={};for(const p of pageCatalog){const v=input[p.id];if(!v||Object.keys(v).length!==2||typeof v.view!=='boolean'||typeof v.edit!=='boolean'||v.edit&&!v.view)throw authError('编辑权限须同时开启访问。');permissions[p.id]={view:v.view,edit:v.edit};}
  const digest=createHash('sha256').update(JSON.stringify({appId:this.appId,actor:actor.openId,openId:raw.openId,revision:raw.revision,permissions})).digest('hex'),key=this.appId+':'+raw.clientMutationId,prior=this.auth.state.access?.mutations?.[key];
  if(prior){if(prior.digest!==digest)throw authError('该提交编号已用于其他内容。',409);return structuredClone(prior.result);}
  if(this.summary({openId:raw.openId}).revision!==raw.revision)throw authError('权限已变更，请刷新后重试。',409);
  const result={ok:true,openId:raw.openId,revision:raw.revision+1,permissions};
  this.auth.commit(state=>{state.access||={grants:{},mutations:{}};state.access.grants[this.appId]||={};state.access.grants[this.appId][raw.openId]={revision:result.revision,permissions,updatedAt:new Date().toISOString(),editor:actor.openId};state.access.mutations[key]={digest,result};});
  return structuredClone(result);
 }
}
