const text=v=>v==null?'':Array.isArray(v)?v.map(text).filter(Boolean).join('、'):typeof v==='object'?String(v.name||v.text||''):String(v).trim();
export function safeLinks(value,label='来源资料'){
 const raw=text(value),urls=[...raw.matchAll(/https:\/\/[^\s<>"\[\]]+/g)].map(m=>m[0].replace(/[)）。，；;]+$/g,''));
 return [...new Set(urls)].flatMap(url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?[{label,url:u.href}]:[]}catch{return []}});
}
export function projectRecord(source,row,baseUrl){
 const c=row.cells,t=n=>text(c[n]),sourceLink=`${baseUrl}?table=${source.id}&record=${row.id}`,id=source.id+':'+row.id;
 if(source.kind==='meeting'){
  const stamp=t('Meeting Date'),date=/^\d{4}-\d\d-\d\d/.exec(stamp)?.[0]||'',time=t('Meeting Time')||/[T ](\d\d:\d\d)/.exec(stamp)?.[1]||'',timezone=/(Z|[+-]\d\d:\d\d)$/.exec(stamp)?.[1]||'';
  const action=t('Action Items');
  return {id,sourceId:source.id,sourceName:source.name,sourceLink,project:source.project,title:t('Meeting Title')||'未命名会议',type:t('Status'),date,time,timezone,summary:t('Summary'),participants:[],decisions:[],actions:action?[{title:action,owner:'',due:'',status:'未标注',structured:false}]:[],links:[...safeLinks(c['Minutes Link'],'会议纪要'),...safeLinks(c['Recording Link'],'会议妙记')],sections:[],tags:[]};
 }
 let title,summary,sections=[],subcategory=t('Category'),specialty=t('Discipline');
 if(source.kind==='lesson'){title=t('Title');summary=t('Key Points');subcategory=t('Lesson Type');sections=[['经验要点',summary],['现场核查要点',t('Checkpoints')],['适用场景',t('Scenario')],['原始场景',t('Source Context')]];}
 else if(source.kind==='index'){title=t('Document Title');summary=t('Summary');subcategory=t('Topic');sections=[['文档摘要',summary],['备注',t('Notes')]];}
 else if(source.kind==='ehs'){title=t(source.contentField);summary=t('Execution Frequency');subcategory=source.name;sections=[['分类',t('Category')],['执行频次',summary],['源附件清单',t('Source Files')]];}
 else {title=t('Subcategory')||t('Content');summary=t('Content');subcategory=source.name;sections=[['参考内容',summary],['分类',t('Category')],['涉及部门',t('Departments')]];}
 const links=[...safeLinks(c['Document Link'],'打开资料'),...safeLinks(c['Source Records'],'来源记录'),...safeLinks(c['Source Record'],'原始记录'),...safeLinks(c['Source Files'],'源附件记录')];
 return {id,sourceId:source.id,sourceName:source.name,sourceLink,title:title||'未命名资料',summary,sections:sections.filter(([,v])=>v),category:source.category,subcategory,specialty,date:/^\d{4}-\d\d-\d\d/.exec(t('Shared At'))?.[0]||'',tags:[subcategory,t('Project')].filter(Boolean),links:[...new Map(links.map(l=>[l.url,l])).values()]};
}
