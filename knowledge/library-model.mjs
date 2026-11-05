import {matchesDocumentProject} from '../src/project-context-model.mjs';
const text=value=>Array.isArray(value)?value.map(text).filter(Boolean).join('、'):value&&typeof value==='object'?String(value.name||value.text||''):String(value??'').trim();
export const libraryScopes=Object.freeze([
 {id:'project',name:'项目资料'},
 {id:'shared',name:'海外共用'},
 {id:'domestic',name:'国内参考'},
 {id:'general',name:'通用参考'},
]);
export function libraryProjectScope(source,cells={}){
 const project=text(cells.Project),title=text(cells['Document Title']);
 if(source.kind!=='index'||/^(泰国|泰国项目|泰国A项目|马来|马来项目|马来西亚|马来西亚项目)$/.test(project))return project;
 const thai=/泰国|Araya|Rojana/i.test(title),malaysia=/马来|Malaysia/i.test(title);
 return thai!==malaysia?(thai?'泰国':'马来'):project;
}
export function libraryScopeFor(source,cells={}){
 if(source.kind==='project-document')return 'project';
 if(source.kind==='equipment')return 'shared';
 if(['ehs','reference','lesson'].includes(source.kind))return 'domestic';
 const project=libraryProjectScope(source,cells),title=text(cells['Document Title']);
 if(/^(泰国|泰国项目|泰国A项目|马来|马来项目|马来西亚项目)$/.test(project))return 'project';
 if(project==='海外'||/新开国手册/.test(title))return 'shared';
 if(/^阿里5\.0设备厂验/.test(title))return 'domestic';
 return 'general';
}
export function withLibraryMetadata(document,source={}){
 if(!document)return document;
 const inferred=source.kind||(['standards','ehs','experience'].includes(document.category)?{standards:'reference',ehs:'ehs',experience:'lesson'}[document.category]:'index');
 const projectScope=libraryProjectScope({...source,kind:inferred},{Project:document.projectScope??(document.sourceId==='tblIJiG3OE2QGTm8'?document.tags?.at(-1)||'':''),'Document Title':document.title});
 const scope=libraryScopeFor({...source,kind:inferred},{Project:projectScope,'Document Title':document.title});
 return {...document,projectScope,libraryScope:inferred==='index'&&scope==='project'?scope:document.libraryScope||scope,nature:document.nature||({standards:'规范标准',ehs:'EHS参考',experience:'经验案例'}[document.category])||document.subcategory||'资料',...(source.libraryEntry?{libraryEntry:source.libraryEntry}:{})};
}
export function sourceTableEntries(documents){
 const safeUrl=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.href:'';}catch{return '';}};
 const keyFor=document=>document.sourceId&&document.libraryEntry?.title?JSON.stringify([document.sourceId,document.libraryScope,document.projectScope||'']):'';
 const groups=new Map();for(const document of documents){const key=keyFor(document);if(key){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...(document.members||[document]));}}
 const seen=new Set();return documents.flatMap(document=>{
  const key=keyFor(document);if(!key)return [document];if(seen.has(key))return [];seen.add(key);
  const members=groups.get(key),definition=document.libraryEntry,sections=new Map(),tags=new Set(),specialties=new Set();
  for(const member of members){for(const tag of member.tags||[])tags.add(tag);if(member.specialty)specialties.add(member.specialty);
   for(const [name,body] of member.sections||[]){const heading=['参考内容','经验要点'].includes(name)?member.title:member.title+' · '+name;const section=[heading,body];sections.set(JSON.stringify(section),section);}
  }
  const entryUrl=safeUrl(definition.url)||safeUrl(document.sourceLink);
  return [{...document,title:definition.title,note:definition.note||'',date:members.map(member=>member.date||'').sort().at(-1)||'',summary:[...new Set(members.map(member=>member.summary).filter(Boolean))].join('\n'),sections:[...sections.values()],tags:[...tags],specialties:[...specialties],specialty:specialties.size===1?[...specialties][0]:'',members,sourceLink:entryUrl,links:entryUrl?[{label:'打开源表',url:entryUrl}]:[]}];
 });
}
export function libraryDocuments(documents,{project='',scope=''}={}){
 const rows=documents.map(document=>withLibraryMetadata(document)).filter(document=>matchesDocumentProject(document,project)&&(!scope||document.libraryScope===scope));
 return sourceTableEntries(rows);
}
export function libraryMetrics(documents,project=''){
 const rows=libraryDocuments(documents,{project});
 return Object.fromEntries(libraryScopes.map(scope=>[scope.id,rows.filter(document=>document.libraryScope===scope.id).length]));
}
