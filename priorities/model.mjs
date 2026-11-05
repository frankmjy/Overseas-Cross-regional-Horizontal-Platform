import { createHash } from 'node:crypto';
import { text, civilDate, feedbackHistory, appendFeedback, failure } from '../project-tasks/model.mjs';
import { validatePriority } from '../src/weekly-priorities.js';
export { failure, appendFeedback };
export const baseToken='CID8b8V7CaCtKesWGFKcHTdqnlc';
export const projects={ 'th-001':{table:'tblTOcX7mpDVwPTN',tasks:'tblSpSvqS2FMpHks'}, 'my-001':{table:'tbl6cldxwJDUknNB',tasks:'tblZ3lzitcYRjxcd'} };
export const fields={title:['Item Title（事项名称）','text'],kind:['Item Type（事项类别）','select'],urgency:['Importance（重要程度）','select'],status:['Status（推进状态）','select'],owner:['Owner（责任人）','user'],due:['Target Date（目标日期）','datetime'],impact:['Impact Area（影响范围）','select'],description:['Description（事项描述）','text'],progress:['Latest Feedback（最新进展）','text'],next:['Next Action（下一步行动）','text'],week:['Week Start（跟进周起始）','datetime'],weekEnd:['Week End（跟进周结束）','datetime'],planIds:['Related Plan（关联计划）','link'],links:['Reference Link（参考链接）','text'],attachments:['Attachments（附件）','attachment'],history:['Follow-up History（跟进历史）','text'],mutation:['Client Mutation ID（提交去重标识）','text'],example:['Is Example（是否示例）','checkbox'],lastTime:['Last Follow-up At（最近跟进时间）','datetime'],lastBy:['Last Follow-up By（最近跟进人）','user']};
export const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const fileIdentity=file=>{
 const match=/^([a-f0-9-]{36})__(.+)$/i.exec(file.name||'');
 if(match&&uuid.test(match[1]))return {id:match[1],name:match[2],size:Number(file.size)};
 const d=digest(file.file_token);return {id:`${d.slice(0,8)}-${d.slice(8,12)}-${d.slice(12,16)}-${d.slice(16,20)}-${d.slice(20,32)}`,name:file.name,size:Number(file.size)};
};
export function normalize(row){
 const get=key=>row[fields[key][0]], owners=get('owner')||[];
 let linkText=text(get('links')).trim();const legacy=/^\[([\s\S]*)\]\(([\s\S]*)\)$/.exec(linkText);if(legacy)linkText=legacy[1].includes('\n')?legacy[1]:`${legacy[1]}\n${legacy[2]}`;
 const links=linkText.split(/\n\s*\n/).filter(Boolean).map(block=>{const lines=block.split('\n'),url=lines.pop().trim();try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?{title:lines.join(' ').trim()||u.hostname,url:u.href}:null;}catch{return null;}}).filter(Boolean);
 const value=Object.fromEntries(['title','kind','urgency','status','description','progress','next'].map(key=>[key,text(get(key))]));
 Object.assign(value,{owner:owners[0]?.id||owners[0]?.open_id||'',ownerName:text(owners[0]?.name),due:civilDate(get('due')),impact:Array.isArray(get('impact'))?get('impact').map(text).sort().join('、'):text(get('impact')),week:civilDate(get('week')),planIds:(get('planIds')||[]).map(v=>v.id||v.record_id).filter(Boolean).sort(),links,attachments:(get('attachments')||[]).map(fileIdentity),history:feedbackHistory(get('history')),historyText:text(get('history')),mutation:text(get('mutation')),example:get('example')===true});
 return {...value,id:row.recordId,recordId:row.recordId,code:text(row['Item Code（事项编号）']),version:digest(value)};
}
export function validate(raw,context,actor){
 let v;try{v=validatePriority(raw);}catch(e){throw failure(e.message);}
 if(!context.people.some(p=>p.id===v.owner)&&v.owner!==actor.openId)throw failure('请从飞书人员列表选择责任人。');
 if(v.planIds.some(id=>!context.plans.some(p=>p.recordId===id)))throw failure('请关联当前项目的有效计划。');
 if(v.impact&&v.impact.split('、').some(part=>!context.schema.impact.options.includes(part)))throw failure('请从影响范围列表选择。');
 for(const key of ['kind','urgency','status'])if(context.schema[key].options.length&&!context.schema[key].options.includes(v[key]))throw failure('字段选项已更新，请刷新后重试。');
 v.impact = v.impact.split('、').filter(Boolean).sort().join('、');
 if(v.links.some(l=>/[\r\n]/.test(l.title)))throw failure('链接名称不能换行。');
 return v;
}
export function encode(value,week,id,history,actor,time,schema,updateFeedback=true){
 const names=key=>schema?.[key]?.id||fields[key][0], patch={};
 for(const key of ['title','kind','urgency','status','description','progress','next'])patch[names(key)]=value[key];
 for(const [key,v]of Object.entries({owner:[{id:value.owner}],due:value.due?value.due+' 00:00:00':null,impact:value.impact?(schema?.impact.multiple?value.impact.split('、'):value.impact):null,week:week+' 00:00:00',weekEnd:new Date(Date.parse(week+'T00:00:00Z')+6*86400000).toISOString().slice(0,10)+' 00:00:00',planIds:value.planIds.map(id=>({id})),links:value.links.map(l=>`${l.title}\n${l.url}`).join('\n\n'),history,mutation:id,example:false,lastTime:time,lastBy:[{id:actor.openId}]}))patch[names(key)]=v;
 if (!updateFeedback) { delete patch[names('lastTime')]; delete patch[names('lastBy')]; }
 return patch;
}
export const matches=(row,op)=>{
 const value=normalize(row), expected=op.value;
 return ['title','kind','urgency','status','owner','due','impact','description','progress','next'].every(k=>value[k]===expected[k])&&JSON.stringify(value.links)===JSON.stringify(expected.links)&&JSON.stringify(value.planIds)===JSON.stringify([...expected.planIds].sort())&&value.week===op.week&&value.historyText===op.history&&value.mutation===op.id;
};
