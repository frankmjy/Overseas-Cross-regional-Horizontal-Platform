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
const defaults=(isAdmin=false)=>Object.fromEntries(pageCatalog.map(p=>[p.id,{view:isAdmin||p.id==='materials',edit:isAdmin}]));
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
 constructor({auth,people=()=>[],availability}){this.auth=auth;this.externalPeople=people;this.availability=availability;}
 get appId(){return this.auth.config().appId;}
 grant(user){return this.auth.state.access?.grants?.[this.appId]?.[user?.openId];}
 adminRole(user){
  if(isAdministrator(user,this.appId))return 'owner';
  return this.grant(user)?.subAdmin===true?'sub':null;
 }
 people(){
  const rows=[...this.externalPeople(),...Object.values(this.auth.state.events).filter(e=>e.appId===this.appId).map(e=>({...e.user,loginTime:e.loginTime}))],found=new Map();
  for(const row of rows){if(!/^ou_[A-Za-z0-9_-]+$/.test(row.openId||''))continue;const prior=found.get(row.openId);if(!prior||String(row.loginTime||'')>=String(prior.loginTime||''))found.set(row.openId,{openId:row.openId,name:row.name||row.openId,loginTime:row.loginTime||''});}
  const members=this.availability?.snapshot().people.map(({openId,name})=>({
   openId,name:name||found.get(openId)?.name||'姓名待同步（'+openId.slice(-6)+'）',loginTime:found.get(openId)?.loginTime||''
  }));
  return (members||[...found.values()]).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||a.openId.localeCompare(b.openId));
 }
 summary(user){
  const adminRole=this.adminRole(user),isAdmin=adminRole!==null,grant=this.grant(user);
  const permissions=isAdmin?defaults(true):structuredClone(grant?.permissions||defaults());
  const home=isAdmin?'/project-management':permissions.materials.view?'/cross-coordination':pageCatalog.find(p=>permissions[p.id].view)?.href||null;
  return {permissions,home,revision:grant?.revision||0,adminRole,isAdmin,canManageSubAdmins:adminRole==='owner'};
 }
 allows(url,method,user){const rule=routeAccess(url,method);if(this.adminRole(user))return true;if(rule.admin||rule.unknown)return false;if(!rule.pages.length)return ['GET','HEAD','OPTIONS'].includes(method);const {permissions}=this.summary(user);return rule.pages.some(id=>permissions[id]?.[rule.write?'edit':'view']);}
 destination(wanted,user){const url=new URL(wanted,'https://access.invalid');return this.allows(url,'GET',user)?wanted:this.summary(user).home;}
 list(){return {ok:true,pages:pageCatalog,people:this.people().map(person=>({...person,...this.summary(person)}))};}
 save(raw,actor){
  const actorRole=this.adminRole(actor);
  if(!actorRole)throw authError('仅管理员可配置权限。',403);
  if(!raw||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.clientMutationId||'')||!Number.isSafeInteger(raw.revision)||raw.revision<0)throw authError('权限提交参数无效。');
  const changesRole=Object.hasOwn(raw,'subAdmin'),changesPermissions=Object.hasOwn(raw,'permissions');
  if(changesRole&&actorRole!=='owner')throw authError('仅主管理员可调整子管理员。',403);
  if((changesRole&&typeof raw.subAdmin!=='boolean')||(!changesRole&&!changesPermissions))throw authError('权限提交参数无效。');
  const target={openId:raw.openId},targetRole=this.adminRole(target);
  let permissions;
  if(changesPermissions){
   const input=raw.permissions;
   if(!input||Object.keys(input).length!==pageCatalog.length)throw authError('页面权限不完整。');
   permissions={};
   for(const page of pageCatalog){
    const rights=input[page.id];
    if(!rights||Object.keys(rights).length!==2||typeof rights.view!=='boolean'||typeof rights.edit!=='boolean'||rights.edit&&!rights.view)throw authError('编辑权限须同时开启访问。');
    permissions[page.id]={view:rights.view,edit:rights.edit};
   }
  }
  const digest=createHash('sha256').update(JSON.stringify({appId:this.appId,actor:actor.openId,openId:raw.openId,revision:raw.revision,permissions,...(changesRole?{subAdmin:raw.subAdmin}:{})})).digest('hex');
  const key=this.appId+':'+raw.clientMutationId,prior=this.auth.state.access?.mutations?.[key];
  if(prior){if(prior.digest!==digest)throw authError('该提交编号已用于其他内容。',409);return structuredClone(prior.result);}
  if(this.availability&&!this.availability.snapshot().writable)throw authError('授权名单未核对，请刷新后重试。',412);
  if(!this.people().some(p=>p.openId===raw.openId)||targetRole==='owner')throw authError('请选择可配置的已授权人员。');
  const previous=this.grant(target);
  if((previous?.revision||0)!==raw.revision)throw authError('权限已变更，请刷新后重试。',409);
  if(targetRole==='sub'&&changesPermissions)throw authError('子管理员使用完整权限，请先调整其角色。',403);
  const subAdmin=changesRole?raw.subAdmin:targetRole==='sub';
  const assigned=permissions||previous?.permissions||defaults(),revision=raw.revision+1;
  const result={ok:true,openId:raw.openId,revision,permissions:subAdmin?defaults(true):assigned,adminRole:subAdmin?'sub':null,isAdmin:subAdmin};
  this.auth.commit(state=>{
   state.access||={grants:{},mutations:{}};
   state.access.grants[this.appId]||={};
   state.access.grants[this.appId][raw.openId]={revision,permissions:assigned,subAdmin,updatedAt:new Date().toISOString(),editor:actor.openId};
   state.access.mutations[key]={digest,result};
  });
  return structuredClone(result);
 }
}
