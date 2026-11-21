import {readFile} from 'node:fs/promises';
import path from 'node:path';

const feishuLink=(value,kind)=>{
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname==='vnet.feishu.cn'&&kind.test(url.pathname)?url.origin+url.pathname:'';
 }catch{return '';}
};
export async function readCustomerRecords(dir,project){
 if(!['thailand','malaysia'].includes(project))return [];
 let records;
 try{records=JSON.parse(await readFile(path.join(dir,'customer-records.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}
 if(records.schema!==1||!records.projects||typeof records.projects!=='object')throw Error('客户资料配置格式无效。');
 const customers=records.projects[project]||[];
 if(!Array.isArray(customers))throw Error('客户资料配置格式无效。');
 return customers.map(({id,name,teams=[],weekly})=>{
  if(!/^[a-z\d-]+$/.test(id)||typeof name!=='string'||!name.trim()||!Array.isArray(teams))throw Error('客户组织配置格式无效。');
  const folder=feishuLink(weekly?.folder,/^\/drive\/folder\/[a-z\d]+$/i);
  const reports=[...new Map((weekly?.reports||[]).flatMap(report=>{
   const url=feishuLink(report.url,/^\/(?:docx|doc|wiki|sheets|base)\/[a-z\d]+$/i);
   return url&&typeof report.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(report.date)?[[url,{url,title:report.title,date:report.date}]]:[];
  })).values()].sort((a,b)=>b.date.localeCompare(a.date));
  return {id,name,teams:teams.map(team=>({name:String(team.name||''),members:(team.members||[]).filter(member=>typeof member==='string'&&member.trim())})),...(folder?{weekly:{folder,reports}}:{})};
 });
}
