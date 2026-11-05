import {libraryScopeFor,libraryProjectScope} from './library-model.mjs';
const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('、'):typeof v==='object'?String(v.name||v.text||''):String(v).trim();
export function safeLinks(value,label='来源资料'){
 const raw=text(value),urls=[...raw.matchAll(/https:\/\/[^\s<>"\[\]]+/g)].map(m=>m[0].replace(/[)）。，；;]+$/g,''));
 return [...new Set(urls)].flatMap(url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?[{label,url:u.href}]:[]}catch{return []}});
}
export function projectRecord(source,row,baseUrl){
 const record=baseRecord(source,row,baseUrl);if(!record||source.kind==='meeting')return record;
 const c=row.cells,directoryId=text(c['Directory Category ID']),scope=text(c['Library Scope']),chapter=text(c['Lifecycle Chapter']),stage=text(c['Lifecycle Stage']),note=text(c.Notes),specialty=text(c.Discipline);
 return {...record,...['project','shared','domestic','general'].includes(scope)?{libraryScope:source.kind==='project-document'?'project':scope,...note?{note}:{}}:{},...directoryId?{directoryId}:{},...chapter?{lifecycle:{chapter,stage,directoryId}}:{},...specialty?{specialty}:{},...source.kind==='project-document'&&text(c.Category)?{nature:text(c.Category)}:{}};
}
function baseRecord(source,row,baseUrl){
 const c=row.cells,t=n=>text(c[n]),sourceLink=`${baseUrl}?table=${source.id}&record=${row.id}`,id=source.id+':'+row.id;
 if(source.kind==='meeting'){
  const stamp=t('Meeting Date'),date=/^\d{4}-\d\d-\d\d/.exec(stamp)?.[0]||'',time=t('Meeting Time')||/[T ](\d\d:\d\d)/.exec(stamp)?.[1]||'',timezone=/(Z|[+-]\d\d:\d\d)$/.exec(stamp)?.[1]||'';
  const actions=t('Action Items').split(/\r?\n|\s+(?=\d+[.、]\s)|(?<=[。；;])(?=\d+[.、]\s)/).map(v=>v.replace(/^\d+[.、]\s*/,'').trim()).filter(Boolean);
  const participants=Array.isArray(c.Participants)?c.Participants.map(p=>typeof p==='object'?p.name:'').filter(Boolean):[];
  return {id,sourceId:source.id,sourceName:source.name,sourceLink,project:source.project,title:t('Meeting Title')||'未命名会议',type:t('Status'),date,time,timezone,summary:t('Summary'),participants,decisions:[],actions:actions.map(title=>({title,owner:'',due:'',status:'未标注',structured:false})),links:[...safeLinks(c['Minutes Link'],'会议纪要'),...safeLinks(c['Recording Link'],'会议妙记')],sections:[],tags:[]};
 }
 let title,summary,sections=[],subcategory=t('Category'),specialty=t('Discipline');
 if(source.kind==='project-document'){
  const attachments=Array.isArray(c.Attachments)?c.Attachments:[],links=[...safeLinks(c['Stored Link'],'打开资料'),...safeLinks(c['Source Files'],'源附件')];
  title=t('Summary')||attachments.map(file=>text(file)).filter(Boolean).join('、');
  if(!title&&!attachments.length&&!links.length)return null;
  return {id,sourceId:source.id,sourceName:source.name,sourceLink,title:title||'项目资料',summary:'',sections:[],category:source.category,subcategory:t('Category'),specialty,date:/^\d{4}-\d\d-\d\d/.exec(t('Shared At'))?.[0]||'',tags:[],links:links.length?links:[{label:'查看附件',url:sourceLink}],libraryScope:'project',projectScope:source.projectScope,nature:'项目资料',attachmentCount:attachments.length};
 }
 if(source.kind==='equipment'){
  const nature=t('Document Category'),links=[...safeLinks(c['Linked Document'],'打开资料'),...safeLinks(c['Final PDF'],'定稿PDF')];
  return {id,sourceId:source.id,sourceName:source.name,sourceLink,title:t('Equipment Name')||'未命名设备',summary:'',sections:[],category:source.category,subcategory:nature,specialty,date:'',tags:[nature],links,libraryScope:'shared',projectScope:'海外',nature,format:t('Link Type'),classification:'S1.3.3',status:t('Document Status')};
 }
 if(source.kind==='lesson'){title=t('Title');summary=t('Key Points');subcategory=t('Lesson Type');sections=[['经验要点',summary],['现场核查要点',t('Checkpoints')],['适用场景',t('Scenario')],['原始场景',t('Source Context')]];}
 else if(source.kind==='index'){title=t('Document Title');summary=t('Summary');subcategory=t('Topic');sections=[['文档摘要',summary],['备注',t('Notes')]];}
 else if(source.kind==='ehs'){title=t(source.contentField);summary=t('Execution Frequency');subcategory=source.name;sections=[['分类',t('Category')],['执行频次',summary],['源附件清单',t('Source Files')]];}
 else {title=t('Subcategory')||t('Content');summary=t('Content');subcategory=source.name;sections=[['参考内容',summary],['分类',t('Category')],['涉及部门',t('Departments')]];}
 const links=[...safeLinks(c['Document Link'],'打开资料'),...safeLinks(c['Source Records'],'来源记录'),...safeLinks(c['Source Record'],'原始记录'),...safeLinks(c['Source Files'],'源附件记录')];
 const attachmentCount=Array.isArray(c.Attachments)?c.Attachments.length:0;
 if(attachmentCount&&!links.length)links.push({label:'查看附件',url:sourceLink});
 return {id,sourceId:source.id,sourceName:source.name,sourceLink,title:title||'未命名资料',summary,sections:sections.filter(([,v])=>v),category:source.category,subcategory,specialty,date:/^\d{4}-\d\d-\d\d/.exec(t('Shared At'))?.[0]||'',tags:[subcategory,t('Project')].filter(Boolean),links:[...new Map(links.map(l=>[l.url,l])).values()],attachmentCount,projectScope:libraryProjectScope(source,c),libraryScope:libraryScopeFor(source,c),nature:source.kind==='ehs'?'EHS参考':source.kind==='lesson'?'经验案例':source.kind==='reference'?'规范标准':t('Topic')||'资料'};
}
