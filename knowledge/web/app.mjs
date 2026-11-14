import {renderLibraryShell,renderDocumentCards,renderTemplateEntries,canEditDocument} from './library-ui.mjs';
import {libraryDocuments} from '/knowledge/library-model.mjs';
import {handoverStages,lifecycleDocuments} from '/knowledge/lifecycle.mjs';
import {directoryDocuments} from '/knowledge/directory.mjs';
import { requirePlatformProject, currentPageEditable } from '/src/platform-context.js';
const platformProject = await requirePlatformProject();
import {renderPlatformHeader} from '/src/platform-navigation.js';
import {filterDocuments} from './data.mjs';
import {renderMeetingTrail} from './meeting-trail.mjs';
import {openMeetingEditor,retryMeeting,watchMeetingSync} from './meeting-editor.mjs';
import {openDocumentEditor,openDocumentUpdate,primeDocumentOptions,retryDocument,resumeDocumentUpload,watchDocumentSync,showDocumentOperations} from './document-editor.mjs';
import {readMinutes,cancelMinutes} from './minutes-reader.mjs';
const paths={book:'<path d="M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Zm0 0v15"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 11h18"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.file}</svg>`;
paths.refresh='<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 4M5 14a8 8 0 0 0 13 4"/>';
paths.external='<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>';
paths.grid='<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>`<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
const root=document.querySelector('#app'),dialog=document.querySelector('#detail');
let documents=[],meetings=[],categories=[],sources=[],feed={state:'loading',errors:[],refreshing:false},loading=false,limit=60,detailTrigger;
function readState(){
 const p=new URLSearchParams(location.search),scope=['all','handover','operations','project','shared','domestic','general','regional','templates'].includes(p.get('scope'))?p.get('scope'):'overview';
 const stage=scope==='handover'?handoverStages.find(stage=>stage.step===p.get('stage')):null;
 return {view:location.pathname==='/meeting-trail'||p.get('view')==='meetings'?'meetings':'library',project:platformProject.knowledgeKey,includeShared:true,scope,
 stage:stage?.step||'',directory:p.get('directory')||'',group:'',folder:'',natures:p.getAll('nature'),specialties:p.getAll('discipline'),collapsedGroups:[],ownership:['project','shared'].includes(p.get('ownership'))?p.get('ownership'):'',
 meetingScope:['thailand','malaysia','overseas'].includes(p.get('meetingScope'))?p.get('meetingScope'):'',meetingType:p.get('meetingType')||'',meetingRange:[30,90].includes(Number(p.get('meetingRange')))?Number(p.get('meetingRange')):0,week:0,allActions:false,missing:p.get('missing')==='1',query:p.get('q')||'',category:p.get('category')||'',subcategory:p.get('subcategory')||'',specialty:p.get('specialty')||'',type:p.get('type')||'',date:/^\d{4}-\d{2}-\d{2}$/.test(p.get('date')||'')?p.get('date'):'',sort:p.get('sort')==='title'?'title':'latest'};
}
let state=readState();
function saveState(){const p=new URLSearchParams();for(const key of state.view==='meetings'?['project','meetingScope','meetingType','meetingRange','missing','query','type','date']:['project','scope','stage','directory','group','folder','ownership','query','category','subcategory','specialty','sort'])if(state[key]&&!(key==='sort'&&state[key]==='latest'))p.set(key==='query'?'q':key,key==='missing'?'1':state[key]);for(const nature of state.natures||[])p.append('nature',nature);for(const specialty of state.specialties||[])p.append('discipline',specialty);history.replaceState(null,'',(state.view==='meetings'?'/meeting-trail':'/knowledge-sharing')+(p.size?'?'+p:''));}
function empty(label){if(feed.state==='loading'&&!documents.length&&!meetings.length)return '<div class="empty" role="status">正在读取多维表资料，请稍候。</div>';if(feed.state==='error')return '<div class="empty"><h3>数据读取失败</h3><p>请检查飞书连接后重试。</p><button class="button" data-refresh>重新读取</button></div>';return `<div class="empty"><h3>没有找到${label}</h3><p>当前表中暂无内容，或没有匹配筛选条件的记录。</p><button class="button" data-reset>清空筛选</button></div>`;}
function connection(){
 const warning=['error','partial'].includes(feed.state),label=feed.state==='loading'?'正在读取':feed.state==='error'?'读取失败':feed.state==='partial'?'部分资料未更新':'已连接';
 const updated=feed.updatedAt?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(feed.updatedAt)):'';
 return `<div class="connection-tools">${state.view==='meetings'&&currentPageEditable('meetings')?'<button class="button primary new-meeting-button" data-new-meeting>＋ 新增会议</button>':''}<span class="connection-state ${warning?'warning':''}" role="status" aria-label="${label}${updated?' · '+updated:''}" title="${label}${updated?' · '+updated:''}"><i></i>${updated?`<time datetime="${esc(feed.updatedAt)}">${esc(updated)}</time>`:''}</span><button class="tool-button" data-refresh aria-label="刷新数据" title="刷新数据" ${loading?'disabled':''}>${icon('refresh')}</button>${feed.architectureUrl?`<a class="tool-button" href="${esc(feed.architectureUrl)}" target="_blank" rel="noopener noreferrer" aria-label="架构索引" title="架构索引">${icon('external')}</a>`:''}</div>`;
}
function render(){
 const library=state.view==='library';document.title=`${library?'知识共享':'议事航迹'} · 海外运维协作平台`;
 root.innerHTML=`${renderPlatformHeader(library?'knowledge':'meetings')}<div class="workspace"><header class="knowledge-toolbar"><h1>${library?'知识共享':'议事航迹'}</h1><span class="workspace-project-name">${esc(platformProject.name)}</span>${connection()}</header>${feed.errors.length?`<div class="connection-errors" role="alert">${feed.errors.map(e=>`<p>${esc(e.name)}：${esc(e.message)}</p>`).join('')}</div>`:''}<main>${library?libraryShell():meetingShell()}</main></div>`;updateResults();
}
function libraryRows(){
 const scope=['project','shared','domestic','general','regional'].includes(state.scope)?state.scope:state.ownership;
 const rows=libraryDocuments(documents,{project:platformProject.knowledgeKey,scope});
 return directoryDocuments(lifecycleDocuments(rows,['handover','operations'].includes(state.scope)?{chapter:state.scope,stage:state.stage}:{}),state.directory,feed.directoryNodes||[]);
}
function libraryShell(){return renderLibraryShell({documents,state,project:platformProject,feed,compact:typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches});}
function meetingShell(){return '<div class="meeting-trail" id="meetingTrail"></div>';}

function updateResults(){saveState();if(state.view==='library'){
 if(state.scope==='templates'){document.querySelector('#doc-count').textContent=(feed.templates||[]).length+' 个';document.querySelector('#results').innerHTML=renderTemplateEntries(feed.templates||[]);}else{const shown=filterDocuments(libraryRows(),state),visibleLimit=limit;document.querySelector('#doc-count').textContent=shown.length+' 份';document.querySelector('#results').innerHTML=feed.state==='loading'&&!documents.length?'<p class="library-empty" role="status">正在读取资料…</p>':feed.state==='error'&&!documents.length?'<div class="library-empty" role="alert">资料读取失败 <button class="button" data-refresh>重试</button></div>':renderDocumentCards(shown,{limit:visibleLimit,collapsedGroups:state.collapsedGroups||[],editable:currentPageEditable('knowledge'),selection:state});}
 }else{
 const field=document.activeElement?.matches('#meetingTrail [name=query]')?document.activeElement:null;
 const cursor=field?.selectionStart;
 document.querySelector('#meetingTrail').innerHTML=renderMeetingTrail({meetings,sources,state,feed,project:platformProject.knowledgeKey});
 if(field){const input=document.querySelector('#meetingTrail [name=query]');input?.focus();input?.setSelectionRange(cursor,cursor);}
 }renderSyncLabels();}
function openDetail(kind,id,trigger){
 const isDocument=kind==='document',r=(isDocument?libraryDocuments(documents,{project:platformProject.knowledgeKey}):meetings).find(item=>item.id===id);
 if(!r)return;
 cancelMinutes();detailTrigger=trigger;
 const hasMinutes=!isDocument&&r.links.some(l=>l.label==='会议纪要');
 const canEdit=isDocument&&canEditDocument(r,currentPageEditable('knowledge'));
 const sections=isDocument?(r.members&&r.note?[['备注',r.note],...r.sections]:r.sections):[['会议概要',r.summary],['参与人员',r.participants.join('、')],['跟进事项',r.actions.map((a,i)=>(i+1)+'. '+a.title+[a.owner,a.due?.replace('T',' '),a.status].filter(Boolean).map(v=>' · '+v).join('')).join('\n')]].filter(([,body])=>body);
 dialog.innerHTML=`<header><div><span class="section-kicker">${isDocument?'资料详情':'会议记录'}</span><h2 id="detail-title"><span data-business-text>${esc(r.title)}</span></h2></div><button class="close-button" data-close aria-label="关闭详情" title="关闭详情">${icon('close')}</button></header><div class="detail-content"><div class="detail-meta">${esc(r.sourceName)}${r.date?' · '+esc(r.date+' '+(r.time||'')):''}</div>${sections.map(([name,body])=>`<section class="detail-section"><h3>${esc(name)}</h3><p data-business-text>${esc(body)}</p></section>`).join('')}${hasMinutes?'<section class="detail-section minutes-section"><h3>会议纪要</h3><div id="meeting-minutes"></div></section>':''}<section class="detail-section"><h3>资料与来源</h3><div class="source-links">${r.links.map(l=>link(l.url,l.label)).join('')}${r.sourceLink?link(r.sourceLink,'打开多维表记录'):''}${isDocument?'':r.actions.filter(a=>a.sourceLink).map(a=>link(a.sourceLink,a.title)).join('')}</div></section></div><footer><span>${r.sync&&r.sync.status!=='success'?'待同步':''}</span>${canEdit?'<button class="button primary" data-edit-document>编辑资料</button>':'<button class="button" data-close>关闭详情</button>'}</footer>`;
 const edit=dialog.querySelector('[data-edit-document]');
 if(edit)edit.onclick=()=>startDocumentUpdate(r,edit);
 dialog.showModal();if(hasMinutes)readMinutes(dialog.querySelector('#meeting-minutes'),id);
}
function startDocumentUpdate(record,trigger){
 if(!canEditDocument(record,currentPageEditable('knowledge')))return;
 openDocumentUpdate(platformProject.knowledgeKey,record,trigger,async refresh=>{
  if(refresh){await load(true);return;}
  if(dialog.open&&dialog.contains(trigger))dialog.close();
  await refreshMeetingSnapshot();
 });
}
async function load(refresh=false){if(loading)return;loading=true;feed.waiting=false;render();try{for(let attempt=0;attempt<45;attempt++){const response=await fetch('/api/knowledge?'+new URLSearchParams({...(state.view==='meetings'?{meetingOverview:'1'}:{}),...(refresh&&attempt===0?{refresh:'1'}:{})}),{signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'知识共享读取失败。');documents=result.documents;meetings=result.meetings;categories=result.categories;sources=result.sources;feed=result;if(!result.refreshing){loading=false;render();return;}if(attempt===44){feed.waiting=true;break;}if(attempt===0||attempt%5===0)render();await new Promise(resolve=>setTimeout(resolve,1500));}}catch(e){feed={...feed,state:documents.length||meetings.length?'partial':'error',errors:[{name:'数据连接',message:e.name==='TimeoutError'?'读取超时，请重试。':e.message}]};}finally{loading=false;render();}}
root.addEventListener('click',event=>{const target=event.target.closest('a,button');if(!target)return;if('natureTag'in target.dataset||'natureAll'in target.dataset||'specialtyTag'in target.dataset||'specialtyAll'in target.dataset){const isNature='natureTag'in target.dataset||'natureAll'in target.dataset,key=isNature?'natures':'specialties',value=isNature?target.dataset.natureTag:target.dataset.specialtyTag;const values=state[key]||[];state[key]=value?(values.includes(value)?values.filter(item=>item!==value):[...values,value]):[];state.subcategory='';state.specialty='';state.collapsedGroups=[];limit=60;render();}else if('ownershipTag'in target.dataset){state.ownership=target.dataset.ownershipTag;state.natures=[];state.specialties=[];state.subcategory='';state.specialty='';state.collapsedGroups=[];limit=60;render();}else if(target.dataset.documentGroup){const values=state.collapsedGroups||[],value=target.dataset.documentGroup;state.collapsedGroups=values.includes(value)?values.filter(item=>item!==value):[...values,value];updateResults();}else if(target.dataset.directoryNode){state={...state,scope:target.dataset.directoryChapter,directory:target.dataset.directoryNode,stage:'',ownership:'',query:'',natures:[],specialties:[],collapsedGroups:[]};limit=60;render();}else if(target.dataset.libraryScope){state={...state,scope:target.dataset.libraryScope,directory:'',natures:[],specialties:[],collapsedGroups:[],stage:'',group:'',folder:'',ownership:'',query:'',category:'',subcategory:'',specialty:''};limit=60;render();}else if('libraryStage'in target.dataset||target.dataset.libraryGroup||target.dataset.libraryFolder||target.dataset.libraryOperation){const folder=target.dataset.libraryFolder;const stage=handoverStages.find(stage=>stage.step===target.dataset.libraryStage||stage.step===target.dataset.stage||stage.groups.some(group=>group.folders.some(item=>item.code===folder)));const group=folder?stage?.groups.find(group=>group.folders.some(item=>item.code===folder))?.id:target.dataset.libraryGroup||target.dataset.libraryOperation||'';state={...state,scope:target.dataset.libraryOperation?'operations':'handover',natures:[],specialties:[],collapsedGroups:[],stage:stage?.step||'',group,folder:folder||'',ownership:'',query:'',category:'',subcategory:'',specialty:''};limit=60;render();}else if(target.dataset.view){if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();state={...readState(),view:target.dataset.view,query:'',category:'',subcategory:'',specialty:'',project:platformProject.knowledgeKey,type:''};limit=60;render();}else if('category'in target.dataset){state.category=state.category===target.dataset.category?'':target.dataset.category;state.subcategory='';state.specialty='';limit=60;render();}else if('specialty'in target.dataset){state.specialty=state.specialty===target.dataset.specialty?'':target.dataset.specialty;state.subcategory='';limit=60;render();}else if('meetingScope'in target.dataset){Object.assign(state,{meetingScope:target.dataset.meetingScope,meetingType:target.dataset.meetingType||'',meetingRange:Number(target.dataset.meetingRange)||0,missing:'meetingMissing'in target.dataset,date:'',query:'',type:''});updateResults();const focus=document.querySelector('[data-meeting-scope][aria-current=page]');focus?.focus();}else if('meetingDay'in target.dataset){state.date=state.date===target.dataset.meetingDay?'':target.dataset.meetingDay;updateResults();}else if('meetingWeek'in target.dataset){state.week=target.dataset.meetingWeek==='0'?0:state.week+Number(target.dataset.meetingWeek);state.date='';updateResults();document.querySelector('[data-meeting-week="'+target.dataset.meetingWeek+'"]')?.focus();}else if('meetingPeriod'in target.dataset){state.period=Number(target.dataset.meetingPeriod);updateResults();document.querySelector('[data-meeting-period="'+state.period+'"]')?.focus();}else if('meetingActions'in target.dataset){state.allActions=!state.allActions;updateResults();document.querySelector('[data-meeting-actions]')?.focus();}else if('archiveType'in target.dataset){state.meetingType=target.dataset.archiveType;updateResults();document.querySelector('[data-archive-type][aria-pressed=true]')?.focus();}else if('meetingClear'in target.dataset){Object.assign(state,{meetingType:'',meetingRange:0,missing:false,date:'',query:'',type:''});updateResults();}else if('reset'in target.dataset){state={...state,ownership:'',natures:[],specialties:[],collapsedGroups:[],query:'',category:'',subcategory:'',specialty:'',type:'',date:'',sort:'latest'};limit=60;render();}else if('refresh'in target.dataset)load(true);else if('more'in target.dataset){limit+=60;updateResults();}else if(target.dataset.document)openDetail('document',target.dataset.document,target);else if(target.dataset.meeting)openDetail('meeting',target.dataset.meeting,target);});
root.addEventListener('input',event=>{if(event.target.name==='query'){state.query=event.target.value;limit=60;updateResults();}});
root.addEventListener('change',event=>{if(event.target.name==='ownership'){state.ownership=event.target.value;state.subcategory='';state.specialty='';limit=60;render();}else if(['subcategory','specialty','sort','type'].includes(event.target.name)){state[event.target.name]=event.target.value;limit=60;updateResults();}});
root.addEventListener('submit',event=>{if(event.target.matches('[role=search]')){event.preventDefault();updateResults();}});
dialog.addEventListener('click',event=>{if(event.target.closest('[data-close]'))dialog.close();});dialog.addEventListener('close',()=>{cancelMinutes();if(detailTrigger?.isConnected)detailTrigger.focus();});
async function refreshMeetingSnapshot(project){const response=await fetch('/api/knowledge'+(state.view==='meetings'?'?meetingOverview=1':''),{signal:AbortSignal.timeout(15000)}),result=await response.json();if(!response.ok||!result.ok)throw Error('会议清单暂未更新，请刷新查看。');documents=result.documents;meetings=result.meetings;categories=result.categories;sources=result.sources;feed=result;if(project){state={...state,meetingScope:project,query:'',type:'',date:'',meetingType:'',meetingRange:0,missing:false};}render();}
function renderSyncLabels(){for(const row of document.querySelectorAll('.meeting-row')){const id=row.querySelector('[data-meeting]')?.dataset.meeting,m=meetings.find(m=>m.id===id);if(!m?.sync||m.sync.status==='success')continue;if(row.querySelector('.meeting-sync'))continue;const wrap=document.createElement('div');wrap.className='meeting-sync '+(m.sync.status==='error'?'error':'');wrap.innerHTML=m.sync.status==='error'?`<span>${esc(m.sync.error)}</span><button class="text-button" data-meeting-retry="${esc(m.sync.id)}">重试同步</button>`:'<span>已保存 · 正在同步</span>';(row.querySelector('.document-body')||row).append(wrap);}}
root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(!currentPageEditable('meetings'))return;if('newMeeting'in button.dataset)openMeetingEditor(state.meetingScope||state.project,button,refreshMeetingSnapshot);else if(button.dataset.meetingRetry)retryMeeting(button.dataset.meetingRetry,refreshMeetingSnapshot);});
root.addEventListener('click',event=>{
 if(!currentPageEditable('knowledge'))return;
 const control=event.target.closest('a,button');
 if(control?.matches('a'))return;
 const button=control||event.target.closest('[data-card-edit]')?.querySelector('[data-edit-document]');
 if(!button)return;
 if(button.dataset.editDocument){startDocumentUpdate(documents.find(record=>record.id===button.dataset.editDocument),button);return;}
 const groupDefaults=button.dataset.groupAdd?JSON.parse(button.dataset.groupAdd):undefined;
 let revealGroup=button.previousElementSibling?.dataset.documentGroup;
 const saved=async selection=>{
  if(selection){state={...state,scope:selection.chapter,directory:selection.directory,stage:'',ownership:'',natures:[],specialties:[],query:''};}
  if(groupDefaults&&revealGroup){state.collapsedGroups=state.collapsedGroups.filter(key=>key!==revealGroup&&key!==groupDefaults.nature);revealGroup='';}
  await refreshMeetingSnapshot();
 };
 if('newDocument'in button.dataset||'newDocumentCategory'in button.dataset||button.dataset.groupAdd){
  openDocumentEditor({...state,groupDefaults,project:platformProject.knowledgeKey,name:platformProject.name},button,saved,'newDocumentCategory'in button.dataset?'category':'document');
 }
 else if(button.dataset.documentRetry)retryDocument(button.dataset.documentRetry,saved);
 else if(button.dataset.documentUpload)resumeDocumentUpload(button.dataset.documentUpload,saved);
 else if('documentOperations'in button.dataset)showDocumentOperations(saved);
});
if(state.view==='library'&&currentPageEditable('knowledge'))primeDocumentOptions().catch(()=>{});
addEventListener('popstate',()=>{if(dialog.open)dialog.close();state=readState();limit=60;render();});render();load().then(()=>{if(state.view==='meetings'&&meetings.some(m=>m.sync&&['accepted','syncing'].includes(m.sync.status)))watchMeetingSync(refreshMeetingSnapshot);else if(state.view==='library'&&(documents.some(d=>d.sync&&['accepted','syncing'].includes(d.sync.status))||(feed.directoryNodes||[]).some(n=>['accepted','syncing'].includes(n.status))))watchDocumentSync(()=>refreshMeetingSnapshot());});
