import { requirePlatformProject } from './platform-context.js';
await requirePlatformProject();
import {renderMaterialRows,renderMaterialSummary} from './coordination-list.js';
import {createMaterialEditor} from './coordination-editor.js';
import {renderPlatformHeader} from './platform-navigation.js';
import {materialFields,groups,filterMaterials,materialListView} from '/coordination/model.mjs';

const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v==null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v);
const money=v=>v==null?'—':new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${{box:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',arrow:'<path d="m9 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'}[name]||''}</svg>`;
const viewKeys=['group','pageSize'],collapsedGroups=new Set();
const filterKeys=['primary','category','specialty','requirement','region','architecture','level','sort'];
let currentGroupIds=[];
function readState(){const p=new URLSearchParams(location.search);return Object.fromEntries([...filterKeys,...viewKeys,'q','page','platform'].map(k=>[k,p.get(k)||({page:'1',platform:'materials',group:'specialty-category',pageSize:'50'}[k]||'')]));}
let state=readState(),feed={state:'loading',records:[],refreshing:false},busy=false,controller,requestVersion=0,trigger,detailId;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function save(){const p=new URLSearchParams();p.set('platform',state.platform);for(const k of [...filterKeys,...viewKeys,'q'])if(state[k])p.set(k,state[k]);if(Number(state.page)>1)p.set('page',state.page);history.replaceState(null,'','/cross-coordination?'+p);}
function safeSource(value){try{const u=new URL(value);return u.origin==='https://vnet.feishu.cn'&&!u.username&&!u.password?u:null;}catch{return null;}}
function label(v){return v==='__empty__'?'未分类':v.replace(/\s*\n\s*/g,'');}
function setOptions(){for(const key of ['primary','region','architecture','level']){
 const select=$('filters').elements[key],items=groups(feed.records,key);select.innerHTML=`<option value="">全部</option>${items.map(g=>`<option value="${esc(g.id)}">${esc(g.id==='__empty__'&&key!=='primary'?'未标注':label(g.id))}</option>`).join('')}`;select.value=state[key];if(!select.value&&state[key]){state[key]='';}
 }$('filters').elements.sort.value=state.sort;}
function render(){editor?.sync();const records=feed.records,ready=feed.updatedAt!=null||feed.state==='ready'||feed.state==='partial';
 const source=safeSource(feed.sourceUrl);if(source){$('sourceLink').href=source.href;$('sourceLink').hidden=false;}
 $('refresh').disabled=busy;$('refresh').setAttribute('aria-busy',String(busy));
 const time=feed.updatedAt?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(feed.updatedAt)):'';
 $('syncStatus').dataset.state=feed.state;$('syncStatus').textContent=busy?(ready?'同步中':'读取中'):feed.state==='error'?'读取失败':feed.state==='partial'?'更新失败':time?time:'未读取';
 $('syncStatus').title=time?'更新于 '+time:'';
 $('message').textContent=feed.error||feed.waiting||'';$('message').hidden=!$('message').textContent;
 const filtered=filterMaterials(records,state),orders=Object.fromEntries((feed.fields||[]).filter(f=>f.type==='select').map(f=>[f.key,f.options])),paged=materialListView(filtered,state,orders,collapsedGroups);currentGroupIds=paged.groupIds;state.page=String(paged.page);state.group=paged.group;state.pageSize=String(paged.size);for(const key of viewKeys)$('filters').elements[key].value=state[key];
 $('summary').innerHTML=ready?renderMaterialSummary(filterMaterials(records,{...state,requirement:''}),state.requirement):'<article class="coord-placeholder" aria-busy="true">正在读取物资数据…</article>';
 const categories=groups(filterMaterials(records,{...state,category:''}),'category');
 $('categories').innerHTML=`<button type="button" data-category="" aria-pressed="${!state.category}">${icon('grid')}<span>全部物资</span><b>${categories.reduce((n,g)=>n+g.count,0)}</b></button>${categories.map(g=>`<button type="button" data-category="${esc(g.id)}" aria-pressed="${state.category===g.id}">${icon('box')}<span>${esc(label(g.id))}</span><b>${g.count}</b></button>`).join('')}`;
 const specialties=groups(filterMaterials(records,{...state,specialty:''}),'specialty');
 $('specialties').innerHTML=`<button type="button" data-specialty="" aria-pressed="${!state.specialty}">${icon('grid')}<span>全部专业</span><b>${specialties.reduce((n,g)=>n+g.count,0)}</b></button>${specialties.map(g=>`<button type="button" data-specialty="${esc(g.id)}" aria-pressed="${state.specialty===g.id}">${icon('box')}<span>${esc(g.id==='__empty__'?'未标注':label(g.id))}</span><b>${g.count}</b></button>`).join('')}`;
 $('recordCount').textContent=ready?`${paged.total} 条`:'—';
 $('rows').innerHTML=renderMaterialRows(paged,collapsedGroups);
 const empty=$('empty');empty.hidden=paged.total>0;empty.innerHTML=!ready?(feed.state==='error'?'<strong>物资读取失败</strong><button type="button" data-retry>重试</button>':'<span>正在读取物资…</span>'):records.length===0?'<strong>暂无物资记录</strong>':'<strong>没有匹配的物资</strong><button type="button" data-clear>清空筛选</button>';
 $('pagination').innerHTML=`<span>${paged.visibleTotal?`${collapsedGroups.size?'展开 ':''}${(paged.page-1)*paged.size+1}–${Math.min(paged.page*paged.size,paged.visibleTotal)} / ${paged.visibleTotal} 条`:paged.total?'已全部收起':'0 条'}</span><div><button type="button" data-page="${paged.page-1}" ${paged.page===1?'disabled':''} title="上一页" aria-label="上一页">‹</button><span>${paged.page} / ${paged.pages}</span><button type="button" data-page="${paged.page+1}" ${paged.page===paged.pages?'disabled':''} title="下一页" aria-label="下一页">›</button></div>`;
}
function change(patch){state={...state,...patch,page:'1'};save();render();}
function reset(){state={...state,...Object.fromEntries([...filterKeys,'q'].map(k=>[k,''])),page:'1'};$('search').value='';setOptions();save();render();}
function detail(id,button){const r=feed.records.find(r=>r.id===id);if(!r)return;trigger=button;detailId=id;const source=r.id.startsWith('local:')?null:safeSource(feed.sourceUrl);if(source)source.searchParams.set('record',r.id);
 $('detail').innerHTML=`<header><div><span>${esc(r.category?label(r.category):'未分类')} · ${esc(r.sequence??'—')}</span><h2 id="detailTitle">${esc(r.name?.trim()||'未命名物资')}</h2></div><button type="button" data-close class="coord-icon-button" title="关闭详情" aria-label="关闭详情">${icon('close')}</button></header><div class="coord-detail-body">${[...new Set(materialFields.map(f=>f.group))].map(group=>`<section><h3>${group}</h3><dl>${materialFields.filter(f=>f.group===group).map(f=>{const v=r[f.key],value=f.type==='number'?(/Amount|Price/.test(f.key)?money(v):number(v)):Array.isArray(v)?v.join('；'):v||'—';return `<div${f.key==='guidance'?' class="coord-wide"':''}><dt>${f.label}</dt><dd>${esc(value)}</dd></div>`;}).join('')}</dl></section>`).join('')}</div><footer>${source?`<a href="${esc(source.href)}" target="_blank" rel="noopener noreferrer">打开飞书记录 ↗</a>`:''}${feed.capabilities?.edit===true?`<button type="button" data-edit-material="${esc(r.id)}">编辑</button>`:''}<button type="button" data-close>关闭</button></footer>`;
 const edit=$('detail').querySelector('[data-edit-material]');if(edit&&r.syncStatus){edit.disabled=true;edit.title='请先在同步任务中完成本次修改。';}
 document.body.classList.add('coord-modal-open');$('detail').showModal();
}
async function load(force=false){if(busy)return;busy=true;const version=++requestVersion,until=Date.now()+60000;feed.error='';feed.waiting='';render();
 try{for(let attempt=0;attempt<35;attempt++){
  if(version!==requestVersion)return;if(Date.now()>=until){feed.waiting='同步尚未结束，请稍后刷新。';return;}
  controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),Math.min(15000,until-Date.now()));let response,result;
  try{response=await fetch('/api/coordination?'+new URLSearchParams({platform:state.platform,...force&&attempt===0?{refresh:'1'}:{}}),{signal:controller.signal,credentials:'same-origin'});result=await response.json();}finally{clearTimeout(deadline);}
  if(version!==requestVersion)return;if(!response.ok||!result.ok)throw Error(response.status===401?'登录已过期，请重新登录。':result.error||'物资读取失败。');
  if(!Array.isArray(result.records))throw Error('物资数据格式无效。');feed=result;setOptions();render();
  if(!feed.refreshing)return;if(attempt===34){feed.waiting='同步尚未结束，请稍后刷新。';return;}await pause(1500);
 }}catch(error){if(version===requestVersion){feed={...feed,state:feed.updatedAt?'partial':'error',error:error.name==='AbortError'?'读取超时，请重试。':error.message};}}
 finally{if(version===requestVersion){busy=false;render();}}
}
$('platformHeader').innerHTML=renderPlatformHeader('coordination');$('search').value=state.q;
$('refresh').addEventListener('click',()=>load(true));$('search').addEventListener('input',()=>change({q:$('search').value}));$('reset').addEventListener('click',reset);
$('filters').addEventListener('submit',e=>e.preventDefault());$('filters').addEventListener('change',e=>{if([...filterKeys,...viewKeys].includes(e.target.name)){collapsedGroups.clear();change({[e.target.name]:e.target.value});}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-toggle-group')){const id=b.dataset.toggleGroup;collapsedGroups.has(id)?collapsedGroups.delete(id):collapsedGroups.add(id);render();[...$('rows').querySelectorAll('[data-toggle-group]')].find(button=>button.dataset.toggleGroup===id)?.focus({preventScroll:true});}
 if(b.hasAttribute('data-groups')){if(b.dataset.groups==='expand')collapsedGroups.clear();else currentGroupIds.forEach(id=>collapsedGroups.add(id));state.page='1';render();}
 if(b.hasAttribute('data-specialty'))change({specialty:b.dataset.specialty});
 if(b.hasAttribute('data-category'))change({category:b.dataset.category});
 if(b.hasAttribute('data-requirement')){const value=state.requirement===b.dataset.requirement?'':b.dataset.requirement;change({requirement:value});}
 if(b.hasAttribute('data-level')){const value=state.level===b.dataset.level?'':b.dataset.level;change({level:value});$('filters').elements.level.value=value;}
 if(b.hasAttribute('data-page')){state.page=b.dataset.page;save();render();const heading=document.querySelector('.coord-list-heading h2');heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});}
 if(b.hasAttribute('data-detail'))detail(b.dataset.detail,b);
 if(b.hasAttribute('data-close'))$('detail').close();if(b.hasAttribute('data-clear'))reset();if(b.hasAttribute('data-retry'))load(true);
});
$('detail').addEventListener('close',()=>{document.body.classList.remove('coord-modal-open');const next=trigger?.isConnected?trigger:[...$('rows').querySelectorAll('[data-detail]')].find(b=>b.dataset.detail===detailId)||$('search');next.focus();});
window.addEventListener('popstate',()=>{state=readState();$('search').value=state.q;setOptions();render();});
window.addEventListener('pagehide',()=>{requestVersion++;controller?.abort();});
const editor=createMaterialEditor({getFeed:()=>feed,getState:()=>state,setFeed:value=>{feed={...feed,...value};setOptions();render();},reload:()=>load()});
render();load().then(()=>editor.resume());
