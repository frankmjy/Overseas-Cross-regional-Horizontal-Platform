import {libraryScopes,libraryMetrics,libraryDocuments,documentSpecialties,regionalOfficeSections} from '/knowledge/library-model.mjs';
import {handoverStages,documentLifecycle,lifecycleDocuments} from '/knowledge/lifecycle.mjs';
import {visibleDirectory,directoryDocuments,documentDirectory} from '/knowledge/directory.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.href:'';}catch{return '';}};
const paths={info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-11v1"/>',external:'<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5v18h16V14"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',book:'<path d="M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Zm0 0v15"/>',folder:'<path d="M3 7V5h6l2 2h10v13H3Z"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',tool:'<path d="m14 6 4 4 3-3a6 6 0 0 1-8 8L6 22l-4-4 7-7a6 6 0 0 1 8-8Z"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.file}</svg>`;
paths.edit='<path d="m15 5 4 4M4 20l4.5-1 12-12a1.4 1.4 0 0 0 0-2l-1.5-1.5a1.4 1.4 0 0 0-2 0l-12 12Z"/>';
paths.taskList='<path d="m3 6 1.5 1.5L7 5m-4 7 1.5 1.5L7 11m-4 7 1.5 1.5L7 17M11 6h10m-10 6h10m-10 6h10"/>';
paths.plus='<path d="M12 5v14M5 12h14"/>';
const natureOf=document=>document.nature||document.subcategory||'其他';
const natureOrder=['手册','项目规划','运维维保需求规范','设备技术规格','培训','招采','调研','规范标准','EHS参考','经验案例','其他'];
const natureCompare=(a,b)=>(natureOrder.includes(a)?natureOrder.indexOf(a):99)-(natureOrder.includes(b)?natureOrder.indexOf(b):99)||a.localeCompare(b,'zh-CN');
const count=(rows,selection)=>lifecycleDocuments(rows,selection).length;
function navButton(id,name,state,total,graphic='folder'){
 return `<button class="category-button${state.scope===id?' selected':''}" data-library-scope="${id}" aria-pressed="${state.scope===id}">${icon(graphic)}<span>${name}</span>${total==null?'':`<b>${total}</b>`}</button>`;
}
function directory(rows,state,metrics,templateCount,compact,nodes){
 const tree=(chapter,name,graphic)=>{const roots=nodes.filter(n=>n.chapter===chapter&&!n.parentId);
  const button=n=>{const builtin=n.id.startsWith('handover:'),selected=state.directory===n.id||!state.directory&&builtin&&state.scope===chapter&&state.stage===n.stage;return `<button class="stage-button${selected?' selected':''}${n.parentId?' directory-minor':''}" data-directory-node="${esc(n.id)}" data-directory-chapter="${chapter}" aria-pressed="${selected}">${builtin?`<i>${n.stage.padStart(2,'0')}</i>`:''}<span>${esc(n.name)}</span><b>${directoryDocuments(rows,n.id,nodes).length}</b>${n.status&&n.status!=='success'?'<i title="目录待同步">•</i>':''}</button>`;};
  return `<details class="chapter-tree${state.scope===chapter?' active':''}" open><summary>${icon(graphic)}<span>${name}</span><b>${count(rows,{chapter})}</b>${icon('chevron')}</summary><div class="chapter-children">${navButton(chapter,'全部'+(chapter==='handover'?'阶段':'类别'),{...state,scope:state.stage||state.directory?'':state.scope},count(rows,{chapter}))}${roots.map(n=>{const children=nodes.filter(c=>c.parentId===n.id);return children.length?`<details class="directory-group" open><summary>${button(n)}<span class="directory-toggle">${icon('chevron')}</span></summary><div class="directory-children">${children.map(button).join('')}</div></details>`:button(n);}).join('')}</div></details>`;
 };
 const regional=rows.filter(row=>row.libraryScope==='regional');
 const regionalNav=navButton('regional','区域协作站',state.directory?{...state,scope:''}:state,regional.length,'folder');
 const regionalChildren=state.scope==='regional'?`<div class="chapter-children">${regionalOfficeSections.map(section=>`<button class="stage-button${state.directory===section.id?' selected':''}" data-directory-node="${section.id}" data-directory-chapter="regional" aria-pressed="${state.directory===section.id}"><span>${section.name}</span><b>${directoryDocuments(regional,section.id).length}</b></button>`).join('')}</div>`:'';
 return `<aside class="library-navigation"><details class="knowledge-directory"${compact?'':' open'}><summary>${icon('book')}<strong>知识目录</strong>${icon('chevron')}</summary><nav class="library-categories" aria-label="资料分类">${navButton('overview','知识总览',state,rows.length,'grid')}<div class="directory-label">项目生命周期</div>${tree('handover','接维篇','book')}${tree('operations','运维篇','tool')}${regionalNav}${regionalChildren}<div class="directory-label">参考资料</div>${navButton('domestic','国内参考',state,metrics.domestic)}${navButton('general','通用参考',state,metrics.general)}${navButton('templates','工作模板',state,templateCount)}</nav></details></aside>`;
}
function quickTags(rows,state){
 const natures=new Map(),specialties=new Map();
 for(const row of rows){const nature=natureOf(row);natures.set(nature,(natures.get(nature)||0)+1);for(const specialty of row.specialties||[row.specialty].filter(Boolean))specialties.set(specialty,(specialties.get(specialty)||0)+1);}
 const tags=(values,key,selected,label)=>`<div class="quick-filter-row ${key==='nature'?'nature-tags':'specialty-tags'}"><span class="quick-filter-label">${label}</span><div class="quick-filter-tags" role="group" aria-label="${label}快捷筛选"><button class="filter-tag${!selected.length?' selected':''}" data-${key}-all aria-pressed="${!selected.length}">全部<b>${rows.length}</b></button>${values.map(([name,total])=>`<button class="filter-tag${selected.includes(name)?' selected':''}" data-${key}-tag="${esc(name)}" aria-pressed="${selected.includes(name)}">${esc(name)}<b>${total}</b></button>`).join('')}</div></div>`;
 return `<section class="knowledge-quick-filters" aria-label="快捷筛选">${tags([...natures].sort(([a],[b])=>natureCompare(a,b)),'nature',state.natures||[],'资料性质')}${specialties.size?tags([...specialties].sort(([a],[b])=>a.localeCompare(b,'zh-CN')),'specialty',state.specialties||[],'专业'):''}</section>`;
}
export function renderLibraryShell({documents,state,project,feed,compact=false}){
 const rows=libraryDocuments(documents,{project:project.knowledgeKey}),metrics=libraryMetrics(documents,project.knowledgeKey),scope=state.scope||'overview';
 const regional=scope==='regional',nodes=visibleDirectory(feed.directoryNodes,project.knowledgeKey),selectedNode=(regional?regionalOfficeSections:nodes).find(n=>n.id===state.directory);
 const chapter=['handover','operations'].includes(scope)?scope:'',stage=scope==='handover'?handoverStages.find(entry=>entry.step===state.stage):null;
 const title=selectedNode?.name||stage?.name||({handover:'接维篇',operations:'运维篇',all:'资料总览',overview:'资料总览',templates:'工作模板',project:'项目资料',shared:'海外共用',domestic:'国内参考',general:'通用参考',regional:'区域协作站'}[scope]);
 const scoped=directoryDocuments(lifecycleDocuments(libraryDocuments(documents,{project:project.knowledgeKey,scope:regional||libraryScopes.some(s=>s.id===scope)?scope:state.ownership||''}),chapter?{chapter,stage:state.stage}:{}),state.directory,nodes);
 const sourceIds=[...new Set(scoped.map(document=>document.sourceId).filter(Boolean))];
 const sourceManagement=regional?feed.sources?.find(entry=>entry.regionalOffice)?.url:sourceIds.length===1?feed.sources?.find(entry=>entry.id===sourceIds[0])?.url:'';
 const management=sourceManagement||(!regional&&feed.projectLibraries?.find(entry=>entry.project===project.knowledgeKey)?.url);
 const toolbar=scope==='templates'?'':`<div class="library-tools"><form role="search" class="library-query">${icon('search')}<input name="query" type="search" aria-label="搜索知识资料" placeholder="搜索资料" value="${esc(state.query)}"></form>${!['domestic','general','regional'].includes(scope)?`<div class="scope-tags" role="group" aria-label="资料范围">${[['','全部'],['project','本项目'],['shared','海外共用']].map(([id,name])=>`<button data-ownership-tag="${id}" class="${state.ownership===id?'selected':''}" aria-pressed="${state.ownership===id}">${name}</button>`).join('')}</div>`:''}<label class="library-sort"><span class="sr-only">排序</span><select name="sort" aria-label="排序"><option value="latest"${state.sort!=='title'?' selected':''}>最近更新</option><option value="title"${state.sort==='title'?' selected':''}>名称排序</option></select></label><button class="filter-reset" data-reset>重置</button></div>${regional&&!scoped.length?'':quickTags(scoped,state)}`;
 return `<div class="library-layout library-reorganized library-lifecycle">${directory(rows,state,metrics,(feed.templates||[]).length,compact,nodes)}<section class="library-content"><div class="library-heading"><div>${stage?`<span class="stage-heading-number">${stage.step.padStart(2,'0')}</span>`:''}<h2>${esc(title)}</h2><span id="doc-count" role="status"></span></div>${scope!=='templates'?'<div class="library-write-actions">'+(regional?'':'<button class="button" data-new-document-category>新增类别</button>')+'<button class="button primary" data-new-document>＋ 新增资料</button><button class="tool-button" data-document-operations title="同步任务" aria-label="同步任务">'+icon('taskList')+'</button></div>':''}${management&&url(management)&&!['domestic','general','templates'].includes(scope)?`<a class="button library-manage" href="${esc(url(management))}" target="_blank" rel="noopener noreferrer">${sourceManagement?'资料管理':'项目资料管理'} ↗</a>`:''}</div>${toolbar}<div id="results" class="document-table-results"></div></section></div>`;
}
export const canEditDocument=(document,editable)=>editable&&document?.edit&&!document.members&&!document.libraryEntry&&(!document.sync||document.sync.status==='success');
const equipmentNatures=new Set(['运维维保需求规范','设备技术规格']);
const unmarkedSpecialty='未标注';
function specialtyCompare(a,b){
 const rank=name=>name===unmarkedSpecialty?Infinity:documentSpecialties.includes(name)?documentSpecialties.indexOf(name):documentSpecialties.length;
 return rank(a)-rank(b)||a.localeCompare(b,'zh-CN');
}
function groupBy(rows,keyOf){
 const groups=new Map();
 for(const row of rows){
  const key=keyOf(row);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 return [...groups];
}
function groupHeading(key,label,count,collapsed,defaults){
 return `<button class="document-group-toggle" data-document-group="${esc(key)}" aria-expanded="${!collapsed}">${icon('chevron')}<span>${esc(label)}</span><b>${count}</b></button>${defaults?`<button type="button" class="document-group-add" data-group-add="${esc(JSON.stringify(defaults))}" title="新增资料" aria-label="在${esc(label)}新增资料">${icon('plus')}</button>`:''}`;
}
function groupDefaults(nature,rows,selection,specialty){
 const common=read=>{const value=read(rows[0]);return value&&rows.every(row=>read(row)===value)?value:undefined;};
 return {nature,
  scope:['project','shared','domestic','general','regional'].includes(selection.scope)?selection.scope:selection.ownership||common(row=>row.libraryScope),
  chapter:['handover','operations'].includes(selection.scope)?selection.scope:common(row=>documentLifecycle(row).chapter),
  stage:selection.stage||common(row=>documentLifecycle(row).stage),
  directoryId:selection.directory||common(documentDirectory),
  specialty:documentSpecialties.includes(specialty)?specialty:undefined};
}
function materialCard(document,editable,grouped){
 const destination=document.links?.map(link=>url(link.url)).find(Boolean);
 const specialties=grouped?[]:document.specialties||[document.specialty].filter(Boolean);
 const title=destination?`<a class="document-title-button" href="${esc(destination)}" target="_blank" rel="noopener noreferrer" title="${esc(document.title)}">${esc(document.title)}</a>`:`<button class="document-title-button" data-document="${esc(document.id)}" title="${esc(document.title)}">${esc(document.title)}</button>`;
 const editableCard=canEditDocument(document,editable);
 return `<article class="material-card"${editableCard?' data-card-edit':''}><span class="material-file-icon${document.members?' is-collection':''}">${icon(document.members?'folder':'file')}</span><div class="material-card-content">${title}${document.members&&document.note?`<p class="material-note" title="${esc(document.note)}">${esc(document.note)}</p>`:''}${document.date||specialties.length||document.members||document.sync||(editableCard&&!destination)?`<div class="material-meta">${document.date?`<time>${esc(document.date)}</time>`:''}${specialties.length?`<span title="${esc(specialties.join(' / '))}">${esc(specialties.slice(0,3).join(' / '))}${specialties.length>3?'…':''}</span>`:''}${document.members?`<span>${document.members.length} 条记录</span>`:''}${editableCard&&!destination?'<span class="document-missing">待补</span>':''}${document.sync?`<span class="document-sync ${document.sync.status==='error'?'error':''}" title="${esc(document.sync.error||'')}">${document.sync.status==='success'?'已同步':document.sync.uploads?.some(u=>!u.ready)?'待上传':document.sync.status==='error'?'同步失败':'同步中'}</span>${document.sync.canRetry&&document.sync.status!=='success'?`<button class="document-sync-retry" data-${document.sync.uploads?.some(u=>!u.ready)?'document-upload':'document-retry'}="${esc(document.sync.id)}">${document.sync.uploads?.some(u=>!u.ready)?'补传附件':'重试'}</button>`:''}`:''}</div>`:''}</div><div class="material-actions"><button data-document="${esc(document.id)}" title="资料详情" aria-label="查看 ${esc(document.title)} 详情">${icon('info')}</button>${editableCard?`<button data-edit-document="${esc(document.id)}" title="编辑资料" aria-label="编辑 ${esc(document.title)}">${icon('edit')}</button>`:destination?`<a href="${esc(destination)}" target="_blank" rel="noopener noreferrer" title="打开资料" aria-label="打开 ${esc(document.title)}">${icon('external')}</a>`:'<span class="document-missing">待补</span>'}</div></article>`;
}
export function renderDocumentCards(rows,{limit=60,collapsedGroups=[],editable=false,selection={}}={}){
 if(!rows.length)return '<p class="library-empty">暂无资料</p>';
 const collapsed=new Set(collapsedGroups);
 let visible=0,expandedCount=0;
 function grid(documents,grouped){
  expandedCount+=documents.length;
  const shown=documents.slice(0,Math.max(0,limit-visible));
  visible+=shown.length;
  return shown.length?`<div class="material-grid">${shown.map(document=>materialCard(document,editable,grouped)).join('')}</div>`:'';
 }
 const body=groupBy(rows,natureOf).sort(([a],[b])=>natureCompare(a,b)).map(([name,documents])=>{
  const isGrouped=equipmentNatures.has(name);
  const isCollapsed=collapsed.has(name);
  let content='';
  if(!isCollapsed){
   content=isGrouped?groupBy(documents,document=>document.specialty||unmarkedSpecialty)
    .sort(([a],[b])=>specialtyCompare(a,b)).map(([specialty,items])=>{
     const key='specialty:'+JSON.stringify([name,specialty]);
     const hidden=collapsed.has(key),cards=hidden?'':grid(items,true);
     return hidden||cards?`<div class="material-specialty"><h4>${groupHeading(key,specialty,items.length,hidden,editable&&groupDefaults(name,items,selection,specialty))}</h4>${cards}</div>`:'';
    }).join(''):grid(documents,false);
  }
  return isCollapsed||content?`<section class="material-section${isGrouped?' is-specialty-grouped':''}"><h3>${groupHeading(name,name,documents.length,isCollapsed,editable&&groupDefaults(name,documents,selection,selection.specialties?.length===1?selection.specialties[0]:''))}</h3>${content}</section>`:'';
 }).join('');
 return `<div class="material-sections">${body}</div>${expandedCount>visible?`<button class="button" data-more>加载更多（${visible} / ${expandedCount}）</button>`:''}`;
}
export function renderTemplateEntries(templates){return templates.length?`<div class="template-entry-grid">${templates.map(entry=>url(entry.url)?`<a href="${esc(url(entry.url))}" target="_blank" rel="noopener noreferrer">${icon('file')}<span>${esc(/[（(]([^）)]+)[）)]/.exec(entry.name)?.[1]||entry.name.replace(/^\d+(?:\.\d+)*\s+/,''))}</span><b>↗</b></a>`:'').join('')}</div>`:'<p class="library-empty">暂无模板</p>';}
