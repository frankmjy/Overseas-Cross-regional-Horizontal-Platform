import {libraryScopeFor,libraryProjectScope} from './library-model.mjs';
const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('、'):typeof v==='object'?String(v.name||v.text||''):String(v).trim();
export function safeLinks(value,label='来源资料'){
 const raw=text(value),urls=[...raw.matchAll(/https:\/\/[^\s<>"\[\]]+/g)].map(m=>m[0].replace(/[)）。，；;]+$/g,''));
 return [...new Set(urls)].flatMap(url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?[{label,url:u.href}]:[]}catch{return []}});
}
export const editableText=value=>value==null?'':Array.isArray(value)?value.map(editableText).join(''):typeof value==='object'?String(value.link||value.url||value.text||value.name||''):String(value);
export function editableDocumentLink(value){
 const raw=editableText(value).trim();
 if(!raw)return {url:''};
 const named=/^\[([^\]\r\n]*)\]\((https:\/\/[^\s<>"\[\]]+)\)$/u.exec(raw);
 const address=named?.[2]??raw;
 if(!/^https:\/\/[^\s<>"\[\]]+$/u.test(address))return null;
 try{
  const url=new URL(address);
  return url.username||url.password?null:{url:url.href,label:named?.[1]};
 }catch{return null;}
}
function documentLinks(value){
 const link=editableDocumentLink(value);
 return link?.url?[{label:'打开资料',url:link.url}]:safeLinks(value,'打开资料');
}
export const editableDocumentFields={
 'project-document':{title:'Summary',url:'Stored Link'},
 equipment:{title:'Equipment Name',url:'Linked Document'},
 index:{title:'Document Title',url:'Document Link'},
};
export function projectRecord(source,row,baseUrl){
 const record=baseRecord(source,row,baseUrl);if(!record||source.kind==='meeting'||source.kind==='meeting-action')return record;
 const c=row.cells,directoryId=text(c['Directory Category ID']),scope=text(c['Library Scope']),chapter=text(c['Lifecycle Chapter']),stage=text(c['Lifecycle Stage']),note=text(c.Notes),specialty=text(c.Discipline);
 const fields=editableDocumentFields[source.kind];
 const edit=source.writable&&fields?{title:editableText(c[fields.title]),note:editableText(c.Notes),specialty:editableText(c.Discipline)}:null;
 if(edit){const link=editableDocumentLink(c[fields.url]);if(link)edit.url=link.url;}
 const attachments=Array.isArray(c.Attachments)?c.Attachments:[];
 const links=source.kind==='equipment'&&attachments.length?[...record.links,{label:'查看附件',url:record.sourceLink}]:record.links;
 return {...record,links,...edit?{edit,attachmentCount:attachments.length}:{},...['project','shared','domestic','general'].includes(scope)?{libraryScope:source.kind==='project-document'?'project':scope}:{},...note?{note,sections:[...record.sections.filter(([label])=>label!=='备注'),['备注',note]]}:{},...directoryId?{directoryId}:{},...chapter?{lifecycle:{chapter,stage,directoryId}}:{},...specialty?{specialty}:{},...source.kind==='project-document'&&text(c.Category)?{nature:text(c.Category)}:{},...source.regionalOffice?{libraryScope:'regional',projectScope:''}:{}};
}
function baseRecord(source,row,baseUrl){
 const c=row.cells,t=n=>text(c[n]),sourceLink=`${baseUrl}?table=${source.id}&record=${row.id}`,id=source.id+':'+row.id;
 if(source.kind==='meeting-action'){
  const relations=Object.entries({'Araya Meeting':'thailand','Malaysia Meeting':'malaysia','Overseas Meeting':'overseas'}).flatMap(([key,project])=>{
   const values=c[key];
   return (Array.isArray(values)?values:values?[values]:[]).map(value=>({project,recordId:typeof value==='string'?value:value?.record_id||value?.id}));
  });
  const title=t('Action Title');
  if(!title||relations.length!==1||!/^rec\w+$/.test(relations[0].recordId||''))return null;
  const owners=Array.isArray(c.Assignee)?c.Assignee:c.Assignee?[c.Assignee]:[];
  const date=t('Due At');
  const time=/^\d{13}$/.test(date)?Number(date):Date.parse(date.replace(' ','T')+(/(?:Z|[+-]\d\d:\d\d)$/.test(date)?'':'+08:00'));
  const due=Number.isFinite(time)?new Date(time+8*3600000).toISOString().slice(0,16):'';
  return {id,sourceId:source.id,sourceLink,meetingAction:true,meetingRecordId:relations[0].recordId,project:relations[0].project,title,owner:owners.map(p=>p?.name).filter(Boolean).join('、'),due,status:t('Action Status'),priority:t('Action Priority'),note:t('Action Notes'),structured:true};
 }
 if(source.kind==='meeting'){
  const stamp=t('Meeting Date'),date=/^\d{4}-\d\d-\d\d/.exec(stamp)?.[0]||'',time=t('Meeting Time')||/[T ](\d\d:\d\d)/.exec(stamp)?.[1]||'',timezone=/(Z|[+-]\d\d:\d\d)$/.exec(stamp)?.[1]||'';
  const actions=t('Action Items').split(/\r?\n|\s+(?=\d+[.、]\s)|(?<=[。；;])(?=\d+[.、]\s)/).map(v=>v.replace(/^\d+[.、]\s*/,'').trim()).filter(Boolean);
  const participants=Array.isArray(c.Participants)?c.Participants.map(p=>typeof p==='object'?p.name:'').filter(Boolean):[];
  return {id,sourceId:source.id,sourceName:source.name,sourceLink,project:source.project,title:t('Meeting Title')||'未命名会议',type:t('Status'),meetingType:t('Meeting Type'),date,time,timezone,summary:t('Summary'),participants,decisions:[],actions:actions.map(title=>({title,owner:'',due:'',status:'未标注',structured:false})),links:[...safeLinks(c['Minutes Link'],'会议纪要'),...safeLinks(c['Recording Link'],'会议妙记')],sections:[],tags:[]};
 }
 let title,summary,sections=[],subcategory=t('Category'),specialty=t('Discipline');
 if(source.kind==='project-document'){
  const attachments=Array.isArray(c.Attachments)?c.Attachments:[],links=[...documentLinks(c['Stored Link']),...safeLinks(c['Source Files'],'源附件')];
  title=t('Summary')||attachments.map(file=>text(file)).filter(Boolean).join('、');
  if(!title&&!attachments.length&&!links.length)return null;
  return {id,sourceId:source.id,sourceName:source.name,sourceLink,title:title||'项目资料',summary:'',sections:[],category:source.category,subcategory:t('Category'),specialty,date:/^\d{4}-\d\d-\d\d/.exec(t('Shared At'))?.[0]||'',tags:[],links:links.length?links:[{label:'查看附件',url:sourceLink}],libraryScope:'project',projectScope:source.projectScope,nature:'项目资料',attachmentCount:attachments.length};
 }
 if(source.kind==='equipment'){
  const nature=t('Document Category'),links=[...documentLinks(c['Linked Document']),...safeLinks(c['Final PDF'],'定稿PDF')];
  return {id,sourceId:source.id,sourceName:source.name,sourceLink,title:t('Equipment Name')||'未命名设备',summary:'',sections:[],category:source.category,subcategory:nature,specialty,date:'',tags:[nature],links,libraryScope:'shared',projectScope:'海外',nature,format:t('Link Type'),classification:'S1.3.3',status:t('Document Status')};
 }
 if(source.kind==='lesson'){title=t('Title');summary=t('Key Points');subcategory=t('Lesson Type');sections=[['经验要点',summary],['现场核查要点',t('Checkpoints')],['适用场景',t('Scenario')],['原始场景',t('Source Context')]];}
 else if(source.kind==='index'){title=t('Document Title');summary=t('Summary');subcategory=t('Topic');sections=[['文档摘要',summary],['备注',t('Notes')]];}
 else if(source.kind==='ehs'){title=t(source.contentField);summary=t('Execution Frequency');subcategory=source.name;sections=[['分类',t('Category')],['执行频次',summary],['源附件清单',t('Source Files')]];}
 else {title=t('Subcategory')||t('Content');summary=t('Content');subcategory=source.name;sections=[['参考内容',summary],['分类',t('Category')],['涉及部门',t('Departments')]];}
 const links=[...(source.kind==='index'?documentLinks(c['Document Link']):safeLinks(c['Document Link'],'打开资料')),...safeLinks(c['Source Records'],'来源记录'),...safeLinks(c['Source Record'],'原始记录'),...safeLinks(c['Source Files'],'源附件记录')];
 const attachmentCount=Array.isArray(c.Attachments)?c.Attachments.length:0;
 if(attachmentCount&&!links.length)links.push({label:'查看附件',url:sourceLink});
 return {id,sourceId:source.id,sourceName:source.name,sourceLink,title:title||'未命名资料',summary,sections:sections.filter(([,v])=>v),category:source.category,subcategory,specialty,date:/^\d{4}-\d\d-\d\d/.exec(t('Shared At'))?.[0]||'',tags:[subcategory,t('Project')].filter(Boolean),links:[...new Map(links.map(l=>[l.url,l])).values()],attachmentCount,projectScope:libraryProjectScope(source,c),libraryScope:libraryScopeFor(source,c),nature:source.kind==='ehs'?'EHS参考':source.kind==='lesson'?'经验案例':source.kind==='reference'?'规范标准':t('Topic')||'资料'};
}
