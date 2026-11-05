import { matchesDocumentProject } from '../../src/project-context-model.mjs';
import { documentLifecycle } from '../../knowledge/lifecycle.mjs';
export const projects=[{id:'thailand',name:'Thailand Project',label:'Thailand Project（泰国项目）',color:'#4568d7'},{id:'malaysia',name:'Malaysia Project',label:'Malaysia Project（马来项目）',color:'#28a18f'},{id:'overseas',name:'Overseas Team',label:'Overseas Team（海外同频）',color:'#c89941'}];
const contains=(values,q)=>values.join(' ').toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
export function filterDocuments(records,{project='',query='',category='',specialty='',subcategory='',natures=[],specialties=[],sort='latest'}={}){
 const result=records.filter(document=>(document.members||[document]).some(d=>matchesDocumentProject(d,project)&&(!category||d.category===category)&&(!specialty||d.specialty===specialty)&&(!subcategory||d.subcategory===subcategory)&&(!natures.length||natures.includes(d.nature||d.subcategory||'其他'))&&(!specialties.length||specialties.includes(d.specialty))&&contains([document.title,document.note,d.title,d.summary,d.sourceName,d.nature,d.subcategory,d.specialty,...d.tags,...d.sections.flat(),...documentLifecycle(d).path],query)));
 return result.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'zh-CN'):b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'zh-CN'));
}
export function filterMeetings(records,{project='',includeShared=false,query='',type='',date=''}={}){
 return records.filter(m=>(!project||m.project===project||includeShared&&m.project==='overseas')&&(!type||m.type===type)&&(!date||m.date===date)&&contains([m.title,m.summary,m.type,projects.find(p=>p.id===m.project)?.label||'',...m.participants,...m.decisions,...m.actions.map(a=>a.title)],query)).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
}
export function meetingMetrics(records){const actions=records.flatMap(m=>m.actions);return {total:records.length,decisions:records.reduce((n,m)=>n+m.decisions.length,0),pending:actions.filter(a=>a.status!=='已完成').length,completed:actions.filter(a=>a.status==='已完成').length};}
